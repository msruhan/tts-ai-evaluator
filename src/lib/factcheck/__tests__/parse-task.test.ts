import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDate, parseTaskText } from "../parse-task.ts";

const SCREENSHOT_STYLE = `Target Sentence
the specific claim to be evaluated for Factuality

Rayo Vallecano, Expected Goals (xG): 1.33

Response
the full response to the user's query

In their most recent La Liga meeting on September 15, 2026, Rayo Vallecano defeated Espanyol 2-1.

Statistic Rayo Vallecano Espanyol
Expected Goals (xG) 1.33 0.82

Query Date
The date of the query. Please evaluate the sentence as of this date! All Ratings must be done with respect to the query date.

2026-09-23

* required
Reviewer 1 Factuality Label *
Raters should select the most appropriate label`;

test("parses screenshot-style task text", () => {
  const { values, missing } = parseTaskText(SCREENSHOT_STYLE);
  assert.equal(values.targetSentence, "Rayo Vallecano, Expected Goals (xG): 1.33");
  assert.match(values.fullResponse!, /^In their most recent La Liga meeting/);
  assert.match(values.fullResponse!, /0\.82$/);
  assert.equal(values.queryDate, "2026-09-23");
  assert.deepEqual(missing, ["userQuery"]);
});

test("parses user query and inline headings in any order", () => {
  const { values, missing } = parseTaskText(
    `Query Date: September 23, 2026\nUser Query:\nWho won Rayo vs Espanyol?\nTarget Sentence: Rayo won 2-1.\nFull Response\nRayo won 2-1.`,
  );
  assert.equal(values.queryDate, "2026-09-23");
  assert.equal(values.userQuery, "Who won Rayo vs Espanyol?");
  assert.equal(values.targetSentence, "Rayo won 2-1.");
  assert.equal(values.fullResponse, "Rayo won 2-1.");
  assert.deepEqual(missing, []);
});

test("normalizes date formats", () => {
  assert.equal(normalizeDate("2026-9-3"), "2026-09-03");
  assert.equal(normalizeDate("23/09/2026"), "2026-09-23");
  assert.equal(normalizeDate("Sep 23, 2026"), "2026-09-23");
  assert.equal(normalizeDate("23 September 2026"), "2026-09-23");
  assert.equal(normalizeDate("yesterday"), "");
});

test("reports all fields missing for unrelated text", () => {
  const { missing } = parseTaskText("hello world");
  assert.equal(missing.length, 4);
});
