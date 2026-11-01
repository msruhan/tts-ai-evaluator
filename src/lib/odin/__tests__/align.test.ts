import assert from "node:assert/strict";
import { test } from "node:test";
import { alignIdeaAndMetadata, extractGoal } from "../align.ts";

test("extracts Goal until the next section", () => {
  const idea = `Goal
Measure the loading bottleneck, then export a Lighthouse report.

Apps
Google Chrome, Visual Studio Code
`;
  assert.equal(
    extractGoal(idea),
    "Measure the loading bottleneck, then export a Lighthouse report.",
  );
});

test("Goal and Request match after whitespace differences", () => {
  const idea = "Goal: Make a one-page brief for the launch.";
  const alignment = alignIdeaAndMetadata(idea, {
    request: "Make a one-page\nbrief for the launch.",
    topology: "Finder (LOOKUP) -> Pages (CREATE)",
    taskDescription: "1. Look up the launch brief in Finder\n2. Draft the one-page brief in Pages",
  });
  assert.equal(alignment.exactMatch, true);
  assert.equal(alignment.checks.find((c) => c.id === "goal-request")?.status, "match");
  assert.equal(alignment.checks.find((c) => c.id === "apps")?.status, "mismatch");
});

test("one different word fails the exact check", () => {
  const alignment = alignIdeaAndMetadata("Goal: Make a one-page brief.", {
    request: "Make a two-page brief.",
    topology: "",
    taskDescription: "1. Draft the brief",
  });
  assert.equal(alignment.exactMatch, false);
  assert.match(alignment.checks[0].detail, /one-page/);
});
