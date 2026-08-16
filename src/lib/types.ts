export type FourWayChoice = "A_BETTER" | "B_BETTER" | "BOTH_BAD" | "BOTH_GOOD";
export type TwoWayChoice = "A_BETTER" | "B_BETTER";
export type ReviewVerdict = "agree" | "partial" | "disagree";
export type EvalLanguage = "id" | "ms" | "en";

export const EVAL_LANGUAGES: {
  value: EvalLanguage;
  label: string;
}[] = [
  { value: "id", label: "Bahasa Indonesia" },
  { value: "ms", label: "Bahasa Malaysia" },
  { value: "en", label: "English" },
];

export function languageMeta(code?: EvalLanguage | string) {
  return (
    EVAL_LANGUAGES.find((item) => item.value === code) || EVAL_LANGUAGES[0]
  );
}

/** Second rationale language is always Indonesian for display/submission pairing. */
export const RATIONALE_LOCAL_LABEL = "Indonesia";

export type LanguageErrorCode =
  | "none"
  | "wrong_language"
  | "mixed_language"
  | "not_target_language"
  | "partial_wrong_language"
  | "unintelligible_language";

export const LANGUAGE_ERROR_OPTIONS: {
  value: LanguageErrorCode;
  label: string;
}[] = [
  { value: "none", label: "Tidak ada" },
  { value: "wrong_language", label: "Bahasa salah (bukan bahasa target)" },
  { value: "mixed_language", label: "Campur bahasa" },
  {
    value: "not_target_language",
    label: "Tidak sesuai bahasa evaluasi yang dipilih",
  },
  {
    value: "partial_wrong_language",
    label: "Sebagian clip memakai bahasa lain",
  },
  {
    value: "unintelligible_language",
    label: "Bahasa tidak jelas / tidak bisa dipastikan",
  },
];

export function languageErrorLabel(code?: string) {
  if (!code || code === "none") return "";
  return (
    LANGUAGE_ERROR_OPTIONS.find((item) => item.value === code)?.label || code
  );
}

export interface LanguageErrorNotes {
  reference?: string;
  audioA?: string;
  audioB?: string;
}

export interface EvaluationResult {
  audio_and_recording_quality: FourWayChoice;
  pronunciation_faithfulness: FourWayChoice;
  pacing: TwoWayChoice;
  intonation: TwoWayChoice;
  persona_likeness: FourWayChoice;
  nativeness: FourWayChoice;
  naturalness_overall_preference: TwoWayChoice;
  /** English (Avalanch submission style) */
  rationale_a: string;
  rationale_b: string;
  justification: string;
  /**
   * Second language text (schema key kept as *_id for compatibility).
   * Always Bahasa Indonesia, even when evaluating Malay/English audio.
   */
  rationale_a_id: string;
  rationale_b_id: string;
  justification_id: string;
}

export interface ReviewerComment {
  id: string;
  createdAt: string;
  verdict: ReviewVerdict;
  comment: string;
}

export interface EvaluationRecord {
  id: string;
  createdAt: string;
  title: string;
  textPrompt: string;
  /** Target spoken language for evaluation focus */
  language: EvalLanguage;
  /** Optional human listener notes combined into the AI evaluation */
  listenerNote?: string;
  /** Optional language-error notes per clip, also combined into AI judgment */
  languageErrors?: LanguageErrorNotes;
  model: string;
  fileNames: {
    reference: string;
    audioA: string;
    audioB: string;
  };
  result: EvaluationResult;
  reviews: ReviewerComment[];
}

export interface EvaluationSummary {
  id: string;
  createdAt: string;
  title: string;
  model: string;
  language?: EvalLanguage;
  preference: TwoWayChoice;
  reviewCount: number;
}

export interface MemorySkill {
  id: string;
  createdAt: string;
  sourceEvaluationId: string;
  verdict: ReviewVerdict;
  skill: string;
}

export interface EvaluatorMemory {
  updatedAt: string;
  skills: MemorySkill[];
}

export const RATING_LABELS: Record<string, string> = {
  A_BETTER: "A Better",
  B_BETTER: "B Better",
  BOTH_BAD: "Both Bad",
  BOTH_GOOD: "Both Good",
};

export const DIMENSIONS: {
  key: keyof EvaluationResult;
  title: string;
  description: string;
  kind: "four" | "two" | "text";
}[] = [
  {
    key: "audio_and_recording_quality",
    title: "Audio and Recording Quality",
    description: "Seberapa bersih dan bebas artifact sinyal audionya.",
    kind: "four",
  },
  {
    key: "pronunciation_faithfulness",
    title: "Pronunciation Faithfulness",
    description:
      "Seberapa akurat pengucapan mengikuti teks/instruksi yang dimaksud.",
    kind: "four",
  },
  {
    key: "pacing",
    title: "Pacing",
    description: "Apakah tempo bicara terdengar organik dan natural?",
    kind: "two",
  },
  {
    key: "intonation",
    title: "Intonation",
    description:
      "Seberapa tepat intonasinya — jarring atau mendekati manusia?",
    kind: "two",
  },
  {
    key: "persona_likeness",
    title: "Persona Likeness (Speaker Similarity)",
    description:
      "Seberapa mirip suara hasil generate dibanding reference speaker?",
    kind: "four",
  },
  {
    key: "nativeness",
    title: "Nativeness",
    description:
      "Seberapa terdengar seperti penutur asli Bahasa Indonesia?",
    kind: "four",
  },
  {
    key: "naturalness_overall_preference",
    title: "Naturalness (Overall Preference)",
    description: "Secara keseluruhan, mana yang terdengar lebih natural?",
    kind: "two",
  },
];
