import type { GyroTaskContext } from "./types";

export type FieldSuggestion = {
  fieldId: string;
  value: string;
  reason: string;
  certainty: "certain";
};

function blob(ctx: GyroTaskContext): string {
  return [
    ctx.userGoal,
    ctx.initialPrompt,
    ctx.beforeInstructions,
    ctx.whileInstructions,
    ctx.afterInstructions,
    ctx.scene,
    ctx.taskText,
    ctx.layoutSummary,
  ]
    .join("\n")
    .toLowerCase();
}

/** Visual input / on-screen visuals are not part of this task. */
export function isVisualIrrelevant(ctx: GyroTaskContext): boolean {
  if (ctx.multimodal === "no") return true;
  if (ctx.multimodal === "yes") return false;
  // unknown: only if requiresScene explicitly no
  return ctx.requiresScene === "no";
}

function mentionsPersonalization(text: string): boolean {
  return /personaliz|preferensi|ingat (yang|prefer)|connected apps?|from (my )?profile|riwayat (chat|obrolan)|yang kamu tahu tentang (saya|aku)/i.test(
    text,
  );
}

function mentionsExtension(text: string): boolean {
  return /extension|plugin|connected app|tool call|via app|lewat aplikasi|deep research|retrieval/i.test(
    text,
  );
}

/**
 * Pure deterministic suggestions from task context only (no LLM).
 * Only emits certainty: "certain".
 */
export function deterministicSuggestions(
  ctx: GyroTaskContext,
): FieldSuggestion[] {
  const out: FieldSuggestion[] = [];
  const text = blob(ctx);

  if (isVisualIrrelevant(ctx)) {
    const why =
      ctx.multimodal === "no"
        ? "Task Variables: multimodal = NO — visual input tidak diminta."
        : "Task menandai scene/visual tidak diperlukan.";

    out.push(
      {
        fieldId: "visual_understanding",
        value: "Not Relevant",
        reason: why,
        certainty: "certain",
      },
      {
        fieldId: "visual_overlay_quality",
        value: "N/A - Not Applicable",
        reason: "Tidak ada kesempatan overlay yang diharapkan dari task.",
        certainty: "certain",
      },
      {
        fieldId: "visual_triggering",
        value: "N/A",
        reason: "Tidak ada visual on-screen yang diharapkan task.",
        certainty: "certain",
      },
      {
        fieldId: "visual_format_quality",
        value: "N/A",
        reason: "Tidak ada visual.",
        certainty: "certain",
      },
      {
        fieldId: "audio_visual_content",
        value: "N/A",
        reason: "Tidak ada visual.",
        certainty: "certain",
      },
      {
        fieldId: "audio_visual_timing",
        value: "N/A",
        reason: "Tidak ada visual.",
        certainty: "certain",
      },
      {
        fieldId: "visual_input_solicitation",
        value: "Not Relevant",
        reason: "Task tidak membutuhkan visual input (solicitation tidak relevan).",
        certainty: "certain",
      },
    );
  }

  if (!mentionsPersonalization(text)) {
    out.push({
      fieldId: "personalization_quality",
      value: "N/A",
      reason:
        "Goal/instruksi tidak meminta personalisasi dari data di luar sesi ini.",
      certainty: "certain",
    });
  }

  // Deep Research tasks often use "extensions" language — only suggest when clearly absent
  if (!mentionsExtension(text) && !/deep research/i.test(text)) {
    out.push({
      fieldId: "extension_correctness",
      value: "Not relevant",
      reason: "Task tidak menyebut aksi extension/tool.",
      certainty: "certain",
    });
  }

  return out;
}
