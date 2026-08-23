import OpenAI from "openai";
import { getSumopodModel } from "@/lib/sumopod";
import {
  RUBRIC_V1_QUESTIONS,
  RUBRIC_V2_FIELDS,
  type GyroAnswer,
  type GyroMemory,
  type GyroReviewRequest,
  type GyroReviewResult,
} from "./types";
import { formatGyroGuideForPrompt } from "./store";

const BASE_URL = process.env.SUMOPOD_BASE_URL || "https://ai.sumopod.com/v1";

function getApiKey() {
  return process.env.SUMOPOD_API_KEY || process.env.GEMINI_API_KEY;
}

const reviewJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
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
  required: ["summary", "answers"],
} as const;

function rubricBlock(version: "v1" | "v2") {
  if (version === "v1") {
    const qs = RUBRIC_V1_QUESTIONS.map((q) => `- ${q.id}: ${q.label}`).join("\n");
    return `Rubric Version 1 (Q1–Q22 Gyro Accordion workflow). Answer EVERY item with descriptive reviewer prose (Bahasa Indonesia):\n${qs}`;
  }
  const fields = RUBRIC_V2_FIELDS.map((f) => `- ${f.id}: ${f.label}`).join("\n");
  return `Rubric Version 2 (product quality). Score/comment EVERY field:\n${fields}`;
}

function buildPrompt(req: GyroReviewRequest, memory: GyroMemory) {
  const { context, notes } = req;
  const issues =
    notes.issues.length > 0 ? notes.issues.join(", ") : "(none selected)";
  const tagPath =
    [context.p1, context.p2, context.p3].filter(Boolean).join(" | ") ||
    "(parse from task paste if present)";

  return `You are a Gyro Accordion: Deep Research Evaluation reviewer (Indonesian rater).
Evaluate how Gemini Live executed complex research across P1 BEFORE, P2 WHILE, P3 AFTER.
Stay grounded. Never invent evidence. Descriptive answers — no one-word Yes/No without explanation.
The primary source of task definition is the pasted Task Variables block. Parse multimodal, scene, P1/P2/P3 tags, initial prompt, user goal, and before/while/after instructions from it.
If reviewer notes are empty/unknown, infer only what the transcript clearly supports; otherwise mark unknown / insufficient evidence (reviewer will fill manually).

${formatGyroGuideForPrompt(memory)}

${rubricBlock(context.rubricVersion)}

Parsed hints (may be incomplete — prefer Task Variables paste if conflict):
- Language: Bahasa Indonesia (fixed)
- Tag path: ${tagPath}
- Multimodal: ${context.multimodal}
- Scene: ${context.scene || "(see paste)"}

FULL Task Variables paste:
"""
${context.taskText || "(empty)"}
"""

Transcript:
"""
${context.transcript || "(empty)"}
"""

Optional reviewer notes (manual — may be sparse):
- Deep Research requested: ${notes.deepResearchRequested}
- Deep Research phrase spoken / regex met: ${notes.deepResearchPhraseSpoken}
- Deep Research triggered: ${notes.deepResearchTriggered}
- Captions / transcription visible: ${notes.captionsVisible}
- Visual overlay used: ${notes.visualOverlayUsed}
- Personalization observed: ${notes.personalizationObserved}
- Recording complete: ${notes.recordingComplete}
- Comments match recording (Golden Rule): ${notes.commentsMatchRecording}
- Issue toggles: ${issues}
- Comments: ${notes.comments || "(empty)"}
- Corrections: ${notes.corrections || "(empty)"}

Return JSON only with:
- summary: 3–6 sentence Indonesian reviewer summary
- answers: array of {id, label, value} covering EVERY rubric item for the selected version.
Value must be descriptive and copy-paste ready.`;
}

function normalizeAnswers(
  version: "v1" | "v2",
  answers: GyroAnswer[] | undefined,
): GyroAnswer[] {
  const catalog = version === "v1" ? RUBRIC_V1_QUESTIONS : RUBRIC_V2_FIELDS;
  const byId = new Map((answers || []).map((a) => [a.id, a]));
  return catalog.map((item) => {
    const hit = byId.get(item.id);
    return {
      id: item.id,
      label: hit?.label || item.label,
      value: (hit?.value || "Tidak cukup bukti / unknown").trim(),
    };
  });
}

export async function reviewWithSumopod(
  req: GyroReviewRequest,
  memory: GyroMemory,
): Promise<GyroReviewResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "SUMOPOD_API_KEY belum diisi (atau GEMINI_API_KEY sebagai fallback).",
    );
  }

  const model = getSumopodModel();
  const client = new OpenAI({ apiKey, baseURL: BASE_URL });
  const prompt = buildPrompt(req, memory);

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: prompt },
  ];
  if (req.imageDataUrl?.startsWith("data:image")) {
    content.unshift({
      type: "image_url",
      image_url: { url: req.imageDataUrl, detail: "high" },
    });
  }

  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [{ role: "user", content }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "gyro_review",
        strict: true,
        schema: reviewJsonSchema,
      },
    },
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("Model tidak mengembalikan hasil review.");

  const parsed = JSON.parse(text) as {
    summary?: string;
    answers?: GyroAnswer[];
  };

  const answers = normalizeAnswers(req.context.rubricVersion, parsed.answers);
  const summary = String(parsed.summary || "").trim() || "Tidak ada ringkasan.";
  const json: Record<string, unknown> = {
    rubricVersion: req.context.rubricVersion,
    tagPath: [req.context.p1, req.context.p2, req.context.p3]
      .filter(Boolean)
      .join(" | "),
    summary,
    answers,
  };
  for (const a of answers) json[a.id] = a.value;

  return { summary, answers, json };
}
