import type { OdinMetadataSections } from "./types";

function decodeHexByte(hex: string) {
  const n = Number.parseInt(hex, 16);
  return Number.isFinite(n) ? String.fromCharCode(n) : "";
}

/** Lightweight RTF → plain text. Enough for Metadata.rtf Topology/Request/Task Description. */
export function rtfToText(rtf: string) {
  const src = String(rtf || "");
  if (!src.trim().startsWith("{\\rtf")) {
    return src.replace(/\r\n/g, "\n").trim();
  }

  let out = "";
  let i = 0;
  const skipGroups = new Set(["fonttbl", "colortbl", "stylesheet", "info", "pict", "*"]);

  const skipGroup = () => {
    let depth = 1;
    i += 1;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === "\\") i += 1;
      i += 1;
    }
  };

  while (i < src.length) {
    const ch = src[i];
    if (ch === "{") {
      const peek = src.slice(i + 1, i + 24);
      const dest = peek.match(/^\\(\*|[a-z]+)/i)?.[1]?.toLowerCase();
      if (dest && skipGroups.has(dest)) {
        skipGroup();
        continue;
      }
      i += 1;
      continue;
    }
    if (ch === "}") {
      i += 1;
      continue;
    }
    if (ch === "\\") {
      const next = src[i + 1];
      if (next === "\\" || next === "{" || next === "}") {
        out += next;
        i += 2;
        continue;
      }
      if (next === "'") {
        out += decodeHexByte(src.slice(i + 2, i + 4));
        i += 4;
        continue;
      }
      if (next === "u") {
        const m = src.slice(i).match(/^\\u(-?\d+)\s?/);
        if (m) {
          let code = Number(m[1]);
          if (code < 0) code += 65536;
          out += String.fromCharCode(code);
          i += m[0].length;
          continue;
        }
      }
      const ctrl = src.slice(i).match(/^\\([a-z]+)(-?\d+)?[ ]?/i);
      if (ctrl) {
        const name = ctrl[1].toLowerCase();
        if (name === "par" || name === "line" || name === "row") out += "\n";
        else if (name === "tab") out += "\t";
        else if (name === "emdash" || name === "endash") out += "-";
        i += ctrl[0].length;
        continue;
      }
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }

  return out
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SECTION_RE =
  /^(format|topology|request|task\s*description|task description)\s*[:\-–]?\s*$/i;

function sectionKey(label: string): keyof Omit<OdinMetadataSections, "rawText" | "other"> | null {
  const n = label.toLowerCase().replace(/\s+/g, " ").trim();
  if (n.startsWith("format")) return "format";
  if (n.startsWith("topology")) return "topology";
  if (n.startsWith("request")) return "request";
  if (n.startsWith("task")) return "taskDescription";
  return null;
}

export function parseMetadataRtf(raw: string): OdinMetadataSections {
  const text = rtfToText(raw);
  const lines = text.split(/\n/);
  const sections: OdinMetadataSections = {
    format: "",
    topology: "",
    request: "",
    taskDescription: "",
    other: "",
    rawText: text,
  };

  let current: keyof OdinMetadataSections = "other";
  const buckets: Record<string, string[]> = {
    format: [],
    topology: [],
    request: [],
    taskDescription: [],
    other: [],
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const inline = trimmed.match(
      /^(Format|Topology|Request|Task Description)\s*[:\-–]\s*(.*)$/i,
    );
    if (inline && (inline[2] || "").trim()) {
      const key = sectionKey(inline[1]);
      if (key) {
        current = key;
        buckets[key].push(inline[2].trim());
        continue;
      }
    }
    if (SECTION_RE.test(trimmed)) {
      const key = sectionKey(trimmed.replace(/[:\-–]/g, ""));
      if (key) {
        current = key;
        continue;
      }
    }
    buckets[current].push(line);
  }

  sections.format = buckets.format.join("\n").trim();
  sections.topology = buckets.topology.join("\n").trim();
  sections.request = buckets.request.join("\n").trim();
  sections.taskDescription = buckets.taskDescription.join("\n").trim();
  sections.other = buckets.other.join("\n").trim();
  return sections;
}
