import type { FactCheckInput } from "./types";

type Field = keyof FactCheckInput;

export const FACT_CHECK_FIELDS: Field[] = [
  "userQuery",
  "fullResponse",
  "targetSentence",
  "queryDate",
];

const HEADINGS: { field: Field; names: string[] }[] = [
  { field: "queryDate", names: ["query date", "date of query"] },
  { field: "targetSentence", names: ["target sentence", "target claim"] },
  {
    field: "fullResponse",
    names: [
      "full llm response",
      "full response",
      "llm response",
      "model response",
      "response",
    ],
  },
  {
    field: "userQuery",
    names: ["user query", "user prompt", "user request", "query", "prompt"],
  },
];

const STOP_RE = /^(reviewer\b|\*?\s*required\b|factuality label\b|rating\b)/i;

const DESCRIPTION_RES = [
  /^the specific claim to be evaluated/i,
  /^the full response to the user'?s query/i,
  /^the date of the query/i,
  /^the user'?s (query|question|prompt)/i,
  /^\*?\s*required\s*$/i,
];

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function monthIndex(name: string) {
  const lower = name.toLowerCase();
  return MONTHS.findIndex((m) => m.startsWith(lower.slice(0, 3)));
}

export function normalizeDate(raw: string): string {
  const text = raw.trim();
  let m = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = text.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = text.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && monthIndex(m[1]) >= 0) {
    return `${m[3]}-${pad(monthIndex(m[1]) + 1)}-${pad(+m[2])}`;
  }
  m = text.match(/(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/);
  if (m && monthIndex(m[2]) >= 0) {
    return `${m[3]}-${pad(monthIndex(m[2]) + 1)}-${pad(+m[1])}`;
  }
  return "";
}

function matchHeading(line: string): { field: Field; rest: string } | null {
  const trimmed = line.trim().replace(/^[#*\s]+/, "").replace(/\*+$/, "");
  const lower = trimmed.toLowerCase();
  for (const { field, names } of HEADINGS) {
    for (const name of names) {
      if (lower === name || lower === `${name}:`) return { field, rest: "" };
      if (lower.startsWith(`${name}:`)) {
        return { field, rest: trimmed.slice(name.length + 1).trim() };
      }
    }
  }
  return null;
}

export function parseTaskText(raw: string): {
  values: Partial<FactCheckInput>;
  missing: Field[];
} {
  const buckets: Partial<Record<Field, string[]>> = {};
  let current: Field | null = null;

  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = matchHeading(line);
    if (heading) {
      current = heading.field;
      buckets[current] = buckets[current] || [];
      if (heading.rest) buckets[current]!.push(heading.rest);
      continue;
    }
    if (STOP_RE.test(line.trim())) {
      current = null;
      continue;
    }
    if (!current) continue;
    if (DESCRIPTION_RES.some((re) => re.test(line.trim()))) continue;
    buckets[current]!.push(line);
  }

  const values: Partial<FactCheckInput> = {};
  for (const field of FACT_CHECK_FIELDS) {
    const text = (buckets[field] || []).join("\n").trim();
    if (!text) continue;
    if (field === "queryDate") {
      const date = normalizeDate(text);
      if (date) values.queryDate = date;
    } else {
      values[field] = text.replace(/\n{3,}/g, "\n\n");
    }
  }

  return {
    values,
    missing: FACT_CHECK_FIELDS.filter((f) => !values[f]),
  };
}
