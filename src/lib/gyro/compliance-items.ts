import type { GyroTaskContext } from "./types";
import {
  GYRO_P1_OPTIONS,
  GYRO_P2_OPTIONS,
  GYRO_P3_OPTIONS,
} from "./types";

export type ComplianceStatus = "unchecked" | "match" | "mismatch";

export type ComplianceItem = {
  id: string;
  title: string;
  expected: string;
  status: ComplianceStatus;
  note: string;
};

function tagHint(
  options: { value: string; label: string; hint: string }[],
  value: string,
): string {
  const hit = options.find((o) => o.value === value);
  if (!hit || !hit.value) return value || "(belum terdeteksi di paste)";
  return hit.hint ? `${hit.label} — ${hit.hint}` : hit.label;
}

/** Build fresh compliance rows from parsed context (preserves status/note if same id). */
export function buildComplianceItems(
  ctx: GyroTaskContext,
  prev?: ComplianceItem[],
): ComplianceItem[] {
  const prevMap = new Map((prev || []).map((p) => [p.id, p]));

  const rows: Omit<ComplianceItem, "status" | "note">[] = [
    {
      id: "multimodal_scene",
      title: "Multimodal & scene",
      expected:
        ctx.multimodal === "yes"
          ? `Multimodal YES${ctx.sceneKind ? ` · ${ctx.sceneKind}` : ""}${ctx.scene ? `\nScene: ${ctx.scene}` : ""}\n→ Pastikan scene/visual siap sesuai task.`
          : ctx.multimodal === "no"
            ? "Multimodal NO — tidak perlu scene visual."
            : "Multimodal belum jelas dari paste — konfirmasi manual (YES/NO).",
    },
    {
      id: "p1_behavior",
      title: "P1 — perilaku sebelum Deep Research",
      expected: [
        tagHint(GYRO_P1_OPTIONS, ctx.p1),
        ctx.beforeInstructions
          ? `Instruksi:\n${ctx.beforeInstructions}`
          : "",
        ctx.initialPrompt ? `Initial prompt:\n${ctx.initialPrompt}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    {
      id: "dr_request_timing",
      title: "Permintaan Deep Research (timing)",
      expected:
        ctx.p1 === "P1:DIRECT"
          ? "P1:DIRECT — turn 1 harus eksplisit minta Deep Research."
          : ctx.p1 === "P1:CONVO"
            ? "P1:CONVO — beberapa turn natural dulu, baru minta Deep Research (biasanya turn ~4)."
            : "Cek apakah user meminta Deep Research sesuai tag P1.",
    },
    {
      id: "p2_while",
      title: "P2 — selama menunggu / While",
      expected: [
        tagHint(GYRO_P2_OPTIONS, ctx.p2),
        ctx.whileInstructions ? `Instruksi:\n${ctx.whileInstructions}` : "",
        ctx.whileTurns.length
          ? `While turns (${ctx.whileTurns.length}):\n${ctx.whileTurns
              .map((t, i) => `${i + 1}. ${t}`)
              .join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    {
      id: "p3_after",
      title: "P3 — setelah report",
      expected: [
        tagHint(GYRO_P3_OPTIONS, ctx.p3),
        ctx.afterInstructions ? `Instruksi:\n${ctx.afterInstructions}` : "",
        ctx.afterDraft ? `After draft:\n${ctx.afterDraft}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    {
      id: "goal_alignment",
      title: "User goal",
      expected: ctx.userGoal || "(goal belum ter-parse — cek paste Task Variables)",
    },
  ];

  return rows.map((r) => {
    const old = prevMap.get(r.id);
    return {
      ...r,
      status: old?.status ?? "unchecked",
      note: old?.note ?? "",
    };
  });
}

export function complianceStats(items: ComplianceItem[]) {
  const unchecked = items.filter((i) => i.status === "unchecked").length;
  const match = items.filter((i) => i.status === "match").length;
  const mismatch = items.filter((i) => i.status === "mismatch").length;
  const done = match + mismatch;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  return { unchecked, match, mismatch, done, pct, total: items.length };
}
