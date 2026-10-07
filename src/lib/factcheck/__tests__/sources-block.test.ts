import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSourcesBlock,
  composeCopyText,
  dedupeUrls,
  extractUrls,
  stripUnverifiedUrls,
} from "../sources-block.ts";

const VERIFIED = [
  "https://www.espn.com/soccer/match/_/gameId/401882868",
  "https://www.fotmob.com/match/123",
];

test("sources block keeps only verified URLs, deduped and ordered", () => {
  const block = buildSourcesBlock(
    [
      "https://www.fotmob.com/match/123/",
      "https://fake.example.com/made-up",
      "https://www.espn.com/soccer/match/_/gameId/401882868?utm_source=x",
      "https://www.fotmob.com/match/123",
    ],
    VERIFIED,
  );
  assert.equal(
    block,
    "Sources:\nhttps://www.fotmob.com/match/123/\nhttps://www.espn.com/soccer/match/_/gameId/401882868?utm_source=x",
  );
  assert.equal(buildSourcesBlock(["https://nope.example"], VERIFIED), "");
});

test("strips unverified URLs from narrative text", () => {
  const text =
    "FotMob (https://www.fotmob.com/match/123) and a blog (https://fake.example.com/x) agree.";
  assert.equal(
    stripUnverifiedUrls(text, VERIFIED),
    "FotMob (https://www.fotmob.com/match/123) and a blog agree.",
  );
});

test("extracts and dedupes URLs from notes", () => {
  const urls = extractUrls("cek https://a.com/x, lalu https://a.com/x. dan (https://b.com/y)");
  assert.deepEqual(urls, ["https://a.com/x", "https://b.com/y"]);
  assert.deepEqual(dedupeUrls(["https://a.com/x/", "https://A.com/x", "ftp://z"]), ["https://a.com/x/"]);
});

test("composes copy text", () => {
  assert.equal(composeCopyText("Para.", "Sources:\nhttps://a.com"), "Para.\n\nSources:\nhttps://a.com");
  assert.equal(composeCopyText("Para.", ""), "Para.");
});
