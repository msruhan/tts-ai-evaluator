import OpenAI from "openai";
import { getSumopodModel } from "@/lib/sumopod";
import { formatGyroGuideForPrompt } from "./store";
import {
  RUBRIC_V1_QUESTIONS,
  RUBRIC_V2_FIELDS,
  type GyroAnswer,
  type GyroMemory,
  type GyroReviewerNotes,
  type GyroReviewResult,
  type GyroTaskContext,
} from "./types";

const BASE_URL = process.env.SUMOPOD_BASE_URL || "https://ai.sumopod.com/v1";

function getApiKey() {
  return process.env.SUMOPOD_API_KEY || process.env.GEMINI_API_KEY;
}

export type GyroChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type GyroChatResponse = {
  reply: string;
  proposeUpdate: boolean;
  summary?: string;
  answers?: GyroAnswer[];
};

const chatJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: { type: "string" },
    proposeUpdate: { type: "boolean" },
    summary: { type: "string" },
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          value: { type: "string" },
        },
        required: ["id", "label", "value"],
      },
    },
  },
  required: ["reply", "proposeUpdate", "summary", "answers"],
} as const;

function contextBrief(context: GyroTaskContext, notes: GyroReviewerNotes) {
  return `Task snapshot:
- Tags: ${[context.p1, context.p2, context.p3].filter(Boolean).join(" | ") || "(none)"}
- Multimodal: ${context.multimodal}
- Scene: ${context.scene || "-"}

FULL Task Variables paste:
"""
${(context.taskText || "").slice(0, 12000) || "(empty)"}
"""

Transcript (excerpt):
"""
${(context.transcript || "").slice(0, 6000) || "(empty)"}
"""

Reviewer notes (optional):
- DR requested/phrase/triggered: ${notes.deepResearchRequested}/${notes.deepResearchPhraseSpoken}/${notes.deepResearchTriggered}
- Issues: ${notes.issues.join(", ") || "(none)"}
- Comments: ${notes.comments || "(empty)"}`;
}

function currentAnswersBlock(result: GyroReviewResult | null) {
  if (!result) return "Current answers: (belum di-generate)";
  const lines = result.answers
    .map((a) => `${a.id} | ${a.label}: ${a.value}`)
    .join("\n");
  return `Current summary:\n${result.summary}\n\nCurrent answers:\n${lines}`;
}

function normalizeProposed(
  version: "v1" | "v2",
  current: GyroReviewResult | null,
  summary: string | undefined,
  answers: GyroAnswer[] | undefined,
): { summary: string; answers: GyroAnswer[] } | null {
  if (!answers?.length && !summary?.trim()) return null;
  const catalog = version === "v1" ? RUBRIC_V1_QUESTIONS : RUBRIC_V2_FIELDS;
  const byId = new Map((answers || []).map((a) => [a.id, a]));
  const baseById = new Map((current?.answers || []).map((a) => [a.id, a]));
  const merged = catalog.map((item) => {
    const hit = byId.get(item.id) || baseById.get(item.id);
    return {
      id: item.id,
      label: hit?.label || item.label,
      value: (hit?.value || "Tidak cukup bukti / unknown").trim(),
    };
  });
  return {
    summary: (summary || current?.summary || "").trim(),
    answers: merged,
  };
}

export async function chatWithGyroReviewer(input: {
  message: string;
  history: GyroChatMessage[];
  context: GyroTaskContext;
  notes: GyroReviewerNotes;
  result: GyroReviewResult | null;
  memory: GyroMemory;
}): Promise<GyroChatResponse> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "SUMOPOD_API_KEY belum diisi (atau GEMINI_API_KEY sebagai fallback).",
    );
  }

  const client = new OpenAI({ apiKey, baseURL: BASE_URL });
  const system = `You are a Gyro Accordion Deep Research review co-pilot for an Indonesian reviewer.
Help discuss the current task and current draft answers.
Stay grounded in the provided task context, transcript, notes, and current answers. Do not invent recording evidence.

${formatGyroGuideForPrompt(input.memory)}

When the reviewer asks to change answers (or clearly corrects a field), set proposeUpdate=true and return the FULL updated summary + FULL answers list (all rubric ids).
When only asking a question / clarification, set proposeUpdate=false and return empty summary "" and empty answers [].
Reply in Bahasa Indonesia. Be concise and practical.

JSON fields:
- reply: your chat reply to the reviewer
- proposeUpdate: boolean
- summary: updated summary if proposing, else ""
- answers: full updated answers if proposing, else []`;

  const userBlock = `${contextBrief(input.context, input.notes)}

${currentAnswersBlock(input.result)}

Rubric version: ${input.context.rubricVersion}

Reviewer message:
"""
${input.message}
"""`;

  const historyMsgs = (input.history || [])
    .slice(-12)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const response = await client.chat.completions.create({
    model: getSumopodModel(),
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      ...historyMsgs,
      { role: "user", content: userBlock },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "gyro_chat",
        strict: true,
        schema: chatJsonSchema,
      },
    },
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("Model tidak mengembalikan balasan chat.");

  const parsed = JSON.parse(text) as {
    reply?: string;
    proposeUpdate?: boolean;
    summary?: string;
    answers?: GyroAnswer[];
  };

  const reply = String(parsed.reply || "").trim() || "(kosong)";
  const proposeUpdate = Boolean(parsed.proposeUpdate);
  if (!proposeUpdate) {
    return { reply, proposeUpdate: false };
  }

  const merged = normalizeProposed(
    input.context.rubricVersion,
    input.result,
    parsed.summary,
    parsed.answers,
  );
  if (!merged?.answers.length) {
    return { reply, proposeUpdate: false };
  }

  return {
    reply,
    proposeUpdate: true,
    summary: merged.summary,
    answers: merged.answers,
  };
}
