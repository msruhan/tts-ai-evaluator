import { extractClaims } from "./extract-claims";
import { gatherEvidence } from "./gather-evidence";
import { judgeClaims } from "./judge";
import { buildSourcesBlock } from "./sources-block";
import { assertTavilyKey } from "./tavily";
import type { AiResearchResult, Emit, FactCheckInput, VerifiedSource } from "./types";

export function pickSourceUrls(
  citedUrls: string[],
  verdictUrls: string[],
  sources: VerifiedSource[],
): string[] {
  const usable = new Set(
    sources.filter((s) => s.dateStatus !== "after_query_date").map((s) => s.url),
  );
  const cited = citedUrls.filter((u) => usable.has(u));
  if (cited.length) return cited;
  const fromVerdicts = [...new Set(verdictUrls)].filter((u) => usable.has(u));
  if (fromVerdicts.length) return fromVerdicts;
  return [...usable];
}

export async function runAiResearch(
  input: FactCheckInput,
  emit: Emit,
): Promise<AiResearchResult> {
  assertTavilyKey();

  emit({ type: "stage", stage: "extract", message: "Membedah Target Sentence…" });
  const extraction = await extractClaims(input);
  emit({
    type: "stage",
    stage: "extract",
    message: extraction.noClaims
      ? `Tidak ada klaim faktual: ${extraction.noClaimsReason}`
      : `Ditemukan ${extraction.claims.length} klaim yang bisa diverifikasi.`,
  });

  const { verified, rejected } = extraction.noClaims
    ? { verified: [], rejected: [] }
    : await gatherEvidence(input, extraction, emit);

  emit({
    type: "stage",
    stage: "judge",
    message: `Menilai klaim dari ${verified.length} sumber terverifikasi dan menulis narasi…`,
  });
  const judged = await judgeClaims(input, extraction, verified);

  const verdictUrls = judged.verdicts.flatMap((v) => [
    ...v.supportingUrls,
    ...v.contradictingUrls,
  ]);
  const citedUrls = extraction.noClaims
    ? []
    : pickSourceUrls(judged.citedUrls, verdictUrls, verified);
  const sourcesBlock = buildSourcesBlock(
    citedUrls,
    verified.map((s) => s.url),
  );

  emit({ type: "stage", stage: "done", message: `Selesai — label: ${judged.label}.` });
  return {
    input,
    extraction,
    verdicts: judged.verdicts,
    label: judged.label,
    narrative: judged.narrative,
    sources: verified,
    rejected,
    citedUrls,
    sourcesBlock,
  };
}
