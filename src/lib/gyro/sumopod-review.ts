import OpenAI from "openai";
import { getSumopodModel } from "@/lib/sumopod";
import {
  RUBRIC_V1_QUESTIONS,
  type GyroAnswer,
  type GyroMemory,
  type GyroReviewRequest,
  type GyroReviewResult,
} from "./types";
import { formatGyroGuideForPrompt } from "./store";
import { REVIEW1_FIELD_DEFS, type Review1Result } from "./review1-form";
import {
  buildCrossConsistencyBrief,
  findCoherenceIssues,
} from "./cross-consistency";

const BASE_URL = process.env.SUMOPOD_BASE_URL || "https://ai.sumopod.com/v1";

function getApiKey() {
  return process.env.SUMOPOD_API_KEY || process.env.GEMINI_API_KEY;
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const cleaned = String(raw || "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("Respons model bukan JSON valid.");
  }
}

async function callModel(client: OpenAI, model: string, prompt: string) {
  const response = await client.chat.completions.create({
    model,
    temperature: 0.15,
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });
  return response.choices[0]?.message?.content?.trim() || "";
}

function sharedEvidence(req: GyroReviewRequest) {
  const { context, notes } = req;
  const tagPath =
    [context.p1, context.p2, context.p3].filter(Boolean).join(" | ") ||
    "(dari Task Variables / Layout Summary)";
  const whileTurnsBlock =
    context.whileTurns?.length > 0
      ? context.whileTurns
          .map((t, i) => `While - Turn ${i + 1}: ${t}`)
          .join("\n")
      : "(tidak ada While Turns ter-parse)";
  return `Tag path: ${tagPath}
Multimodal: ${context.multimodal}
Scene: ${context.scene || "(lihat paste)"}
User goal: ${context.userGoal || "(lihat paste)"}
Initial prompt: ${context.initialPrompt || "(lihat paste)"}
Before instructions: ${context.beforeInstructions || "(lihat paste)"}
While instructions: ${context.whileInstructions || "(lihat paste)"}
While turns (skrip tunggu — bandingkan dgn transcript):
${whileTurnsBlock}
After instructions: ${context.afterInstructions || "(lihat paste)"}
After draft (skrip follow-up P3):
${context.afterDraft || "(lihat paste / kosong)"}

TASK VARIABLES:
"""
${context.taskText || "(kosong)"}
"""

LAYOUT SUMMARY (Your Layout Summary dari Outlier — sumber utama skrip turn / after draft):
"""
${context.layoutSummary || "(kosong)"}
"""

TRANSCRIPT:
"""
${context.transcript || "(kosong)"}
"""

Catatan reviewer (opsional):
- DR triggered note: ${notes.deepResearchTriggered}
- Recording complete: ${notes.recordingComplete}
- Issues: ${notes.issues.join(", ") || "(none)"}
- Comments: ${notes.comments || "(kosong)"}`;
}

function buildDualPrompt(req: GyroReviewRequest, memory: GyroMemory) {
  const review1Spec = REVIEW1_FIELD_DEFS.map((f) => {
    const flags = [
      f.multi ? "multi-select" : "",
      f.freeText ? "free-text" : "",
    ]
      .filter(Boolean)
      .join(", ");
    return `- ${f.id} | ${f.title}${flags ? ` [${flags}]` : ""}
  Prompt EN: ${f.promptEn}
  Arti ID: ${f.explainId}
  Options: ${f.options.join(" | ")}`;
  }).join("\n");

  const review2Spec = RUBRIC_V1_QUESTIONS.map(
    (q) => `${q.id}: ${q.label}`,
  ).join("\n");

  return `Anda adalah reviewer Gyro Accordion / Gemini Live Deep Research (rater Indonesia).
Hasilkan DUA output terpisah dalam SATU JSON. Review1 dan Review2 harus SATU cerita yang koheren.

${formatGyroGuideForPrompt(memory)}

${sharedEvidence(req)}

${buildCrossConsistencyBrief(req.context, req.notes)}

## OUTPUT REVIEW 1 — Product quality form (Avalanch / Outlier)
Isi form berikut persis seperti Outlier. Untuk setiap field:
- rating: SALAH SATU opsi resmi (kecuali free text / multi-select)
- explanationId: penjelasan singkat Bahasa Indonesia (1–3 kalimat) merujuk bukti transcript/layout/task
- multi-select: beberapa opsi dipisah "; "
- free-text: isi rating dengan teks penjelasan lengkap (Bahasa Indonesia)

Khusus deep_research_triggered: Yes | No.
Catatan resmi: jika No, itu BUKAN otomatis fail — field lain tetap dinilai adil.

Urutan form Outlier: DR triggered → (1)–(15) → Quality check → Grammar check → (16)–(24) → (26)/(26.b) → (30).
Khusus (15) Response Depth: skala 1–5 (1=Very Poor, 3=Adequate, 5=Excellent).

Field Review 1:
- deep_research_triggered: Yes | No
- deep_research_note_id: penjelasan singkat ID
${review1Spec}
- quality_check_accurate: Yes | No — Yes hanya jika grounded & tidak kontradiksi lintas field
- grammar_check: Yes | No — ejaan/grammar bersih

## OUTPUT REVIEW 2 — Workflow Q1–Q22
Jawab SEMUA Q1–Q22 deskriptif Bahasa Indonesia (jangan semua unknown jika ada bukti).
Setiap jawaban wajib selaras dengan rating Review 1 terkait (lihat matriks).
${review2Spec}

Aturan penting:
1. Grounded pada Task Variables + Layout Summary + Transcript (+ notes). Jangan mengarang bukti recording.
2. Layout Summary: bandingkan While Turns + After Draft vs transcript; sebutkan turn yang hilang/beda.
3. Review1 ↔ Review2 HARUS konsisten (DR, goal, P1/P2/P3, multimodal/visual, kepuasan).
4. Q12/Q21 dan field video-murni boleh "perlu cek recording" jika notes kosong.
5. Q10 = DR requested; Q11 + R1 DR = triggered — jangan dicampur.
6. Rating Review1 pakai opsi resmi; explanationId spesifik (kutip frasa / nomor while turn bila relevan).

JSON WAJIB:
{
  "review1": {
    "deepResearchTriggered": "Yes"|"No",
    "deepResearchNoteId": "...",
    "fields": [
      {"id":"ui_usability","rating":"No Issues","explanationId":"..."},
      ...
    ],
    "qualityCheckAccurate": "Yes",
    "grammarCheck": "Yes"
  },
  "review2": {
    "summary": "...",
    "answers": [
      {"id":"Q1","label":"...","value":"..."}
    ]
  }
}`;
}

