export type TriState = "yes" | "no" | "unknown";
export type RubricVersion = "v1" | "v2";
export type ChatFormTarget = "review1" | "review2";
export type MultimodalState = TriState;
export type SceneRequired = TriState;
export type SceneKind = "" | "screen_share" | "camera" | "other";

/** Official Gyro Accordion tags from evaluator guidelines */
export type P1Tag = "" | "P1:DIRECT" | "P1:CONVO";
export type P2Tag =
  | ""
  | "P2:LEAVE/WAIT"
  | "P2:IMPATIENT"
  | "P2:RELATED"
  | "P2:UNRELATED";
export type P3Tag =
  | ""
  | "P3:DISCUSSION"
  | "P3:DRILL WHILE READING"
  | "P3:SUMMARIZE"
  | "P3:FOLLOWUP-DR";

export type GyroIssueKey =
  | "noise"
  | "overlay"
  | "pii"
  | "echo"
  | "transcript_mismatch"
  | "interruptions"
  | "visual_blur"
  | "accent_mismatch"
  | "black_screen"
  | "audio_loading"
  | "incomplete_recording"
  | "dr_regex_miss"
  | "entity_incoherence";

export const GYRO_ISSUE_OPTIONS: { key: GyroIssueKey; label: string }[] = [
  { key: "noise", label: "Noise" },
  { key: "overlay", label: "Overlay" },
  { key: "pii", label: "PII" },
  { key: "echo", label: "Echo" },
  { key: "transcript_mismatch", label: "Transcript mismatch / ASR" },
  { key: "interruptions", label: "Interruptions" },
  { key: "visual_blur", label: "Visual blur / unclear camera" },
  { key: "accent_mismatch", label: "Accent mismatch concern" },
  { key: "black_screen", label: "Black screen" },
  { key: "audio_loading", label: "Audio / loading issue" },
  { key: "incomplete_recording", label: "Incomplete recording" },
  { key: "dr_regex_miss", label: "Deep Research phrase not spoken / regex miss" },
  { key: "entity_incoherence", label: "Entity / instruction incoherence" },
];

export const GYRO_P1_OPTIONS: { value: P1Tag; label: string; hint: string }[] = [
  { value: "", label: "— Pilih P1 —", hint: "" },
  {
    value: "P1:DIRECT",
    label: "P1:DIRECT",
    hint: "Turn 1: prompt + langsung minta Deep Research",
  },
  {
    value: "P1:CONVO",
    label: "P1:CONVO",
    hint: "4 turn natural, lalu di Turn 4 eksplisit minta Deep Research",
  },
];

export const GYRO_P2_OPTIONS: { value: P2Tag; label: string; hint: string }[] = [
  { value: "", label: "— Pilih P2 —", hint: "" },
  {
    value: "P2:LEAVE/WAIT",
    label: "P2:LEAVE/WAIT",
    hint: "Diam / keluar app sementara report generate — jangan chat",
  },
  {
    value: "P2:IMPATIENT",
    label: "P2:IMPATIENT",
    hint: "Terburu-buru: interrupt, tanya ETA / progress",
  },
  {
    value: "P2:RELATED",
    label: "P2:RELATED",
    hint: "Terus ngobrol topik terkait / tangential saat DR jalan",
  },
  {
    value: "P2:UNRELATED",
    label: "P2:UNRELATED",
    hint: "Terus ngobrol off-topic saat DR jalan",
  },
];

export const GYRO_P3_OPTIONS: { value: P3Tag; label: string; hint: string }[] = [
  { value: "", label: "— Pilih P3 —", hint: "" },
  {
    value: "P3:DISCUSSION",
    label: "P3:DISCUSSION",
    hint: "Follow-up natural membahas temuan report",
  },
  {
    value: "P3:DRILL WHILE READING",
    label: "P3:DRILL WHILE READING",
    hint: "Tantang / verifikasi klaim atau statistik di layar",
  },
  {
    value: "P3:SUMMARIZE",
    label: "P3:SUMMARIZE",
    hint: "Minta ringkasan verbal / synopsis report",
  },
  {
    value: "P3:FOLLOWUP-DR",
    label: "P3:FOLLOWUP-DR",
    hint: "Picu Deep Research kedua dari sudut baru",
  },
];

export const GYRO_SCENE_KIND_OPTIONS: { value: SceneKind; label: string }[] = [
  { value: "", label: "— Pilih —" },
  { value: "screen_share", label: "Screen share" },
  { value: "camera", label: "Camera" },
  { value: "other", label: "Lainnya" },
];

export type GyroTaskContext = {
  rubricVersion: RubricVersion;
  taskLanguage: string;
  multimodal: MultimodalState;
  requiresScene: SceneRequired;
  sceneKind: SceneKind;
  scene: string;
  p1: P1Tag;
  p2: P2Tag;
  p3: P3Tag;
  userGoal: string;
  initialPrompt: string;
  beforeInstructions: string;
  whileInstructions: string;
  afterInstructions: string;
  /** While - Turn 1..N from Layout Summary (scripted wait turns) */
  whileTurns: string[];
  /** After Draft scripted follow-up from Layout Summary */
  afterDraft: string;
  /** Freeform Task Variables paste */
  taskText: string;
  /** Outlier Layout Summary paste (scene, turns, after draft) */
  layoutSummary: string;
  transcript: string;
  imageName?: string;
  transcriptFileName?: string;
};

