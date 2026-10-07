import { runCodexJson } from "./codex";
import { withPageDate } from "./gather-evidence";
import { formatClaimsForPrompt } from "./judge";
import {
  formatSourcesForPrompt,
  formatTaskBlock,
  LABEL_RULES,
  NARRATIVE_RULES,
  QUERY_DATE_RULES,
  resolveSourceIds,
} from "./narrative";
import { pickSourceUrls } from "./pipeline";
import {
  buildSourcesBlock,
  dedupeUrls,
  extractUrls,
  normalizeUrlKey,
  stripUnverifiedUrls,
} from "./sources-block";
import {
  FACT_LABELS,
  type AiResearchResult,
  type ClaimComparison,
  type Confidence,
  type Emit,
  type FactCheckInput,
  type FactLabel,
  type FinalReview,
  type LinkCheck,
  type ManualResearch,
  type SourceCandidate,
} from "./types";
import { verifyLinksSequential } from "./verify-links";

const stringArray = { type: "array", items: { type: "string" } } as const;
const labelEnum = { type: "string", enum: [...FACT_LABELS] } as const;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    comparisons: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          claimId: { type: "string" },
          manualVerdict: { type: "string" },
          agreement: { type: "string", enum: ["agree", "disagree", "ai_only", "manual_only"] },
          analysis: { type: "string" },
        },
        required: ["claimId", "manualVerdict", "agreement", "analysis"],
      },
    },
    label: labelEnum,
    confidence: { type: "string", enum: ["tinggi", "sedang", "rendah"] },
    citedSources: stringArray,
    narrativeEn: { type: "string" },
    narrativeId: { type: "string" },
    notesForUser: { type: "string" },
  },
  required: [
    "comparisons",
    "label",
    "confidence",
    "citedSources",
    "narrativeEn",
    "narrativeId",
    "notesForUser",
  ],
};

type RawCompare = {
  comparisons: Omit<ClaimComparison, "aiVerdict">[];
  label: FactLabel;
  confidence: Confidence;
  citedSources: string[];
  narrativeEn: string;
  narrativeId: string;
  notesForUser: string;
};

function formatManualChecks(checks: LinkCheck[], failed: LinkCheck[]) {
  const lines = [
    ...checks.map((c) => `- OK ${c.url} (${c.detail}; keyMatch ${c.keyMatch})`),
    ...failed.map((c) => `- FAILED ${c.url} (${c.detail}) — cannot be used as evidence`),
  ];
  return lines.length ? lines.join("\n") : "(no URLs provided)";
}

export async function runComparison(
  input: FactCheckInput,
  ai: AiResearchResult,
  manual: ManualResearch,
  emit: Emit,
): Promise<FinalReview> {
  const claimIds = ai.extraction.claims.map((c) => c.id);
  const keyValuesByClaim = Object.fromEntries(
    ai.extraction.claims.map((c) => [c.id, c.keyValues]),
  );

  const urls = dedupeUrls([...manual.urls, ...extractUrls(manual.notes)]);
  emit({
    type: "stage",
    stage: "manual_verify",
    message: urls.length
      ? `Memverifikasi ${urls.length} URL riset manual satu per satu…`
      : "Riset manual tidak memuat URL.",
  });
  const candidates: SourceCandidate[] = urls.map((url) => ({
    url,
    title: "Sumber riset manual",
    origin: "manual",
    dateStatus: "unknown_date",
    claimIds,
  }));
  const manualResult = await verifyLinksSequential(candidates, keyValuesByClaim, { emit });
  const manualVerified = withPageDate(manualResult.verified, input.queryDate);

  const aiKeys = new Set(ai.sources.map((s) => normalizeUrlKey(s.url)));
  const combined = [
    ...ai.sources,
    ...manualVerified.filter((s) => !aiKeys.has(normalizeUrlKey(s.url))),
  ];

  emit({
    type: "stage",
    stage: "compare",
    message: "Membandingkan riset AI dan riset manual, lalu menyusun final review…",
  });

  const aiVerdicts = ai.verdicts
    .map((v) => `${v.claimId}: ${v.verdict} — ${v.note}`)
    .join("\n");

  const prompt = `You are the final reviewer doing a double check. Two independent research results exist for the same target sentence: an AI research and a human rater's manual research. Compare them claim by claim, decide which evidence is stronger, and produce the final recommended review.

${formatTaskBlock(input)}

Claims:
${formatClaimsForPrompt(ai.extraction)}

AI research — overall label: ${ai.label}
Per-claim verdicts:
${aiVerdicts || "(none)"}
AI narrative:
"""
${ai.narrative.en}
"""

Manual research — rater's label: ${manual.label || "(not given)"}
Rater's notes (may be Indonesian or English):
"""
${manual.notes.trim() || "(no notes)"}
"""
Live check of the rater's URLs:
${formatManualChecks(manualResult.verified.map((v) => v.check), manualResult.rejected)}

All verified sources (AI + manual; refer to them only by ID):
${formatSourcesForPrompt(combined)}

${LABEL_RULES}

${QUERY_DATE_RULES(input.queryDate)}

How to compare:
- For each claim ID: manualVerdict = the rater's verdict for that claim inferred from the notes/label ("not addressed" if the notes do not cover it); agreement = agree | disagree | ai_only (only AI covered it) | manual_only (only the rater found something relevant).
- When they disagree, explain in analysis (Bahasa Indonesia) which side is better supported and why: official/primary vs secondary source, published before vs after the query date, whether the key value really appears on the page (keyMatch), and whether the source actually opened.
- Rater URLs that FAILED, are after_query_date, or do not contain the claim must not support the final label; mention them in notesForUser.
- In analysis and notesForUser, refer to sources by site name (e.g. "FotMob", "ESPN API"), never by IDs like [S1].
- confidence: "tinggi" when both researches agree and strong sources exist; "sedang" when they agree with weaker sources or a disagreement was clearly resolved; "rendah" when a real conflict remains or evidence is thin.

${NARRATIVE_RULES}

Output: comparisons, label (final recommended), confidence, citedSources (IDs used in the final narrative, most important first), narrativeEn (final English narrative), narrativeId (same substance in Bahasa Indonesia), notesForUser (Bahasa Indonesia, 2–5 short sentences: key differences, problematic sources, and concrete advice for the rater; not part of the copied review).`;

  const raw = await runCodexJson<RawCompare>(prompt, schema, { label: "perbandingan" });
  const verifiedUrls = combined.map((s) => s.url);
  const aiVerdictById = new Map(ai.verdicts.map((v) => [v.claimId, v.verdict]));
  const citedUrls = ai.extraction.noClaims
    ? []
    : pickSourceUrls(resolveSourceIds(raw.citedSources, combined), [], combined);

  emit({
    type: "stage",
    stage: "done",
    message: `Final review selesai — label: ${raw.label} (keyakinan ${raw.confidence}).`,
  });

  return {
    label: raw.label,
    confidence: raw.confidence,
    narrative: {
      en: stripUnverifiedUrls(raw.narrativeEn, verifiedUrls),
      id: stripUnverifiedUrls(raw.narrativeId, verifiedUrls),
    },
    sources: combined,
    citedUrls,
    sourcesBlock: buildSourcesBlock(citedUrls, verifiedUrls),
    manualChecks: [...manualResult.verified.map((v) => v.check), ...manualResult.rejected],
    comparisons: raw.comparisons
      .filter((c) => claimIds.includes(c.claimId))
      .map((c) => ({ ...c, aiVerdict: aiVerdictById.get(c.claimId) || ai.label })),
    notesForUser: raw.notesForUser,
  };
}
