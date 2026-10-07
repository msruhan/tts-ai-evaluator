import { classifyDate } from "./dates";
import { reviseQueries } from "./extract-claims";
import { normalizeUrlKey } from "./sources-block";
import { fetchSportsEvidence } from "./sports-apis";
import { tavilySearch } from "./tavily";
import type {
  ClaimExtraction,
  Emit,
  FactCheckInput,
  LinkCheck,
  SourceCandidate,
  VerifiedSource,
} from "./types";
import { verifyLinksSequential } from "./verify-links";

const MAX_CANDIDATES = 8;
const MAX_RETRY_CANDIDATES = 4;
const SOURCES_PER_CLAIM = 2;

function mergeCandidates(list: SourceCandidate[]): SourceCandidate[] {
  const byKey = new Map<string, SourceCandidate>();
  for (const c of list) {
    const key = normalizeUrlKey(c.url);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...c, claimIds: [...c.claimIds] });
      continue;
    }
    existing.claimIds = [...new Set([...existing.claimIds, ...c.claimIds])];
    existing.score = Math.max(existing.score ?? 0, c.score ?? 0);
    if (!existing.publishedDate && c.publishedDate) {
      existing.publishedDate = c.publishedDate;
      existing.dateStatus = c.dateStatus;
    }
  }
  return [...byKey.values()];
}

function rank(c: SourceCandidate): number {
  const origin = c.origin === "sports_api" ? 0 : 1;
  const date = c.dateStatus === "after_query_date" ? 1 : 0;
  return origin * 10 + date * 5 - (c.score ?? 0);
}

export function withPageDate(sources: VerifiedSource[], queryDate: string): VerifiedSource[] {
  return sources.map((s) =>
    !s.publishedDate && s.check.publishedDate
      ? {
          ...s,
          publishedDate: s.check.publishedDate,
          dateStatus: classifyDate(s.check.publishedDate, queryDate),
        }
      : s,
  );
}

async function searchAll(
  jobs: { query: string; claimIds: string[]; endDate?: string; maxResults: number }[],
  queryDate: string,
): Promise<{ results: SourceCandidate[]; errors: string[] }> {
  const settled = await Promise.allSettled(
    jobs.map((j) =>
      tavilySearch(j.query, {
        queryDate,
        claimIds: j.claimIds,
        endDate: j.endDate,
        maxResults: j.maxResults,
      }),
    ),
  );
  const results: SourceCandidate[] = [];
  const errors: string[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") results.push(...s.value);
    else errors.push(s.reason instanceof Error ? s.reason.message : String(s.reason));
  }
  return { results, errors };
}

export async function gatherEvidence(
  input: FactCheckInput,
  extraction: ClaimExtraction,
  emit: Emit,
): Promise<{ verified: VerifiedSource[]; rejected: LinkCheck[] }> {
  const claimIds = extraction.claims.map((c) => c.id);
  const keyValuesByClaim = Object.fromEntries(
    extraction.claims.map((c) => [c.id, c.keyValues]),
  );

  let sports: SourceCandidate[] = [];
  if (extraction.entityHints.league !== "none") {
    emit({
      type: "stage",
      stage: "sports_api",
      message: `Mengambil data sports API resmi (${extraction.entityHints.league})…`,
    });
    sports = await fetchSportsEvidence(extraction.entityHints, input.queryDate, claimIds);
    emit({
      type: "stage",
      stage: "sports_api",
      message: sports.length
        ? `Sports API: ${sports.length} sumber ditemukan.`
        : "Sports API: event tidak ditemukan, lanjut ke pencarian web.",
    });
  }

  emit({ type: "stage", stage: "search", message: "Mencari sumber di Tavily…" });
  const jobs = extraction.claims.flatMap((c) =>
    c.searchQueries.flatMap((query, i) => [
      { query, claimIds: [c.id], endDate: input.queryDate, maxResults: 5 },
      ...(i === 0 ? [{ query, claimIds: [c.id], maxResults: 3 }] : []),
    ]),
  );
  const { results, errors } = await searchAll(jobs, input.queryDate);
  if (!results.length && !sports.length && errors.length) {
    throw new Error(errors[0]);
  }

  const candidates = mergeCandidates([...sports, ...results])
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, MAX_CANDIDATES);
  emit({
    type: "stage",
    stage: "verify",
    message: `Memverifikasi ${candidates.length} URL satu per satu…`,
  });

  const covered = (verified: VerifiedSource[]) =>
    claimIds.every(
      (id) =>
        verified.filter((v) => v.claimIds.includes(id) && v.dateStatus !== "after_query_date")
          .length >= SOURCES_PER_CLAIM,
    );
  const first = await verifyLinksSequential(candidates, keyValuesByClaim, {
    emit,
    stopWhen: covered,
  });
  let verified = withPageDate(first.verified, input.queryDate);
  const rejected = [...first.rejected];

  const uncovered = extraction.claims.filter(
    (c) => !verified.some((v) => v.claimIds.includes(c.id) && v.dateStatus !== "after_query_date"),
  );
  if (uncovered.length) {
    emit({
      type: "stage",
      stage: "retry",
      message: `${uncovered.length} klaim belum punya sumber valid — mencoba query baru…`,
    });
    try {
      const revised = await reviseQueries(input, uncovered);
      const retry = await searchAll(
        revised.map((r) => ({
          query: r.query,
          claimIds: [r.claimId],
          endDate: input.queryDate,
          maxResults: 4,
        })),
        input.queryDate,
      );
      const tried = new Set(
        [...candidates.map((c) => c.url), ...rejected.map((r) => r.url)].map(normalizeUrlKey),
      );
      const fresh = mergeCandidates(retry.results)
        .filter((c) => !tried.has(normalizeUrlKey(c.url)))
        .sort((a, b) => rank(a) - rank(b))
        .slice(0, MAX_RETRY_CANDIDATES);
      if (fresh.length) {
        const second = await verifyLinksSequential(fresh, keyValuesByClaim, { emit });
        verified = [...verified, ...withPageDate(second.verified, input.queryDate)];
        rejected.push(...second.rejected);
      }
    } catch (err) {
      emit({
        type: "stage",
        stage: "retry",
        message: `Pencarian ulang gagal: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return { verified, rejected };
}
