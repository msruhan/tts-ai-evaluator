import type { GyroTaskContext, P1Tag, P2Tag, P3Tag } from "./types";

function sectionAfter(raw: string, startRe: RegExp, endRe?: RegExp): string {
  const m = raw.match(startRe);
  if (!m || m.index == null) return "";
  const from = m.index + m[0].length;
  const rest = raw.slice(from);
  if (!endRe) return rest.trim();
  const end = rest.search(endRe);
  return (end >= 0 ? rest.slice(0, end) : rest).trim();
}

function parseP1FromLayout(raw: string): P1Tag {
  if (/\bP1\s*[-–—]?\s*DIRECT\b/i.test(raw) || /\bP1:DIRECT\b/i.test(raw)) {
    return "P1:DIRECT";
  }
  if (/\bP1\s*[-–—]?\s*CONVO\b/i.test(raw) || /\bP1:CONVO\b/i.test(raw)) {
    return "P1:CONVO";
  }
  return "";
}

function parseP2FromLayout(raw: string): P2Tag {
  if (/\bP2:LEAVE\/WAIT\b/i.test(raw) || /\bLEAVE\/WAIT\b/i.test(raw)) {
    return "P2:LEAVE/WAIT";
  }
  if (/\bP2:IMPATIENT\b/i.test(raw) || /\bIMPATIENT\b/i.test(raw)) {
    // Only if layout explicitly mentions impatient behavior in while section
    if (/While Instruction|While - Turn|⏳/i.test(raw)) {
      return "P2:IMPATIENT";
    }
  }
  if (/\bP2:RELATED\b/i.test(raw)) return "P2:RELATED";
  if (/\bP2:UNRELATED\b/i.test(raw)) return "P2:UNRELATED";
  return "";
}

function parseP3FromLayout(raw: string): P3Tag {
  if (/\bP3:DRILL WHILE READING\b/i.test(raw)) return "P3:DRILL WHILE READING";
  if (/\bP3:FOLLOWUP-DR\b/i.test(raw)) return "P3:FOLLOWUP-DR";
  if (/\bP3:DISCUSSION\b/i.test(raw)) return "P3:DISCUSSION";
  if (/\bP3:SUMMARIZE\b/i.test(raw)) return "P3:SUMMARIZE";
  return "";
}

function parseWhileTurns(raw: string): string[] {
  const turns: string[] = [];
  const re =
    /(?:⏳\s*)?While\s*[-–—]?\s*Turn\s*(\d+)\s*:\s*([^\n]+)/gi;
  let m: RegExpExecArray | null;
  const byNum = new Map<number, string>();
  while ((m = re.exec(raw)) !== null) {
    const n = Number(m[1]);
    const text = m[2].trim();
    if (n >= 1 && n <= 10 && text) byNum.set(n, text);
  }
  const nums = [...byNum.keys()].sort((a, b) => a - b);
  for (const n of nums) turns.push(byNum.get(n) || "");
  return turns;
}

/** Parse Outlier "Your Layout Summary" paste into structured context fields. */
export function parseLayoutSummary(paste: string): Partial<GyroTaskContext> {
  const raw = String(paste || "");
  if (!raw.trim()) return {};

  const scene = sectionAfter(
    raw,
    /(?:🎬\s*)?Scene Description\s*:\s*/i,
    /\n🎯|\nUser Goal|\n📋|\nBefore Instructions|\n💬|\n⏳|\n🏁/i,
  )
    .split("\n")[0]
    ?.trim();

  const userGoal = sectionAfter(
    raw,
    /(?:🎯\s*)?User Goal\s*:\s*/i,
    /\n📋|\nBefore Instructions|\n💬|\n⏳|\n🏁/i,
  );

  const beforeInstructions = sectionAfter(
    raw,
    /(?:📋\s*)?Before Instructions\s*:\s*/i,
    /\n💬|\nP1\b|\n⏳|\nWhile |\n🏁/i,
  );

  const initialPrompt = sectionAfter(
    raw,
    /(?:💬\s*)?P1\s*[-–—]?\s*(?:DIRECT|CONVO)\s*:\s*Initial Prompt\s*:\s*/i,
    /\n⏳|\nWhile |\n🏁|\nAfter /i,
  ) || sectionAfter(
    raw,
    /Initial Prompt\s*:\s*/i,
    /\n⏳|\nWhile |\n🏁|\nAfter /i,
  );

  const whileInstructions = sectionAfter(
    raw,
    /(?:⏳\s*)?While Instructions?\s*:\s*/i,
    /\n⏳\s*While\s*[-–—]?\s*Turn|\nWhile\s*[-–—]?\s*Turn|\n🏁|\nAfter /i,
  );

  const afterInstructions = sectionAfter(
    raw,
    /(?:🏁\s*)?After Instructions?\s*:\s*/i,
    /\n🏁\s*After Draft|\nAfter Draft\s*:/i,
  );

  const afterDraft = sectionAfter(
    raw,
    /(?:🏁\s*)?After Draft\s*:\s*/i,
  );

  const whileTurns = parseWhileTurns(raw);
  const p1 = parseP1FromLayout(raw);
  const p2 = parseP2FromLayout(raw);
  const p3 = parseP3FromLayout(raw);

  let sceneKind: GyroTaskContext["sceneKind"] = "";
  if (/screen share|screen-share|website|product (page|listing)/i.test(raw)) {
    sceneKind = "screen_share";
  } else if (/\bcamera\b/i.test(scene || "")) {
    sceneKind = "camera";
  }

  return {
    scene: scene || "",
    sceneKind,
    multimodal: /screen share|🎥|multimodal/i.test(raw) ? "yes" : "unknown",
    requiresScene: /screen share|🎥/i.test(raw) ? "yes" : "unknown",
    userGoal,
    initialPrompt,
    beforeInstructions,
    whileInstructions,
    afterInstructions,
    whileTurns,
    afterDraft,
    p1,
    p2,
    p3,
    layoutSummary: raw.slice(0, 20000),
  };
}

export function preferNonEmpty(
  primary: string | undefined,
  fallback: string | undefined,
): string {
  const a = (primary || "").trim();
  if (a) return a;
  return (fallback || "").trim();
}
