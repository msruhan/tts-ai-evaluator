import { FACT_LABELS, type FactCheckInput, type FactLabel, type ManualResearch } from "./types";

const MAX_FIELD = 60_000;

function str(v: unknown, max = MAX_FIELD): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

export function readFactCheckInput(raw: unknown): FactCheckInput {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const input: FactCheckInput = {
    userQuery: str(o.userQuery),
    fullResponse: str(o.fullResponse),
    targetSentence: str(o.targetSentence, 5_000).trim(),
    queryDate: str(o.queryDate, 20).trim(),
  };
  if (!input.targetSentence) throw new Error("Target Sentence wajib diisi.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.queryDate)) {
    throw new Error("Query Date wajib diisi dengan format YYYY-MM-DD.");
  }
  return input;
}

export function readManualResearch(raw: unknown): ManualResearch {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const label = FACT_LABELS.includes(o.label as FactLabel) ? (o.label as FactLabel) : undefined;
  const urls = Array.isArray(o.urls)
    ? o.urls.filter((u): u is string => typeof u === "string").slice(0, 20)
    : [];
  const manual: ManualResearch = { label, notes: str(o.notes, 20_000), urls };
  if (!manual.notes.trim() && !manual.urls.length) {
    throw new Error("Riset manual butuh catatan atau minimal satu URL.");
  }
  return manual;
}
