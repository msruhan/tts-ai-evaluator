export type ResponseBlock =
  | { type: "text"; lines: string[] }
  | { type: "table"; rows: string[][] };

const PIPE_SEPARATOR_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] | null {
  if (line.includes("\t")) {
    const cells = line.split("\t").map((c) => c.trim());
    while (cells.length && cells[cells.length - 1] === "") cells.pop();
    return cells.length >= 2 ? cells : null;
  }
  const trimmed = line.trim();
  if (trimmed.startsWith("|") || (trimmed.match(/\|/g) || []).length >= 2) {
    const cells = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    return cells.length >= 2 ? cells : null;
  }
  return null;
}

export function parseResponseBlocks(text: string): ResponseBlock[] {
  const blocks: ResponseBlock[] = [];
  let pendingRows: string[][] = [];
  let pendingRaw: string[] = [];

  const pushText = (line: string) => {
    const last = blocks[blocks.length - 1];
    if (last?.type === "text") last.lines.push(line);
    else blocks.push({ type: "text", lines: [line] });
  };
  const flushRows = () => {
    if (pendingRows.length >= 2) {
      const width = Math.max(...pendingRows.map((r) => r.length));
      blocks.push({
        type: "table",
        rows: pendingRows.map((r) => [...r, ...Array(width - r.length).fill("")]),
      });
    } else {
      pendingRaw.forEach(pushText);
    }
    pendingRows = [];
    pendingRaw = [];
  };

  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (PIPE_SEPARATOR_RE.test(line) && pendingRows.length) continue;
    const row = splitRow(line);
    if (row) {
      pendingRows.push(row);
      pendingRaw.push(line);
      continue;
    }
    flushRows();
    pushText(line);
  }
  flushRows();

  return blocks
    .map((b) =>
      b.type === "text"
        ? { ...b, lines: trimBlankEdges(b.lines) }
        : b,
    )
    .filter((b) => b.type === "table" || b.lines.length > 0);
}

function trimBlankEdges(lines: string[]) {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end);
}

export function countTables(text: string): number {
  return parseResponseBlocks(text).filter((b) => b.type === "table").length;
}
