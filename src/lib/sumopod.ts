import OpenAI from "openai";
import type {
  EvalLanguage,
  EvaluationResult,
  LanguageErrorNotes,
} from "./types";
import { languageErrorLabel, RATIONALE_LOCAL_LABEL } from "./types";

const DEFAULT_MODEL = "gemini/gemini-3.5-flash";
const BASE_URL = process.env.SUMOPOD_BASE_URL || "https://ai.sumopod.com/v1";

const evaluationJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    audio_and_recording_quality: {
      type: "string",
      enum: ["A_BETTER", "B_BETTER", "BOTH_BAD", "BOTH_GOOD"],
    },
    pronunciation_faithfulness: {
      type: "string",
      enum: ["A_BETTER", "B_BETTER", "BOTH_BAD", "BOTH_GOOD"],
    },
    pacing: {
      type: "string",
      enum: ["A_BETTER", "B_BETTER"],
    },
    intonation: {
      type: "string",
      enum: ["A_BETTER", "B_BETTER"],
    },
    persona_likeness: {
      type: "string",
      enum: ["A_BETTER", "B_BETTER", "BOTH_BAD", "BOTH_GOOD"],
    },
    nativeness: {
      type: "string",
      enum: ["A_BETTER", "B_BETTER", "BOTH_BAD", "BOTH_GOOD"],
    },
    naturalness_overall_preference: {
      type: "string",
      enum: ["A_BETTER", "B_BETTER"],
    },
    rationale_a: { type: "string" },
    rationale_b: { type: "string" },
    justification: { type: "string" },
    rationale_a_id: { type: "string" },
    rationale_b_id: { type: "string" },
    justification_id: { type: "string" },
  },
  required: [
    "audio_and_recording_quality",
    "pronunciation_faithfulness",
    "pacing",
    "intonation",
    "persona_likeness",
    "nativeness",
    "naturalness_overall_preference",
    "rationale_a",
    "rationale_b",
    "justification",
    "rationale_a_id",
    "rationale_b_id",
    "justification_id",
  ],
} as const;

function getApiKey() {
  return process.env.SUMOPOD_API_KEY || process.env.GEMINI_API_KEY;
}

export function getSumopodModel() {
  return (
    process.env.SUMOPOD_MODEL ||
    process.env.GEMINI_MODEL ||
    DEFAULT_MODEL
  );
}

function languageFocusBlock(language: EvalLanguage) {
  if (language === "ms") {
    return `Target spoken language to evaluate: Bahasa Malaysia (Malay).
- Judge pronunciation faithfulness and nativeness against native Malay norms (not Indonesian).
- Prefer Malay-specific word/phrase evidence from the prompt when citing issues.
- IMPORTANT: rationale_*_id / justification_id must still be written in natural Bahasa Indonesia (NOT Malay), matching the English substance.`;
  }
  if (language === "en") {
    return `Target spoken language to evaluate: English.
- Judge pronunciation faithfulness and nativeness against native English norms.
- Prefer English word/phrase evidence from the prompt when citing issues.
- IMPORTANT: rationale_*_id / justification_id must be written in natural Bahasa Indonesia, matching the English substance.`;
  }
  return `Target spoken language to evaluate: Bahasa Indonesia.
- Judge pronunciation faithfulness and nativeness against native Indonesian norms.
- Prefer Indonesian word/phrase evidence from the prompt when citing issues.
- rationale_*_id / justification_id must be written in natural Bahasa Indonesia (same substance as English).`;
}

function formatHumanSignals(
  listenerNote?: string,
  languageErrors?: LanguageErrorNotes,
) {
  const parts: string[] = [];

  if (listenerNote?.trim()) {
    parts.push(`General listener note:\n"""\n${listenerNote.trim()}\n"""`);
  }

  const resolve = (code?: string) => {
    const trimmed = code?.trim();
    if (!trimmed || trimmed === "none") return "";
    return languageErrorLabel(trimmed) || trimmed;
  };

  const ref = resolve(languageErrors?.reference);
  const a = resolve(languageErrors?.audioA);
  const b = resolve(languageErrors?.audioB);
  if (ref || a || b) {
    const lines = [
      ref ? `- REFERENCE VOICE language issue: ${ref}` : null,
      a ? `- AUDIO A language issue: ${a}` : null,
      b ? `- AUDIO B language issue: ${b}` : null,
    ].filter(Boolean);
    parts.push(
      `Language-error notes from the human listener (wrong language, mixed language, language mismatch vs selected target, etc.):\n${lines.join("\n")}`,
    );
  }

  if (!parts.length) return "";

  return `\nHuman listening signals (combine carefully with your own audio-grounded judgment — do not ignore clear audio evidence, but weigh these as useful human input for the final conclusion):\n${parts.join("\n\n")}\n`;
}

