import OpenAI from "openai";
import { getSumopodModel } from "@/lib/sumopod";
import {
  buildCrossConsistencyBrief,
} from "./cross-consistency";
import { REVIEW1_FIELD_DEFS, type Review1Result } from "./review1-form";
import { formatGyroGuideForPrompt } from "./store";
import {
  RUBRIC_V1_QUESTIONS,
  type ChatFormTarget,
  type GyroAnswer,
  type GyroMemory,
  type GyroReviewerNotes,
  type GyroReviewResult,
  type GyroTaskContext,
} from "./types";

const BASE_URL = process.env.SUMOPOD_BASE_URL || "https://ai.sumopod.com/v1";

export type { ChatFormTarget };

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
  target: ChatFormTarget;
  /** Review 2 patch */
  summary?: string;
  answers?: GyroAnswer[];
  /** Review 1 patch */
  review1?: Review1Result;
};

function contextBrief(context: GyroTaskContext, notes: GyroReviewerNotes) {
  return `Task snapshot:
- Tags: ${[context.p1, context.p2, context.p3].filter(Boolean).join(" | ") || "(none)"}
- Multimodal: ${context.multimodal}
- Scene: ${context.scene || "-"}

FULL Task Variables paste:
"""
${(context.taskText || "").slice(0, 12000) || "(empty)"}
"""

Layout Summary:
"""
${(context.layoutSummary || "").slice(0, 8000) || "(empty)"}
"""

While turns: ${(context.whileTurns || []).map((t, i) => `T${i + 1}=${t}`).join(" | ") || "(none)"}
After draft: ${(context.afterDraft || "").slice(0, 1500) || "(empty)"}

Transcript (excerpt):
"""
${(context.transcript || "").slice(0, 6000) || "(empty)"}
"""

Reviewer notes:
- DR: ${notes.deepResearchRequested}/${notes.deepResearchPhraseSpoken}/${notes.deepResearchTriggered}
- Issues: ${notes.issues.join(", ") || "(none)"}
- Comments: ${notes.comments || "(empty)"}`;
}

function currentReview2Block(result: GyroReviewResult | null) {
  if (!result) return "Current Review 2: (belum di-generate)";
  const src = result.review2 || {
    summary: result.summary,
    answers: result.answers,
  };
  const lines = (src.answers || [])
    .map((a) => `${a.id} | ${a.label}: ${a.value}`)
    .join("\n");
  return `Current Review 2 summary:\n${src.summary || "(empty)"}\n\nCurrent Review 2 answers:\n${lines || "(empty)"}`;
}

function currentReview1Block(result: GyroReviewResult | null) {
  const r1 = result?.review1;
  if (!r1) return "Current Review 1: (belum di-generate)";
  const lines = r1.fields
    .map(
      (f) =>
        `${f.id} | ${f.title}\n  rating: ${f.rating}\n  explanationId: ${f.explanationId}`,
    )
    .join("\n");
  return `Current Review 1:
deepResearchTriggered: ${r1.deepResearchTriggered}
deepResearchNoteId: ${r1.deepResearchNoteId}
qualityCheckAccurate: ${r1.qualityCheckAccurate}
grammarCheck: ${r1.grammarCheck}

Fields:
${lines}`;
}

function review1CatalogBlock() {
  return REVIEW1_FIELD_DEFS.map(
    (f) =>
      `- ${f.id} | ${f.title}\n  Options: ${f.options.join(" | ")}${f.freeText ? " [free-text]" : ""}${f.multi ? " [multi]" : ""}`,
  ).join("\n");
}

function normalizeReview2Proposed(
  current: GyroReviewResult | null,
  summary: string | undefined,
  answers: GyroAnswer[] | undefined,
): { summary: string; answers: GyroAnswer[] } | null {
  if (!answers?.length && !summary?.trim()) return null;
  const base =
    current?.review2?.answers || current?.answers || [];
  const byId = new Map((answers || []).map((a) => [a.id, a]));
  const baseById = new Map(base.map((a) => [a.id, a]));
  const merged = RUBRIC_V1_QUESTIONS.map((item) => {
    const hit = byId.get(item.id) || baseById.get(item.id);
    return {
      id: item.id,
      label: hit?.label || item.label,
      value: (hit?.value || "Tidak cukup bukti / unknown").trim(),
    };
  });
  return {
    summary: (
      summary ||
      current?.review2?.summary ||
      current?.summary ||
      ""
    ).trim(),
    answers: merged,
  };
}

function normalizeReview1Proposed(
  current: GyroReviewResult | null,
  raw: Record<string, unknown> | undefined,
): Review1Result | null {
  if (!raw || typeof raw !== "object") return null;
  const base = current?.review1;
  const byId = new Map<string, { rating: string; explanationId: string }>();
  const fieldsRaw = Array.isArray(raw.fields) ? raw.fields : [];
  for (const row of fieldsRaw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = String(o.id || "").trim();
    if (!id) continue;
    byId.set(id, {
      rating: String(o.rating || o.value || "").trim(),
      explanationId: String(
        o.explanationId || o.explanation || o.comment || "",
      ).trim(),
    });
  }
  if (!byId.size && !String(raw.deepResearchTriggered || "").trim()) {
    return null;
  }

  const drRaw = String(
    raw.deepResearchTriggered || base?.deepResearchTriggered || "",
  ).toLowerCase();
  const deepResearchTriggered: "Yes" | "No" = drRaw.startsWith("y")
    ? "Yes"
    : "No";

  const fields = REVIEW1_FIELD_DEFS.map((def) => {
    const hit = byId.get(def.id);
    const prev = base?.fields.find((f) => f.id === def.id);
    return {
      ...def,
      rating: hit?.rating || prev?.rating || "(belum diisi)",
      explanationId:
        hit?.explanationId ||
        prev?.explanationId ||
        "Belum ada penjelasan.",
    };
  });

  return {
    deepResearchTriggered,
    deepResearchNoteId:
      String(raw.deepResearchNoteId || "").trim() ||
      base?.deepResearchNoteId ||
      (deepResearchTriggered === "Yes"
        ? "Deep Research terpicu menurut bukti."
        : "Deep Research tidak terpicu — bukan otomatis fail."),
    fields,
    qualityCheckAccurate: String(
      raw.qualityCheckAccurate || base?.qualityCheckAccurate || "Yes",
    )
      .toLowerCase()
      .startsWith("n")
      ? "No"
      : "Yes",
    grammarCheck: String(raw.grammarCheck || base?.grammarCheck || "Yes")
      .toLowerCase()
      .startsWith("n")
      ? "No"
      : "Yes",
  };
}

