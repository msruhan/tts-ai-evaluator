/**
 * Foundation skills for Gyro Accordion: Deep Research Evaluation.
 * Distilled from official evaluator instructions (P1/P2/P3 phases).
 * Isolated from TTS Avalanch skills.
 */
export const GYRO_REVIEWER_SKILLS: string[] = [
  "Ground every answer in task card fields, transcript, reviewer notes, and recording evidence only. Do not invent evidence.",
  "Phases: P1 BEFORE (pre-DR), P2 WHILE (during DR), P3 AFTER (post-DR). Tags must match behavior in the transcript/recording.",
  "P1:DIRECT = Turn 1 prompt + immediately request Deep Research. P1:CONVO = ~4 natural turns, then explicitly request Deep Research on the trigger turn.",
  "P2:LEAVE/WAIT = silence or leave app — no chat. P2:IMPATIENT = rush/interrupt/ETA. P2:RELATED = on-topic chat while waiting. P2:UNRELATED = off-topic chat while waiting.",
  "P3:DISCUSSION = follow-up on findings. P3:DRILL WHILE READING = challenge on-screen claim. P3:SUMMARIZE = ask verbal summary. P3:FOLLOWUP-DR = second Deep Research.",
  "Distinguish Deep Research REQUESTED (user said the phrase) vs TRIGGERED (feature actually ran / report generated).",
  "Transcription should be on; verify regex/phrase for Deep Research was met when grading request.",
  "Multimodal NO = voice + screen-record only. Multimodal YES = correct scene (screen share or camera) must be ready and used.",
  "Golden Rule: every Yes/Minor/Major/issue flag must have descriptive comments and be verifiable in the recording. No one-word answers.",
  "Entity edits must stay coherent across scene, user_goal, prompt, and before/while/after instructions.",
  "Take as many turns as needed is allowed; do not penalize extra turns if goal + phase instructions were satisfied.",
  "Recording review: flag black screens, audio/loading failures, incomplete capture.",
  "Write reviewer answers in clear Bahasa Indonesia (Indonesian reviewer) unless the field label itself must stay English.",
  "If unclear, answer unknown/neutral — never fake certainty.",
];

export function formatGyroSkillsForPrompt(): string {
  const lines = GYRO_REVIEWER_SKILLS.map((s, i) => `${i + 1}. ${s}`);
  return `Gyro Accordion Deep Research Reviewer Skills (mandatory):\n${lines.join("\n")}`;
}
