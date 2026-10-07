import { isOnOrBefore, toCompactDate, toIsoDay } from "./dates";
import {
  capJson,
  findEspnEvents,
  findMlbGames,
  findNhlGames,
  trimEspnScoreboardEvent,
  trimEspnSummary,
  trimMlbBoxscore,
  trimNhlBoxscore,
} from "./trim";
import type { EntityHints, SourceCandidate } from "./types";

type LeagueSource =
  | { kind: "espn"; path: string; summary: boolean }
  | { kind: "mlb" }
  | { kind: "nhl" };

export const SPORTS_LEAGUES: Record<string, LeagueSource> = {
  mlb: { kind: "mlb" },
  nhl: { kind: "nhl" },
  nba: { kind: "espn", path: "basketball/nba", summary: true },
  wnba: { kind: "espn", path: "basketball/wnba", summary: true },
  "ncaa-mens-basketball": {
    kind: "espn",
    path: "basketball/mens-college-basketball",
    summary: true,
  },
  nfl: { kind: "espn", path: "football/nfl", summary: true },
  "college-football": { kind: "espn", path: "football/college-football", summary: true },
  "la-liga": { kind: "espn", path: "soccer/esp.1", summary: true },
  "premier-league": { kind: "espn", path: "soccer/eng.1", summary: true },
  "efl-championship": { kind: "espn", path: "soccer/eng.2", summary: true },
  "serie-a": { kind: "espn", path: "soccer/ita.1", summary: true },
  bundesliga: { kind: "espn", path: "soccer/ger.1", summary: true },
  "ligue-1": { kind: "espn", path: "soccer/fra.1", summary: true },
  eredivisie: { kind: "espn", path: "soccer/ned.1", summary: true },
  "primeira-liga": { kind: "espn", path: "soccer/por.1", summary: true },
  mls: { kind: "espn", path: "soccer/usa.1", summary: true },
  "liga-mx": { kind: "espn", path: "soccer/mex.1", summary: true },
  "champions-league": { kind: "espn", path: "soccer/uefa.champions", summary: true },
  "europa-league": { kind: "espn", path: "soccer/uefa.europa", summary: true },
  "fa-cup": { kind: "espn", path: "soccer/eng.fa", summary: true },
  "copa-del-rey": { kind: "espn", path: "soccer/esp.copa_del_rey", summary: true },
  "world-cup": { kind: "espn", path: "soccer/fifa.world", summary: true },
  pga: { kind: "espn", path: "golf/pga", summary: false },
  lpga: { kind: "espn", path: "golf/lpga", summary: false },
  liv: { kind: "espn", path: "golf/liv", summary: false },
  "dp-world-tour": { kind: "espn", path: "golf/eur", summary: false },
  atp: { kind: "espn", path: "tennis/atp", summary: false },
  wta: { kind: "espn", path: "tennis/wta", summary: false },
  ufc: { kind: "espn", path: "mma/ufc", summary: false },
  f1: { kind: "espn", path: "racing/f1", summary: false },
};

