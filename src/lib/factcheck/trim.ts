/* eslint-disable @typescript-eslint/no-explicit-any */

const NOISE_KEYS = new Set([
  "links",
  "link",
  "logo",
  "logos",
  "darkLogo",
  "href",
  "jerseyImages",
  "headshot",
  "flag",
  "uid",
  "guid",
  "$ref",
  "copyright",
  "broadcasts",
  "geoBroadcasts",
  "odds",
  "videos",
  "images",
]);

const GENERIC_NAME_TOKENS = new Set([
  "real",
  "united",
  "city",
  "athletic",
  "atletico",
  "sporting",
  "deportivo",
  "racing",
  "inter",
  "state",
  "saint",
  "olympique",
  "borussia",
  "university",
  "college",
]);

export function normalizeName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|sc|afc|club|de|the)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameMatches(candidate: string | undefined, wanted: string[]): boolean {
  if (!candidate || !wanted.length) return false;
  const c = normalizeName(candidate);
  if (!c) return false;
  return wanted.some((w) => {
    const n = normalizeName(w);
    if (!n) return false;
    if (c.includes(n) || n.includes(c)) return true;
    const distinctive = (t: string) => t.length >= 4 && !GENERIC_NAME_TOKENS.has(t);
    const cTokens = new Set(c.split(" ").filter(distinctive));
    return n.split(" ").some((t) => distinctive(t) && cTokens.has(t));
  });
}

