import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  capJson,
  findEspnEvents,
  nameMatches,
  trimEspnScoreboardEvent,
  trimEspnSummary,
  trimMlbBoxscore,
} from "../trim.ts";

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../../fixtures/factcheck/${name}`, import.meta.url), "utf8"));

test("nameMatches handles accents, suffixes and partial names", () => {
  assert.ok(nameMatches("Rayo Vallecano", ["Rayo"]));
  assert.ok(nameMatches("Deportivo Alavés", ["Alaves"]));
  assert.ok(nameMatches("Philadelphia Phillies", ["Phillies"]));
  assert.ok(!nameMatches("Real Madrid", ["Real Sociedad"]));
});

test("trims MLB boxscore to team totals and mentioned players", () => {
  const out = trimMlbBoxscore(fixture("mlb-boxscore-823576.json"), {
    players: ["Jeremiah Jackson"],
  });
  assert.equal(out.away.team, "Baltimore Orioles");
  assert.equal(out.away.runs, 7);
  assert.equal(out.away.homeRuns, 4);
  assert.equal(out.away.mentionedPlayers.length, 1);
  assert.match(out.away.mentionedPlayers[0].batting, /HR/);
  assert.ok(capJson(out).length < 4100);
});

test("finds ESPN golf event and keeps top-10 plus mentioned players", () => {
  const sb = fixture("espn-pga-scoreboard-20260830.json");
  const events = findEspnEvents(sb, {
    teams: [],
    players: ["Scottie Scheffler"],
    eventName: "",
  });
  assert.equal(events[0].name, "TOUR Championship");
  const trimmed = trimEspnScoreboardEvent(events[0], { players: ["Scottie Scheffler"] });
  assert.equal(trimmed.competitors[0].name, "Scottie Scheffler");
  assert.ok(trimmed.competitors.length <= 11);
});

test("trims ESPN soccer summary with team stats and key events", () => {
  const out = trimEspnSummary(fixture("espn-soccer-summary-401882868.json"), {
    players: ["Álvaro García"],
  });
  assert.deepEqual(
    out.header.competitors.map((c: { name: string; score: string }) => [c.name, c.score]),
    [
      ["Rayo Vallecano", "2"],
      ["Espanyol", "1"],
    ],
  );
  assert.equal(out.teamStats[0].stats.Fouls, "10");
  assert.ok(out.keyEvents.some((t: string) => /Goal!/.test(t)));
  assert.ok(out.players.length >= 1);
  assert.ok(!JSON.stringify(out.players).includes("jerseyImages"));
});
