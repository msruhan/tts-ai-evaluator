import assert from "node:assert/strict";
import { test } from "node:test";
import { countTables, parseResponseBlocks } from "../response-format.ts";

test("detects tab-separated table between paragraphs", () => {
  const blocks = parseResponseBlocks(
    "Intro line.\n\nStatistic\tRayo Vallecano\tEspanyol\nScore\t2\t1\nExpected Goals (xG)\t1.33\t0.82\n\nOutro.",
  );
  assert.deepEqual(blocks.map((b) => b.type), ["text", "table", "text"]);
  const table = blocks[1] as { type: "table"; rows: string[][] };
  assert.deepEqual(table.rows[2], ["Expected Goals (xG)", "1.33", "0.82"]);
});

test("detects markdown pipe table and skips separator row", () => {
  const blocks = parseResponseBlocks("| A | B |\n|---|---|\n| 1 | 2 |");
  assert.equal(blocks.length, 1);
  assert.deepEqual((blocks[0] as { rows: string[][] }).rows, [
    ["A", "B"],
    ["1", "2"],
  ]);
});

test("single tab line stays text and ragged rows are padded", () => {
  assert.equal(countTables("just\tone line"), 0);
  const blocks = parseResponseBlocks("H1\tH2\tH3\nx\ty");
  assert.deepEqual((blocks[0] as { rows: string[][] }).rows[1], ["x", "y", ""]);
});
