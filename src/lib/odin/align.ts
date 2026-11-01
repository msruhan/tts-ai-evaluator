import type { AlignmentCheck, IdeaMetadataAlignment, OdinMetadataSections } from "./types";

export type { AlignmentCheck, AlignmentStatus, IdeaMetadataAlignment } from "./types";

const STOP_HEADING =
  /^(?:#{1,6}\s*)?(?:\*\*|__)?(?:request|topology|format|task\s*description|apps?|applications|used\s*apps|workflow|steps|inputs?|outputs?|deliverables|notes|complexity|tools|objective)(?:\*\*|__)?\s*[:\-–]?\s*$/i;

/** Collapse whitespace only. Word, punctuation, and case stay significant. */
export function normalizeProse(value: string) {
  return String(value || "")
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractGoal(idea: string) {
  const lines = String(idea || "").replace(/\r\n/g, "\n").split("\n");
  let start = -1;
  let inline = "";
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i]
      .trim()
      .match(/^(?:#{1,6}\s*)?(?:\*\*|__)?goal(?:\*\*|__)?\s*[:\-–]?\s*(.*)$/i);
    if (!match) continue;
    start = i + 1;
    inline = (match[1] || "").trim();
    break;
  }
  if (start < 0) return "";

  const body: string[] = [];
  if (inline) body.push(inline);
  for (let i = start; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (STOP_HEADING.test(trimmed)) break;
    if (trimmed && /^(?:#{1,6}\s*)?(?:\*\*|__)?[A-Z][A-Za-z0-9 /&-]{1,40}(?:\*\*|__)?\s*:\s*$/.test(trimmed)) {
      break;
    }
    body.push(lines[i]);
  }
  return body.join("\n").trim();
}

export function proseDiff(left: string, right: string) {
  const a = normalizeProse(left);
  const b = normalizeProse(right);
  if (a === b) return "";
  let i = 0;
  const limit = Math.min(a.length, b.length);
  while (i < limit && a[i] === b[i]) i += 1;
  const from = Math.max(0, i - 24);
  return `Goal “…${a.slice(from, i + 36)}” vs Request “…${b.slice(from, i + 36)}”`;
}

function appsFromTopology(topology: string) {
  const parts = topology.split(/\s*(?:->|→|=>|\n)\s*/);
  const apps: string[] = [];
  for (const part of parts) {
    const name = part
      .replace(/\(.*?\)/g, " ")
      .replace(/\[.*?\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!name || name.length > 60) continue;
    if (/^(lookup|create|modify|edit|read)$/i.test(name)) continue;
    apps.push(name);
  }
  return [...new Set(apps)];
}

const STOP_WORDS = new Set(
  "a an the and or of to for with from into onto in on at by as is are was were be this that these those using use used via per about after before then than".split(
    " ",
  ),
);

function contentWords(text: string) {
  const words = normalizeProse(text)
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((word) => word.length >= 5 && !STOP_WORDS.has(word));
  return [...new Set(words)];
}

export function alignIdeaAndMetadata(
  idea: string,
  metadata: Pick<OdinMetadataSections, "request" | "topology" | "taskDescription">,
): IdeaMetadataAlignment {
  const goal = extractGoal(idea);
  const request = String(metadata.request || "").trim();
  const goalNorm = normalizeProse(goal);
  const requestNorm = normalizeProse(request);
  const exactMatch = Boolean(goalNorm) && goalNorm === requestNorm;

  const checks: AlignmentCheck[] = [];
  if (!goalNorm && !requestNorm) {
    checks.push({
      id: "goal-request",
      label: "Goal = Request",
      status: "missing",
      detail: "Bagian Goal di idea dan Request di metadata tidak ditemukan.",
    });
  } else if (!goalNorm) {
    checks.push({
      id: "goal-request",
      label: "Goal = Request",
      status: "missing",
      detail: "Idea tidak punya bagian Goal, jadi tidak bisa disamakan dengan Request.",
    });
  } else if (!requestNorm) {
    checks.push({
      id: "goal-request",
      label: "Goal = Request",
      status: "missing",
      detail: "Metadata tidak punya bagian Request.",
    });
  } else if (exactMatch) {
    checks.push({
      id: "goal-request",
      label: "Goal = Request",
      status: "match",
      detail: "Teks Goal dan Request sama persis (spasi dan baris baru diabaikan).",
    });
  } else {
    checks.push({
      id: "goal-request",
      label: "Goal = Request",
      status: "mismatch",
      detail: proseDiff(goal, request) || "Teks Goal dan Request berbeda.",
    });
  }

  const apps = appsFromTopology(metadata.topology || "");
  if (!apps.length) {
    checks.push({
      id: "apps",
      label: "App di topology ↔ idea",
      status: "missing",
      detail: "Topology kosong atau nama app tidak terbaca.",
    });
  } else {
    const ideaNorm = normalizeProse(idea).toLowerCase();
    const missing = apps.filter((app) => !ideaNorm.includes(app.toLowerCase()));
    checks.push({
      id: "apps",
      label: "App di topology ↔ idea",
      status: missing.length ? "mismatch" : "match",
      detail: missing.length
        ? `App di topology yang tidak disebut di idea: ${missing.join(", ")}.`
        : `Semua app di topology disebut di idea: ${apps.join(", ")}.`,
    });
  }

  const goalWords = contentWords(goal || request);
  const taskWords = new Set(contentWords(metadata.taskDescription || ""));
  if (!metadata.taskDescription?.trim()) {
    checks.push({
      id: "task",
      label: "Task description ↔ Goal",
      status: "missing",
      detail: "Task Description di metadata kosong.",
    });
  } else if (!goalWords.length) {
    checks.push({
      id: "task",
      label: "Task description ↔ Goal",
      status: "missing",
      detail: "Goal/Request terlalu pendek untuk dicek kaitannya dengan Task Description.",
    });
  } else {
    const shared = goalWords.filter((word) => taskWords.has(word));
    checks.push({
      id: "task",
      label: "Task description ↔ Goal",
      status: shared.length ? "match" : "mismatch",
      detail: shared.length
        ? `Task Description memakai kata yang sama dengan Goal/Request, antara lain: ${shared.slice(0, 8).join(", ")}.`
        : "Task Description tidak memakai kata bermakna yang sama dengan Goal/Request.",
    });
  }

  return { goal, request, exactMatch, checks };
}

export function formatAlignmentForPrompt(alignment: IdeaMetadataAlignment) {
  const lines = [
    "Deterministic check (authoritative — do not override):",
    `Goal vs Request exact match: ${alignment.exactMatch ? "YES" : "NO"}`,
    `Goal text: """${normalizeProse(alignment.goal) || "(missing)"}"""`,
    `Request text: """${normalizeProse(alignment.request) || "(missing)"}"""`,
  ];
  for (const check of alignment.checks) {
    lines.push(`- ${check.label}: ${check.status.toUpperCase()} — ${check.detail}`);
  }
  lines.push(
    "If Goal vs Request is not an exact match, it is a required correction: Metadata Request must be copied word for word from the Goal in the idea. Do not approve. Say what differs. This is a metadata text fix, not by itself a reason to re-record the screen.",
  );
  return lines.join("\n");
}
