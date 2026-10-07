import { runCodexJson } from "./codex";
import {
  formatSourcesForPrompt,
  formatTaskBlock,
  LABEL_RULES,
  narrativeRules,
  QUERY_DATE_RULES,
  resolveSourceIds,
} from "./narrative";
import { stripUnverifiedUrls } from "./sources-block";
import {
  FACT_LABELS,
  type ClaimExtraction,
  type ClaimVerdict,
  type FactCheckInput,
  type FactLabel,
  type Narrative,
  type VerifiedSource,
} from "./types";

const stringArray = { type: "array", items: { type: "string" } } as const;
const labelEnum = { type: "string", enum: [...FACT_LABELS] } as const;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          claimId: { type: "string" },
          verdict: labelEnum,
          supportingSources: stringArray,
          contradictingSources: stringArray,
          note: { type: "string" },
        },
        required: ["claimId", "verdict", "supportingSources", "contradictingSources", "note"],
      },
    },
    label: labelEnum,
    citedSources: stringArray,
    narrativeEn: { type: "string" },
    narrativeId: { type: "string" },
  },
  required: ["verdicts", "label", "citedSources", "narrativeEn", "narrativeId"],
};

type RawJudge = {
  verdicts: {
    claimId: string;
    verdict: FactLabel;
    supportingSources: string[];
    contradictingSources: string[];
    note: string;
  }[];
  label: FactLabel;
  citedSources: string[];
  narrativeEn: string;
  narrativeId: string;
};

export type JudgeOutput = {
  verdicts: ClaimVerdict[];
  label: FactLabel;
  narrative: Narrative;
  citedUrls: string[];
};

export function formatClaimsForPrompt(extraction: ClaimExtraction) {
  if (extraction.noClaims) return `No claims detected: ${extraction.noClaimsReason}`;
  return extraction.claims
    .map(
      (c) =>
        `${c.id}: ${c.text}${c.isSubjective ? " [SUBJECTIVE]" : ""} (key values: ${c.keyValues.join(", ") || "-"})`,
    )
    .join("\n");
}

export async function judgeClaims(
  input: FactCheckInput,
  extraction: ClaimExtraction,
  sources: VerifiedSource[],
): Promise<JudgeOutput> {
  const prompt = `You are a senior factuality reviewer. Decide the label for the target sentence using ONLY the verified sources below (each one was opened live and returned real content).

${formatTaskBlock(input)}

Claims extracted from the target sentence:
${formatClaimsForPrompt(extraction)}

Verified sources (refer to them only by their ID, e.g. "S1"):
${formatSourcesForPrompt(sources)}

${LABEL_RULES}

${QUERY_DATE_RULES(input.queryDate)}

${narrativeRules()}

Output:
- verdicts: one per claim ID with its own label, the supporting / contradicting source IDs, and a one-sentence note (English).
- label: overall label for the target sentence (worst case wins: any Inaccurate -> Inaccurate; otherwise any Disputed -> Disputed; otherwise any Unsupported -> Unsupported).
- citedSources: the source IDs the narrative relies on, most important first (empty when none).
- narrativeEn: the English narrative. narrativeId: the same substance in natural Bahasa Indonesia.`;

  const raw = await runCodexJson<RawJudge>(prompt, schema, { label: "penilaian" });
  const verifiedUrls = sources.map((s) => s.url);
  const claimIds = new Set(extraction.claims.map((c) => c.id));

  return {
    label: extraction.noClaims ? "No Claims present" : raw.label,
    verdicts: raw.verdicts
      .filter((v) => claimIds.has(v.claimId))
      .map((v) => ({
        claimId: v.claimId,
        verdict: v.verdict,
        supportingUrls: resolveSourceIds(v.supportingSources, sources),
        contradictingUrls: resolveSourceIds(v.contradictingSources, sources),
        note: v.note,
      })),
    narrative: {
      en: stripUnverifiedUrls(raw.narrativeEn, verifiedUrls),
      id: stripUnverifiedUrls(raw.narrativeId, verifiedUrls),
    },
    citedUrls: resolveSourceIds(raw.citedSources, sources),
  };
}