function buildPrompt(
  textPrompt: string,
  memoryGuide?: string,
  listenerNote?: string,
  language: EvalLanguage = "id",
  languageErrors?: LanguageErrorNotes,
) {
  const memoryBlock = memoryGuide?.trim()
    ? `\n\n${memoryGuide.trim()}\n`
    : "";

  const humanBlock = formatHumanSignals(listenerNote, languageErrors);
  const localName = RATIONALE_LOCAL_LABEL;

  return `You are a professional Avalanch-style TTS pairwise evaluator.

${languageFocusBlock(language)}

You receive 3 audio files:
1) REFERENCE VOICE — use ONLY for Persona Likeness / Speaker Similarity
2) AUDIO A — TTS sample from model A
3) AUDIO B — TTS sample from model B

Prompt text that should be spoken:
"""
${textPrompt}
"""
${humanBlock}${memoryBlock}
Workflow:
1. Listen to the reference for speaker identity only.
2. Read the prompt text and any human listener / language-error notes.
3. Listen to Audio A fully, then Audio B fully.
4. Score the dimensions below for the selected target language, combining your hearing with human notes when present (especially language-error notes).
5. Write independent rationales (English + ${localName}), pick overall naturalness winner, write justification (English + ${localName}).
6. Recheck consistency before finalizing. If a clip has a confirmed language mismatch/error, reflect that in pronunciation/nativeness/naturalness as appropriate and mention it concretely.

Dimensions & options:
1. audio_and_recording_quality — A_BETTER | B_BETTER | BOTH_BAD | BOTH_GOOD
   (signal only: noise, clipping, distortion, artifacts, compression — ignore pronunciation/naturalness/similarity)
2. pronunciation_faithfulness — A_BETTER | B_BETTER | BOTH_BAD | BOTH_GOOD
   (accurate clear pronunciation vs native norms of the TARGET language / prompt words)
3. pacing — A_BETTER | B_BETTER
   (natural comfortable rhythm; may differ from reference if still natural)
4. intonation — A_BETTER | B_BETTER
   (pitch movement, question contour, emphasis; be specific about flat questions)
5. persona_likeness — A_BETTER | B_BETTER | BOTH_BAD | BOTH_GOOD
   (ONLY dimension that compares to reference: pitch/timbre/style/identity)
6. nativeness — A_BETTER | B_BETTER | BOTH_BAD | BOTH_GOOD
   (native-like impression for the TARGET language; independent from persona likeness)
7. naturalness_overall_preference — A_BETTER | B_BETTER
   (holistic naturalness winner; must be consistent with ratings + tipping point)

Required text fields (bilingual):
- rationale_a: 10–100 words, natural English. That clip alone. No comparison. Do NOT write "Audio A" or "Audio B".
  Do NOT say "the speaker" (ambiguous). Prefer "The sound…", "The delivery…", "The speech…", "The voice…", "This clip…".
  Prefer concrete evidence: timestamps (e.g. near 0:23), specific words/phrases, misheard/mispronounced examples, named intonation issues on particular sentences.
  Style examples: "The sound has good consistent pacing, but mild drift in the voice near 0:23. There were slight background noises in the beginning."; "The intonation could have gone up at [word] instead of going down. The pronunciation of [ABC] sounded stilted."
  Avoid: "The speaker delivers the text…"
- rationale_a_id: same meaning in natural Bahasa Indonesia (10–100 words), same independence + concrete evidence rules. Avoid "pembicara/speaker" as subject; prefer "Suara…", "Penyampaian…", "Ucapan…". Always Indonesian even if the evaluated audio is Malay/English.
- rationale_b / rationale_b_id: same for the other clip.
- justification: 10–50 words, natural English tipping point. Do not name "Audio A/B"; use "the one I picked" / "the other one". Mention the decisive concrete flaw/strength when possible.
- justification_id: same meaning in natural Bahasa Indonesia (10–50 words). Always Indonesian.

English and Bahasa Indonesia pairs must convey the same substance. Answer ONLY with the JSON schema.`;
}

function toAudioFormat(mimeType: string): "wav" | "mp3" {
  const mime = mimeType.toLowerCase();
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  return "wav";
}

function audioPart(label: string, audio: { mimeType: string; data: string }) {
  return [
    { type: "text" as const, text: `\n[${label}]` },
    {
      type: "input_audio" as const,
      input_audio: {
        data: audio.data,
        format: toAudioFormat(audio.mimeType),
      },
    },
  ];
}

export async function evaluateWithSumopod(input: {
  textPrompt: string;
  reference: { mimeType: string; data: string };
  audioA: { mimeType: string; data: string };
  audioB: { mimeType: string; data: string };
  memoryGuide?: string;
  listenerNote?: string;
  languageErrors?: LanguageErrorNotes;
  language?: EvalLanguage;
}): Promise<EvaluationResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "SUMOPOD_API_KEY belum diset di environment (atau GEMINI_API_KEY sebagai fallback).",
    );
  }

  const language = input.language || "id";
  const model = getSumopodModel();
  const client = new OpenAI({
    apiKey,
    baseURL: BASE_URL,
  });

  const response = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildPrompt(
              input.textPrompt,
              input.memoryGuide,
              input.listenerNote,
              language,
              input.languageErrors,
            ),
          },
          ...audioPart("REFERENCE VOICE", input.reference),
          ...audioPart("AUDIO A", input.audioA),
          ...audioPart("AUDIO B", input.audioB),
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "tts_evaluation",
        strict: true,
        schema: evaluationJsonSchema,
      },
    },
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("Model tidak mengembalikan hasil penilaian.");
  }

  return JSON.parse(text) as EvaluationResult;
}
