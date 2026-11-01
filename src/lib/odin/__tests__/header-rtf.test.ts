import assert from "node:assert/strict";
import { test } from "node:test";
import { attachHeader, formatOdinReviewHeader } from "../header.ts";
import { parseMetadataRtf, rtfToText } from "../rtf.ts";

test("GMT header uses UTC and reviewer name", () => {
  const now = new Date("2026-11-02T05:43:00+07:00");
  const header = formatOdinReviewHeader("1", "Masruhan K", now);
  assert.equal(header, "11/01 @22:43 GMT (UTC+0), Review 1, Masruhan K");
});

test("empty review number becomes #", () => {
  const now = new Date("2026-11-01T00:00:00Z");
  assert.match(formatOdinReviewHeader("", "Masruhan K", now), /Review #, Masruhan K$/);
});

test("attachHeader does not duplicate", () => {
  const h = "11/01 @22:43 GMT (UTC+0), Review 1, Masruhan K";
  const once = attachHeader(h, "ok");
  assert.equal(attachHeader(h, once), once);
});

test("rtf parser extracts topology/request/task description", () => {
  const rtf = `{\\rtf1\\ansi
Topology:\\par
Finder (LOOKUP) -> Pages (CREATE)\\par
Request:\\par
Make a one-page brief.\\par
Task Description:\\par
1. Look up stats in Finder\\par
2. Draft in Pages\\par
}`;
  const text = rtfToText(rtf);
  assert.match(text, /Finder \(LOOKUP\)/);
  const parsed = parseMetadataRtf(rtf);
  assert.match(parsed.topology, /LOOKUP/);
  assert.match(parsed.request, /one-page brief/);
  assert.match(parsed.taskDescription, /Draft in Pages/);
});