export async function chatWithGyroReviewer(input: {
  message: string;
  history: GyroChatMessage[];
  context: GyroTaskContext;
  notes: GyroReviewerNotes;
  result: GyroReviewResult | null;
  memory: GyroMemory;
  target: ChatFormTarget;
}): Promise<GyroChatResponse> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "SUMOPOD_API_KEY belum diisi (atau GEMINI_API_KEY sebagai fallback).",
    );
  }

  const target = input.target === "review1" ? "review1" : "review2";
  const client = new OpenAI({ apiKey, baseURL: BASE_URL });

  const targetRules =
    target === "review1"
      ? `TARGET FORM: Review 1 (product quality form saja).
JANGAN ubah Review 2 / Q1–Q22.
Jika reviewer minta koreksi, set proposeUpdate=true dan kembalikan review1 lengkap (deepResearchTriggered, deepResearchNoteId, fields[], qualityCheckAccurate, grammarCheck).
fields harus mencakup SEMUA id katalog; field yang tidak dikoreksi salin dari current.
rating harus opsi resmi (kecuali free-text / multi dengan "; ").
Jika hanya tanya, proposeUpdate=false dan review1 = null.

JSON:
{
  "reply": "...",
  "proposeUpdate": true|false,
  "review1": {
    "deepResearchTriggered":"Yes"|"No",
    "deepResearchNoteId":"...",
    "fields":[{"id":"...","rating":"...","explanationId":"..."}],
    "qualityCheckAccurate":"Yes"|"No",
    "grammarCheck":"Yes"|"No"
  } | null
}

Katalog Review 1:
${review1CatalogBlock()}`
      : `TARGET FORM: Review 2 (Q1–Q22 workflow saja).
JANGAN ubah Review 1 form.
Jika reviewer minta koreksi, set proposeUpdate=true dan kembalikan FULL summary + FULL answers (semua Q1–Q22).
Jika hanya tanya, proposeUpdate=false, summary="", answers=[].

JSON:
{
  "reply": "...",
  "proposeUpdate": true|false,
  "summary": "...",
  "answers": [{"id":"Q1","label":"...","value":"..."}]
}`;

  const system = `You are a Gyro Accordion Deep Research review co-pilot for an Indonesian reviewer.
Help discuss the current task and draft answers for ONE selected form only.
Stay grounded in task context, transcript, notes, and current answers. Do not invent recording evidence.
When proposing updates, keep internal field consistency and stay aligned with the OTHER form (read-only reference) — do not invent contradictions.

${formatGyroGuideForPrompt(input.memory)}

${buildCrossConsistencyBrief(input.context, input.notes)}

${targetRules}

Reply in Bahasa Indonesia. Be concise and practical.`;

  const otherFormHint =
    target === "review1"
      ? currentReview2Block(input.result)
      : currentReview1Block(input.result);

  const currentBlock =
    target === "review1"
      ? currentReview1Block(input.result)
      : currentReview2Block(input.result);

  const userBlock = `${contextBrief(input.context, input.notes)}

${currentBlock}

FORM LAIN (read-only — jangan diubah, tapi jaga agar usulan tidak bertentangan):
${otherFormHint}

Reviewer message:
"""
${input.message}
"""`;

  const historyMsgs = (input.history || []).slice(-12).map((m) => ({
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
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("Model tidak mengembalikan balasan chat.");

  const parsed = JSON.parse(text) as Record<string, unknown>;
  const reply = String(parsed.reply || "").trim() || "(kosong)";
  const proposeUpdate = Boolean(parsed.proposeUpdate);

  if (!proposeUpdate) {
    return { reply, proposeUpdate: false, target };
  }

  if (target === "review1") {
    const review1 = normalizeReview1Proposed(
      input.result,
      (parsed.review1 || parsed.Review1) as Record<string, unknown> | undefined,
    );
    if (!review1) {
      return { reply, proposeUpdate: false, target };
    }
    return { reply, proposeUpdate: true, target, review1 };
  }

  const answersRaw = Array.isArray(parsed.answers)
    ? (parsed.answers as GyroAnswer[])
    : undefined;
  const merged = normalizeReview2Proposed(
    input.result,
    typeof parsed.summary === "string" ? parsed.summary : undefined,
    answersRaw,
  );
  if (!merged?.answers.length) {
    return { reply, proposeUpdate: false, target };
  }
  return {
    reply,
    proposeUpdate: true,
    target,
    summary: merged.summary,
    answers: merged.answers,
  };
}
