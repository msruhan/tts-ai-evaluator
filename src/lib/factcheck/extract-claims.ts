import { runCodexJson } from "./codex";
import { formatTaskBlock } from "./narrative";
import { SPORTS_LEAGUE_KEYS } from "./sports-apis";
import type { Claim, ClaimExtraction, FactCheckInput } from "./types";

const stringArray = { type: "array", items: { type: "string" } } as const;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    noClaims: { type: "boolean" },
    noClaimsReason: { type: "string" },
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          keyValues: stringArray,
          isSubjective: { type: "boolean" },
          searchQueries: stringArray,
        },
        required: ["text", "keyValues", "isSubjective", "searchQueries"],
      },
    },
    entityHints: {
      type: "object",
      additionalProperties: false,
      properties: {
        sport: { type: "string" },
        league: { type: "string", enum: SPORTS_LEAGUE_KEYS },
        teams: stringArray,
        players: stringArray,
        eventDate: { type: "string" },
        eventName: { type: "string" },
      },
      required: ["sport", "league", "teams", "players", "eventDate", "eventName"],
    },
  },
  required: ["noClaims", "noClaimsReason", "claims", "entityHints"],
};

type RawExtraction = Omit<ClaimExtraction, "claims"> & {
  claims: Omit<Claim, "id">[];
};

export async function extractClaims(input: FactCheckInput): Promise<ClaimExtraction> {
  const prompt = `You are a meticulous sports fact-checker preparing research for the target sentence below.

${formatTaskBlock(input)}

Tasks:
1. Split the TARGET SENTENCE into atomic, independently verifiable claims (usually 1–4). Resolve implicit context from the full response / user query so each claim is self-contained (e.g. "Rayo Vallecano, xG: 1.33" -> "Rayo Vallecano recorded 1.33 expected goals (xG) in the La Liga match vs Espanyol on September 15, 2026").
2. keyValues: 1–4 short exact tokens a source page would literally contain to confirm the claim (numbers exactly as written such as "1.33" or "2-1", player/team names). For purely subjective claims, use the subject's name.
3. isSubjective: true when the claim is a characterization ("greatest", "dominant", "only hurdle") rather than a checkable fact.
4. searchQueries: 1–2 English web search queries per claim, specific enough to find match stats/reports (include teams, competition, and date/season).
5. noClaims: true only if the target sentence has no factual claim at all (greeting, question, pure opinion with no subject), then explain in noClaimsReason and return an empty claims array. Otherwise noClaimsReason = "".
6. entityHints for official sports APIs: sport (e.g. "soccer"), league = closest key from the allowed enum ("none" if unsupported or not a single sporting event), teams and players named in the claims (full names), eventDate = YYYY-MM-DD of the specific game/event if known from the response (else ""), eventName for tournaments (e.g. "TOUR Championship", else "").`;

  const raw = await runCodexJson<RawExtraction>(prompt, schema, { label: "bedah klaim" });
  return {
    ...raw,
    claims: raw.noClaims
      ? []
      : raw.claims.map((c, i) => ({
          ...c,
          id: `C${i + 1}`,
          keyValues: c.keyValues.filter((v) => v.trim()),
          searchQueries: c.searchQueries.filter((q) => q.trim()).slice(0, 2),
        })),
  };
}

const revisedSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    queries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { claimId: { type: "string" }, query: { type: "string" } },
        required: ["claimId", "query"],
      },
    },
  },
  required: ["queries"],
};

export async function reviseQueries(
  input: FactCheckInput,
  claims: Claim[],
): Promise<{ claimId: string; query: string }[]> {
  const list = claims
    .map((c) => `${c.id}: ${c.text}\n  previous queries: ${c.searchQueries.join(" | ")}`)
    .join("\n");
  const prompt = `These claims found no usable sources with the previous web search queries. Query date: ${input.queryDate}.

${list}

Write ONE new English search query per claim that is more likely to find a reputable page (official league site, ESPN, FotMob, Sofascore, BBC, Reuters, team site). Try different wording, the stat site name, or the match report angle.`;
  const out = await runCodexJson<{ queries: { claimId: string; query: string }[] }>(
    prompt,
    revisedSchema,
    { label: "revisi query" },
  );
  const ids = new Set(claims.map((c) => c.id));
  return out.queries.filter((q) => ids.has(q.claimId) && q.query.trim());
}