export const SPORTS_LEAGUE_KEYS = [...Object.keys(SPORTS_LEAGUES), "none"];

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const MLB_BASE = "https://statsapi.mlb.com/api/v1";
const NHL_BASE = "https://api-web.nhle.com/v1";

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function shiftDay(day: string, delta: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Days to probe, most likely first, never after the query date. */
function candidateDays(hints: EntityHints, queryDate: string): string[] {
  const event = toIsoDay(hints.eventDate);
  const days = event
    ? [event, shiftDay(event, -1), shiftDay(event, 1)]
    : Array.from({ length: 8 }, (_, i) => shiftDay(queryDate, -i));
  return [...new Set(days)].filter((d) => isOnOrBefore(d, queryDate));
}

function candidate(
  url: string,
  title: string,
  eventDay: string,
  excerpt: unknown,
  claimIds: string[],
): SourceCandidate {
  return {
    url,
    title,
    origin: "sports_api",
    publishedDate: eventDay,
    dateStatus: "before_query_date",
    claimIds: [...claimIds],
    apiExcerpt: capJson(excerpt),
  };
}

async function fromMlb(hints: EntityHints, queryDate: string, claimIds: string[]) {
  const days = candidateDays(hints, queryDate);
  if (!days.length) return [];
  const start = days.reduce((a, b) => (a < b ? a : b));
  const end = days.reduce((a, b) => (a > b ? a : b));
  const scheduleUrl = `${MLB_BASE}/schedule?sportId=1&startDate=${start}&endDate=${end}`;
  const games = findMlbGames(await getJson(scheduleUrl), hints.teams)
    .filter((g) => isOnOrBefore(g.date, queryDate))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 2);
  const out: SourceCandidate[] = [];
  for (const g of games) {
    const url = `${MLB_BASE}/game/${g.gamePk}/boxscore`;
    const box = await getJson(url);
    if (!box) continue;
    out.push(
      candidate(
        url,
        `MLB boxscore: ${g.away} at ${g.home} (${toIsoDay(g.date)})`,
        toIsoDay(g.date),
        { game: g, boxscore: trimMlbBoxscore(box, { players: hints.players }) },
        claimIds,
      ),
    );
  }
  return out;
}

async function fromNhl(hints: EntityHints, queryDate: string, claimIds: string[]) {
  for (const day of candidateDays(hints, queryDate)) {
    const games = findNhlGames(await getJson(`${NHL_BASE}/score/${day}`), hints.teams);
    if (!games.length) continue;
    const out: SourceCandidate[] = [];
    for (const g of games.slice(0, 2)) {
      const url = `${NHL_BASE}/gamecenter/${g.id}/boxscore`;
      const box = await getJson(url);
      if (!box) continue;
      out.push(
        candidate(
          url,
          `NHL boxscore: ${g.away} at ${g.home} (${g.date})`,
          g.date,
          trimNhlBoxscore(box, { players: hints.players }),
          claimIds,
        ),
      );
    }
    return out;
  }
  return [];
}

async function fromEspn(
  source: Extract<LeagueSource, { kind: "espn" }>,
  hints: EntityHints,
  queryDate: string,
  claimIds: string[],
) {
  for (const day of candidateDays(hints, queryDate)) {
    const scoreboardUrl = `${ESPN_BASE}/${source.path}/scoreboard?dates=${toCompactDate(day)}`;
    const scoreboard = await getJson(scoreboardUrl);
    const events = findEspnEvents(scoreboard, {
      teams: hints.teams,
      players: hints.players,
      eventName: hints.eventName,
    }).filter((e) => isOnOrBefore(String((e as { date?: string }).date || day), queryDate));
    if (!events.length) continue;

    const out: SourceCandidate[] = [];
    for (const event of events.slice(0, 2)) {
      const trimmed = trimEspnScoreboardEvent(event, { players: hints.players });
      const eventDay = toIsoDay(trimmed.date) || day;
      if (source.summary && trimmed.id) {
        const url = `${ESPN_BASE}/${source.path}/summary?event=${trimmed.id}`;
        const summary = await getJson(url);
        if (summary) {
          out.push(
            candidate(
              url,
              `ESPN summary: ${trimmed.name} (${eventDay})`,
              eventDay,
              trimEspnSummary(summary, { players: hints.players }),
              claimIds,
            ),
          );
          continue;
        }
      }
      out.push(
        candidate(
          scoreboardUrl,
          `ESPN scoreboard: ${trimmed.name} (${eventDay})`,
          eventDay,
          trimmed,
          claimIds,
        ),
      );
    }
    return out;
  }
  return [];
}

export async function fetchSportsEvidence(
  hints: EntityHints,
  queryDate: string,
  claimIds: string[],
): Promise<SourceCandidate[]> {
  const source = SPORTS_LEAGUES[hints.league];
  if (!source) return [];
  try {
    if (source.kind === "mlb") return await fromMlb(hints, queryDate, claimIds);
    if (source.kind === "nhl") return await fromNhl(hints, queryDate, claimIds);
    return await fromEspn(source, hints, queryDate, claimIds);
  } catch {
    return [];
  }
}
