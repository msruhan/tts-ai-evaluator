import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectBlockedOrError,
  excerptAround,
  extractPublishedDate,
  extractTitle,
  htmlToText,
  matchKeyValues,
} from "../link-text.ts";

test("htmlToText drops scripts and decodes entities", () => {
  const html = `<html><head><title>Rayo &amp; Espanyol</title><script>var x=1</script></head>
  <body><nav>menu</nav><p>Rayo Vallecano xG&nbsp;1.33</p><p>Espanyol 0.82</p></body></html>`;
  assert.equal(extractTitle(html), "Rayo & Espanyol");
  const text = htmlToText(html);
  assert.ok(!text.includes("var x"));
  assert.ok(!text.includes("menu"));
  assert.match(text, /Rayo Vallecano xG 1\.33/);
});

test("extracts published date from meta and JSON-LD", () => {
  assert.equal(
    extractPublishedDate(`<meta property="article:published_time" content="2026-09-16T10:00:00Z">`),
    "2026-09-16T10:00:00Z",
  );
  assert.equal(extractPublishedDate(`{"datePublished":"2026-09-25"}`), "2026-09-25");
  assert.equal(extractPublishedDate("<p>no date</p>"), "");
});

test("detects short error and bot pages but not long articles", () => {
  assert.equal(detectBlockedOrError("Sorry, page not found.", "Oops"), "halaman tidak ditemukan");
  assert.equal(detectBlockedOrError("Please complete the captcha", ""), "captcha / bot check");
  assert.equal(detectBlockedOrError("x".repeat(5000) + " access denied", "Match report"), "");
  assert.equal(detectBlockedOrError("ok", "404 Not Found"), "halaman tidak ditemukan");
});

test("matches numeric key values exactly", () => {
  const text = "Rayo Vallecano xG 1.33 and shots 11.33 total. Álvaro García scored.";
  assert.deepEqual(matchKeyValues(text, ["1.33", "Rayo Vallecano"]), {
    keyMatch: "match",
    matchedValues: ["1.33", "Rayo Vallecano"],
  });
  assert.equal(matchKeyValues("value 11.33 only", ["1.33"]).keyMatch, "no_match");
  assert.equal(matchKeyValues(text, ["Alvaro Garcia", "2.10"]).keyMatch, "partial");
});

test("excerpt keeps text around matched values", () => {
  const text = "a".repeat(3000) + " xG 1.33 " + "b".repeat(3000);
  const ex = excerptAround(text, ["1.33"], 400);
  assert.ok(ex.includes("1.33"));
  assert.ok(ex.length <= 400);
});