function normalizeReview1(parsed: Record<string, unknown>): Review1Result {
  const r1 = (parsed.review1 || parsed.Review1 || {}) as Record<string, unknown>;
  const byId = new Map<string, { rating: string; explanationId: string }>();
  const fieldsRaw = Array.isArray(r1.fields) ? r1.fields : [];
  for (const row of fieldsRaw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = String(o.id || "").trim();
    if (!id) continue;
    byId.set(id, {
      rating: String(o.rating || o.value || "").trim(),
      explanationId: String(
        o.explanationId || o.explanation || o.explainId || o.comment || "",
      ).trim(),
    });
  }

  // Also accept flat keys
  for (const def of REVIEW1_FIELD_DEFS) {
    if (byId.has(def.id)) continue;
    const flat = r1[def.id];
    if (typeof flat === "string") {
      byId.set(def.id, { rating: flat, explanationId: "" });
    } else if (flat && typeof flat === "object") {
      const o = flat as Record<string, unknown>;
      byId.set(def.id, {
        rating: String(o.rating || o.value || "").trim(),
        explanationId: String(o.explanationId || o.explanation || "").trim(),
      });
    }
  }

  const drRaw = String(
    r1.deepResearchTriggered || r1.deep_research_triggered || "",
  ).toLowerCase();
  const deepResearchTriggered: "Yes" | "No" = drRaw.startsWith("y")
    ? "Yes"
    : "No";

  return {
    deepResearchTriggered,
    deepResearchNoteId:
      String(r1.deepResearchNoteId || r1.deep_research_note_id || "").trim() ||
      (deepResearchTriggered === "Yes"
        ? "Deep Research terpicu menurut bukti di transcript."
        : "Deep Research tidak terpicu — ini bukan otomatis fail."),
    fields: REVIEW1_FIELD_DEFS.map((def) => {
      const hit = byId.get(def.id);
      return {
        ...def,
        rating: hit?.rating || "(belum diisi model)",
        explanationId:
          hit?.explanationId ||
          "Model tidak memberi penjelasan — cek manual dari transcript.",
      };
    }),
    qualityCheckAccurate:
      String(r1.qualityCheckAccurate || "Yes").toLowerCase().startsWith("n")
        ? "No"
        : "Yes",
    grammarCheck:
      String(r1.grammarCheck || "Yes").toLowerCase().startsWith("n")
        ? "No"
        : "Yes",
  };
}

function normalizeReview2(parsed: Record<string, unknown>): {
  summary: string;
  answers: GyroAnswer[];
} {
  const r2 = (parsed.review2 || parsed.Review2 || parsed) as Record<
    string,
    unknown
  >;
  const map = new Map<string, string>();
  const answersRaw = Array.isArray(r2.answers) ? r2.answers : [];
  for (const row of answersRaw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = String(o.id || "").trim().toUpperCase();
    const value = String(o.value || o.answer || "").trim();
    if (id && value) map.set(id, value);
  }
  for (const q of RUBRIC_V1_QUESTIONS) {
    const top = r2[q.id];
    if (typeof top === "string" && top.trim()) map.set(q.id, top.trim());
  }
  const answers = RUBRIC_V1_QUESTIONS.map((q) => ({
    id: q.id,
    label: q.label,
    value:
      map.get(q.id) ||
      (q.id === "Q12" || q.id === "Q21"
        ? "Perlu konfirmasi dari recording (reviewer manual)."
        : "Model tidak mengembalikan jawaban — Generate ulang / lengkapi manual."),
  }));
  return {
    summary:
      String(r2.summary || parsed.summary || "").trim() ||
      "Ringkasan Review 2 tidak tersedia.",
    answers,
  };
}

