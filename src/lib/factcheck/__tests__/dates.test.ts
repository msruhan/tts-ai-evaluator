import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyDate, toCompactDate, toIsoDay } from "../dates.ts";

test("classifies against query date", () => {
  assert.equal(classifyDate("2026-09-15", "2026-09-23"), "before_query_date");
  assert.equal(classifyDate("2026-09-23T22:00:00Z", "2026-09-23"), "before_query_date");
  assert.equal(classifyDate("2026-09-25", "2026-09-23"), "after_query_date");
  assert.equal(classifyDate(undefined, "2026-09-23"), "unknown_date");
  assert.equal(classifyDate("not a date", "2026-09-23"), "unknown_date");
});

test("parses RFC dates", () => {
  assert.equal(toIsoDay("Tue, 15 Sep 2026 20:00:00 GMT"), "2026-09-15");
});

test("compact date for ESPN", () => {
  assert.equal(toCompactDate("2026-08-30"), "20260830");
});