export function stripNoise(value: any, depth = 0): any {
  if (depth > 12) return undefined;
  if (Array.isArray(value)) return value.map((v) => stripNoise(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (NOISE_KEYS.has(k)) continue;
      out[k] = stripNoise(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function capJson(value: unknown, max = 4000): string {
  const text = JSON.stringify(value);
  return text.length <= max ? text : `${text.slice(0, max)}…[truncated]`;
}

function findAll(value: any, pred: (o: any) => boolean, out: any[] = [], depth = 0): any[] {
  if (depth > 14 || !value || typeof value !== "object") return out;
  if (!Array.isArray(value) && pred(value)) {
    out.push(value);
    return out;
  }
  for (const v of Object.values(value)) findAll(v, pred, out, depth + 1);
  return out;
}

// ---------- MLB (statsapi.mlb.com) ----------

export function findMlbGames(schedule: any, teams: string[]) {
  const games: any[] = (schedule?.dates || []).flatMap((d: any) => d.games || []);
  return games
    .filter(
      (g) =>
        !teams.length ||
        nameMatches(g?.teams?.away?.team?.name, teams) ||
        nameMatches(g?.teams?.home?.team?.name, teams),
    )
    .map((g) => ({
      gamePk: g.gamePk as number,
      date: (g.officialDate || g.gameDate || "") as string,
      away: g?.teams?.away?.team?.name as string,
      home: g?.teams?.home?.team?.name as string,
      awayScore: g?.teams?.away?.score,
      homeScore: g?.teams?.home?.score,
      status: g?.status?.detailedState as string,
    }));
}

export function trimMlbBoxscore(json: any, opts: { players: string[] }) {
  const side = (key: "away" | "home") => {
    const t = json?.teams?.[key] || {};
    const b = t.teamStats?.batting || {};
    const p = t.teamStats?.pitching || {};
    const f = t.teamStats?.fielding || {};
    const mentioned = Object.values(t.players || {})
      .filter((pl: any) => nameMatches(pl?.person?.fullName, opts.players))
      .map((pl: any) => ({
        name: pl.person.fullName,
        position: pl.position?.abbreviation,
        batting: pl.stats?.batting?.summary || undefined,
        battingStats: pl.stats?.batting && Object.keys(pl.stats.batting).length
          ? {
              atBats: pl.stats.batting.atBats,
              hits: pl.stats.batting.hits,
              homeRuns: pl.stats.batting.homeRuns,
              rbi: pl.stats.batting.rbi,
              runs: pl.stats.batting.runs,
            }
          : undefined,
        pitching: pl.stats?.pitching?.summary || undefined,
      }));
    return {
      team: t.team?.name,
      record: t.team?.record
        ? `${t.team.record.wins}-${t.team.record.losses}`
        : undefined,
      runs: b.runs,
      hits: b.hits,
      homeRuns: b.homeRuns,
      strikeOutsBatting: b.strikeOuts,
      errors: f.errors,
      pitchingStrikeOuts: p.strikeOuts,
      mentionedPlayers: mentioned,
    };
  };
  return {
    away: side("away"),
    home: side("home"),
    info: (json?.info || [])
      .filter((i: any) => i?.label && i?.value)
      .slice(0, 12)
      .map((i: any) => `${i.label}: ${i.value}`),
    topPerformers: (json?.topPerformers || [])
      .map((tp: any) => tp?.player?.person?.fullName)
      .filter(Boolean),
  };
}

// ---------- ESPN (site.api.espn.com) ----------

function competitorName(c: any): string {
  return (
    c?.team?.displayName ||
    c?.athlete?.displayName ||
    c?.athlete?.fullName ||
    c?.team?.name ||
    ""
  );
}

export function findEspnEvents(
  scoreboard: any,
  opts: { teams: string[]; players: string[]; eventName: string },
) {
  const events: any[] = scoreboard?.events || [];
  const wanted = [...opts.teams, ...(opts.eventName ? [opts.eventName] : [])];
  return events.filter((e) => {
    if (!wanted.length && !opts.players.length) return true;
    if (opts.eventName && nameMatches(e?.name, [opts.eventName])) return true;
    const comps: any[] = e?.competitions?.[0]?.competitors || [];
    const names = comps.map(competitorName);
    if (opts.teams.length && names.some((n) => nameMatches(n, opts.teams))) return true;
    return opts.players.length > 0 && names.some((n) => nameMatches(n, opts.players));
  });
}

export function trimEspnScoreboardEvent(event: any, opts: { players: string[] }) {
  const comp = event?.competitions?.[0] || {};
  const competitors: any[] = comp.competitors || [];
  const isIndividual = competitors.length > 4;
  const rows = competitors
    .filter(
      (c, i) =>
        !isIndividual || i < 10 || nameMatches(competitorName(c), opts.players),
    )
    .map((c) => ({
      name: competitorName(c),
      score: c.score,
      order: c.order,
      homeAway: c.homeAway,
      winner: c.winner,
    }));
  return {
    id: event?.id,
    name: event?.name,
    date: event?.date,
    endDate: event?.endDate,
    status: event?.status?.type?.description || comp?.status?.type?.description,
    competitors: rows,
  };
}

export function trimEspnSummary(json: any, opts: { players: string[] }) {
  const comp = json?.header?.competitions?.[0] || {};
  const header = {
    date: comp.date,
    status: comp.status?.type?.description,
    competitors: (comp.competitors || []).map((c: any) => ({
      name: competitorName(c),
      score: c.score,
      homeAway: c.homeAway,
      winner: c.winner,
    })),
  };
  const teamStats = (json?.boxscore?.teams || []).map((t: any) => ({
    team: t?.team?.displayName,
    stats: Object.fromEntries(
      (t?.statistics || [])
        .filter((s: any) => s?.label || s?.name)
        .map((s: any) => [s.label || s.name, s.displayValue]),
    ),
  }));
  const keyEvents = (json?.keyEvents || json?.scoringPlays || [])
    .map((e: any) => e?.text)
    .filter(Boolean)
    .slice(0, 20);
  const players = opts.players.length
    ? findAll(
        json,
        (o) =>
          o?.athlete &&
          typeof o.athlete === "object" &&
          nameMatches(o.athlete.displayName || o.athlete.fullName, opts.players),
      )
        .slice(0, 6)
        .map((o) => stripNoise(o))
    : [];
  return { header, teamStats, keyEvents, players };
}

// ---------- NHL (api-web.nhle.com) ----------

export function findNhlGames(score: any, teams: string[]) {
  const games: any[] = score?.games || [];
  const teamName = (t: any) =>
    [t?.placeName?.default, t?.name?.default || t?.commonName?.default, t?.abbrev]
      .filter(Boolean)
      .join(" ");
  return games
    .filter(
      (g) =>
        !teams.length ||
        nameMatches(teamName(g.homeTeam), teams) ||
        nameMatches(teamName(g.awayTeam), teams),
    )
    .map((g) => ({
      id: g.id as number,
      date: g.gameDate as string,
      home: teamName(g.homeTeam),
      away: teamName(g.awayTeam),
      homeScore: g.homeTeam?.score,
      awayScore: g.awayTeam?.score,
      state: g.gameState,
    }));
}

function lastNameMatches(abbrev: string | undefined, players: string[]) {
  if (!abbrev) return false;
  const last = normalizeName(abbrev.split(" ").slice(-1)[0] || "");
  return players.some((p) => normalizeName(p).split(" ").slice(-1)[0] === last);
}

export function trimNhlBoxscore(json: any, opts: { players: string[] }) {
  const team = (t: any) => ({
    team: [t?.placeName?.default, t?.commonName?.default].filter(Boolean).join(" "),
    score: t?.score,
    shotsOnGoal: t?.sog,
  });
  const groups = json?.playerByGameStats || {};
  const players = ["homeTeam", "awayTeam"].flatMap((side) =>
    ["forwards", "defense", "goalies"].flatMap((g) =>
      (groups?.[side]?.[g] || []).filter((p: any) =>
        lastNameMatches(p?.name?.default, opts.players),
      ),
    ),
  );
  return {
    date: json?.gameDate,
    state: json?.gameState,
    home: team(json?.homeTeam),
    away: team(json?.awayTeam),
    outcome: json?.gameOutcome?.lastPeriodType,
    players,
  };
}