function formatReview1(r: Review1Result): string {
  const lines: string[] = [];
  lines.push("=== OUTPUT REVIEW 1 — Product Quality Form ===");
  lines.push("");
  lines.push("Deep research was triggered? (jika No, BUKAN otomatis fail)");
  lines.push(`Jawaban: ${r.deepResearchTriggered}`);
  lines.push(`Penjelasan: ${r.deepResearchNoteId}`);
  lines.push("");
  for (const f of r.fields) {
    lines.push(f.title);
    if (f.promptEn) lines.push(`Prompt: ${f.promptEn}`);
    lines.push(`Arti: ${f.explainId}`);
    if (f.id === "response_depth") {
      lines.push("Skala: 1 Very Poor / 3 Adequate / 5 Excellent");
    } else {
      lines.push(`Opsi resmi: ${f.options.join(" / ")}`);
    }
    lines.push(`Pilihan: ${f.rating}`);
    lines.push(`Penjelasan ID: ${f.explanationId}`);
    lines.push("");
    if (f.id === "response_depth") {
      lines.push("Quality check 1 — jawaban akurat berbasis video/transcript?");
      lines.push(`Jawaban: ${r.qualityCheckAccurate}`);
      lines.push("");
      lines.push("Grammar check 1 — ejaan/grammar bersih?");
      lines.push(`Jawaban: ${r.grammarCheck}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function formatReview2(summary: string, answers: GyroAnswer[]): string {
  const lines = [
    "=== OUTPUT REVIEW 2 — Workflow Q1–Q22 ===",
    "",
    "Summary:",
    summary,
    "",
    ...answers.flatMap((a) => [`${a.id}. ${a.label}`, a.value, ""]),
  ];
  return lines.join("\n");
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
  if (!req.context.taskText?.trim() || !req.context.transcript?.trim()) {
    throw new Error("Task Variables dan Transcript wajib diisi.");
  }

  const model = getSumopodModel();
  const client = new OpenAI({ apiKey, baseURL: BASE_URL });
  const prompt = buildDualPrompt(req, memory);

  let text = await callModel(client, model, prompt);
  if (!text) throw new Error("Model tidak mengembalikan hasil review.");

  let parsed: Record<string, unknown>;
  try {
    parsed = extractJsonObject(text);
  } catch {
    text = await callModel(
      client,
      model,
      `${prompt}\n\nULANGI. Output HANYA JSON valid berisi review1 dan review2.`,
    );
    parsed = extractJsonObject(text);
  }

  let review1 = normalizeReview1(parsed);
  let review2 = normalizeReview2(parsed);

  const r1Filled = review1.fields.filter(
    (f) => f.rating && !f.rating.includes("belum diisi"),
  ).length;
  const r2Filled = review2.answers.filter(
    (a) =>
      a.value &&
      !/^Model tidak mengembalikan/i.test(a.value) &&
      !/^Tidak cukup bukti/i.test(a.value),
  ).length;

  if (r1Filled < 8 || r2Filled < 8) {
    text = await callModel(
      client,
      model,
      `${prompt}\n\nPERBAIKAN: review1 fields terisi ${r1Filled}/${REVIEW1_FIELD_DEFS.length}, review2 ${r2Filled}/22. Isi SEMUA field dengan bukti transcript.`,
    );
    parsed = extractJsonObject(text);
    review1 = normalizeReview1(parsed);
    review2 = normalizeReview2(parsed);
  }

  const coherence = findCoherenceIssues(
    req.context,
    review1,
    review2.answers,
  );
  if (coherence.length > 0) {
    text = await callModel(
      client,
      model,
      `${prompt}

PERBAIKAN KOHERENSI (wajib perbaiki sebelum output final):
${coherence.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Kembalikan JSON review1+review2 lengkap yang sudah saling selaras.`,
    );
    parsed = extractJsonObject(text);
    review1 = normalizeReview1(parsed);
    review2 = normalizeReview2(parsed);
  }

  const formatted1 = formatReview1(review1);
  const formatted2 = formatReview2(review2.summary, review2.answers);

  return {
    summary: review2.summary,
    answers: review2.answers,
    review1: { ...review1, formatted: formatted1 },
    review2: { ...review2, formatted: formatted2 },
    json: {
      review1,
      review2,
      tagPath: [req.context.p1, req.context.p2, req.context.p3]
        .filter(Boolean)
        .join(" | "),
      coherenceChecked: true,
      coherenceIssuesFixed: coherence,
    },
  };
}