export type GyroReviewerNotes = {
  deepResearchRequested: TriState;
  deepResearchTriggered: TriState;
  deepResearchPhraseSpoken: TriState;
  captionsVisible: TriState;
  visualOverlayUsed: TriState;
  personalizationObserved: TriState;
  recordingComplete: TriState;
  commentsMatchRecording: TriState;
  issues: GyroIssueKey[];
  comments: string;
  corrections: string;
};

export type GyroAnswer = {
  id: string;
  label: string;
  value: string;
};

export type GyroReviewResult = {
  /** @deprecated use review2 — kept for chat compatibility */
  summary: string;
  /** @deprecated use review2.answers */
  answers: GyroAnswer[];
  json: Record<string, unknown>;
  review1?: {
    deepResearchTriggered: "Yes" | "No";
    deepResearchNoteId: string;
    fields: {
      id: string;
      title: string;
      promptEn?: string;
      explainId: string;
      rating: string;
      explanationId: string;
      options: string[];
    }[];
    qualityCheckAccurate: "Yes" | "No";
    grammarCheck: "Yes" | "No";
    formatted: string;
  };
  review2?: {
    summary: string;
    answers: GyroAnswer[];
    formatted: string;
  };
};

export type GyroMemorySkill = {
  id: string;
  skill: string;
  sourceName: string;
  createdAt: string;
};

export type GyroMemory = {
  skills: GyroMemorySkill[];
  sources: { name: string; skillCount: number; addedAt: string }[];
  playbook: string;
};

export type GyroReviewRequest = {
  context: GyroTaskContext;
  notes: GyroReviewerNotes;
  imageDataUrl?: string;
};

export const RUBRIC_V1_QUESTIONS: { id: string; label: string }[] = [
  { id: "Q1", label: "Layout coherence (prompt / goal / instructions / scene)" },
  { id: "Q2", label: "Scene setup (multimodal YES → correct scene ready)" },
  { id: "Q3", label: "User goal clarity & completion" },
  { id: "Q4", label: "Before instructions (P1) executed" },
  { id: "Q5", label: "While instructions (P2) executed" },
  { id: "Q6", label: "After instructions (P3) executed" },
  { id: "Q7", label: "P1 tag adherence (DIRECT vs CONVO timing)" },
  { id: "Q8", label: "P2 tag adherence (LEAVE/WAIT / IMPATIENT / RELATED / UNRELATED)" },
  { id: "Q9", label: "P3 tag adherence (DISCUSSION / DRILL / SUMMARIZE / FOLLOWUP-DR)" },
  { id: "Q10", label: "Deep Research requested? (explicit phrase)" },
  { id: "Q11", label: "Deep Research actually triggered?" },
  { id: "Q12", label: "Recording quality (black screen / audio / complete)" },
  { id: "Q13", label: "PII handling" },
  { id: "Q14", label: "Language fit (Bahasa Indonesia / local prompt)" },
  { id: "Q15", label: "Captions / transcript quality (transcription on)" },
  { id: "Q16", label: "Interruptions / conversational flow" },
  { id: "Q17", label: "Visual clarity (if multimodal)" },
  { id: "Q18", label: "Entity coherence across sections" },
  { id: "Q19", label: "Scenario completion (goal + all phase instructions)" },
  { id: "Q20", label: "Instruction–transcript consistency" },
  { id: "Q21", label: "Logged issues vs recording (Golden Rule)" },
  { id: "Q22", label: "Overall review verdict" },
];

export const RUBRIC_V2_FIELDS: { id: string; label: string }[] = [
  { id: "ui_usability", label: "UI usability" },
  { id: "live_screen_captions", label: "Live screen captions quality" },
  { id: "audio_understanding", label: "Audio understanding" },
  { id: "visual_understanding", label: "Visual understanding" },
  { id: "visual_overlay_quality", label: "Visual overlay quality" },
  { id: "extension_correctness", label: "Extension correctness" },
  { id: "voice_quality", label: "Voice quality" },
  { id: "emotional_calibration", label: "Emotional calibration" },
  { id: "collaborativity", label: "Collaborativity" },
  { id: "contextual_awareness", label: "Contextual awareness" },
  { id: "personalization_quality", label: "Personalization quality" },
  { id: "flow_interruptions", label: "Flow / interruptions" },
  { id: "easy_to_listen", label: "Easy to listen to" },
  { id: "content_relevance", label: "Content relevance" },
  { id: "response_depth", label: "Response depth" },
  { id: "truthfulness", label: "Truthfulness" },
  { id: "goal_completion", label: "Goal completion" },
  { id: "efficiency", label: "Efficiency" },
  { id: "visual_triggering", label: "Visual triggering" },
  { id: "visual_format_quality", label: "Visual format & quality" },
  { id: "audio_visual_content", label: "Audio-visual content" },
  { id: "audio_visual_timing", label: "Audio-visual timing" },
  { id: "self_awareness", label: "Self-awareness" },
  { id: "visual_input_solicitation", label: "Visual input solicitation" },
  { id: "overall_satisfaction", label: "Overall satisfaction" },
  { id: "transcript_quality", label: "Transcript quality" },
];
