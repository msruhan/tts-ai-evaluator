import JSZip from "jszip";
import { rtfToText } from "./rtf";
import type { OdinZipAnalysis, OdinZipFile } from "./types";

const MAX_FILES = 180;
const MAX_UNCOMPRESSED = 48 * 1024 * 1024;
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_TEXT_CHARS = 8000;
const MAX_TOTAL_TEXT = 60_000;

const TEXT_EXT = new Set([
  "txt",
  "md",
  "csv",
  "tsv",
  "json",
  "xml",
  "html",
  "htm",
  "css",
  "js",
  "ts",
  "tsx",
  "jsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "swift",
  "kt",
  "sql",
  "yml",
  "yaml",
  "toml",
  "ini",
  "log",
  "rtf",
  "svg",
]);

function extOf(name: string) {
  const base = name.split("/").pop() || name;
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i + 1).toLowerCase() : "";
}

function classify(path: string): OdinZipFile["kind"] {
  const n = path.toLowerCase();
  if (/(^|\/)final[_\s-]*output(\s*\d+)?\b/.test(n) || /(^|\/)output(\s*\d+)?\b/.test(n)) {
    return "output";
  }
  if (/(^|\/)artifact(\s*\d+)?\b/.test(n)) return "artifact";
  if (/(^|\/)input(\s*\d+)?\b/.test(n)) return "input";
  const folder = n.split("/")[0] || "";
  if (folder === "output" || folder === "outputs" || folder === "final") return "output";
  if (folder === "artifacts" || folder === "artifact") return "artifact";
  if (folder === "input" || folder === "inputs") return "input";
  return "other";
}

function stripXml(xml: string) {
  return xml
    .replace(/<w:p\b[^>]*>/g, "\n")
    .replace(/<a:p\b[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function textFromOffice(buf: Buffer, ext: string) {
  const inner = await JSZip.loadAsync(buf);
  const names = Object.keys(inner.files);
  if (ext === "docx") {
    const xml = await inner.file("word/document.xml")?.async("string");
    return xml ? stripXml(xml) : "";
  }
  if (ext === "xlsx") {
    const shared = await inner.file("xl/sharedStrings.xml")?.async("string");
    const sheets = names.filter((n) => n.startsWith("xl/worksheets/sheet"));
    const parts = [shared ? stripXml(shared) : ""];
    for (const sheet of sheets.slice(0, 4)) {
      const xml = await inner.file(sheet)?.async("string");
      if (xml) parts.push(stripXml(xml).slice(0, 4000));
    }
    return parts.filter(Boolean).join("\n");
  }
  if (ext === "pptx") {
    const slides = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n)).slice(0, 12);
    const parts: string[] = [];
    for (const slide of slides) {
      const xml = await inner.file(slide)?.async("string");
      if (xml) parts.push(stripXml(xml).slice(0, 2500));
    }
    return parts.join("\n\n");
  }
  return "";
}

function looksUtf8Text(buf: Buffer) {
  const sample = buf.subarray(0, Math.min(buf.length, 800));
  let weird = 0;
  for (const b of sample) {
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) weird += 1;
  }
  return weird / sample.length < 0.08;
}

async function extractFileText(path: string, buf: Buffer): Promise<string> {
  const ext = extOf(path);
  if (ext === "rtf") return rtfToText(buf.toString("utf8"));
  if (TEXT_EXT.has(ext) || looksUtf8Text(buf)) {
    return buf.toString("utf8");
  }
  if (ext === "docx" || ext === "xlsx" || ext === "pptx") {
    try {
      return await textFromOffice(buf, ext);
    } catch {
      return "";
    }
  }
  return "";
}

function namingIssues(files: OdinZipFile[]) {
  const issues: string[] = [];
  const hasInput = files.some((f) => f.kind === "input");
  const hasOutput = files.some((f) => f.kind === "output");
  if (!hasOutput) issues.push("Tidak ketemu file labeled final output (final output 1, dst).");
  if (!hasInput) {
    issues.push("Tidak ketemu file labeled input 1, dst. (ok kalau task emang start from scratch)");
  }
  const unlabeled = files.filter((f) => f.kind === "other" && !f.path.endsWith("/"));
  if (unlabeled.length > 0) {
    issues.push(
      `${unlabeled.length} file belum ikuti pola input/artifact/final output: ${unlabeled
        .slice(0, 6)
        .map((f) => f.path)
        .join(", ")}`,
    );
  }
  return issues;
}

export async function analyzeDeliverablesZip(buffer: Buffer): Promise<OdinZipAnalysis> {
  const zip = await JSZip.loadAsync(buffer, { createFolders: true });
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  const files: OdinZipFile[] = [];
  let total = 0;
  let truncated = false;
  let usedText = 0;
  let containsMetadataRtf = false;

  for (const entry of entries.slice(0, MAX_FILES)) {
    const path = entry.name.replace(/\\/g, "/");
    if (path.startsWith("__MACOSX/") || path.endsWith(".DS_Store")) continue;
    if (/metadata\.rtf$/i.test(path)) containsMetadataRtf = true;

    let data: Buffer;
    try {
      data = Buffer.from(await entry.async("uint8array"));
    } catch {
      files.push({
        path,
        size: 0,
        kind: classify(path),
        ext: extOf(path),
        textPreview: "",
        skippedReason: "gagal dibaca",
      });
      continue;
    }

    total += data.length;
    if (total > MAX_UNCOMPRESSED) {
      truncated = true;
      break;
    }

    const ext = extOf(path);
    const kind = classify(path);
    if (data.length > MAX_FILE_BYTES) {
      files.push({
        path,
        size: data.length,
        kind,
        ext,
        textPreview: "",
        skippedReason: "file kebesaran utk extract teks",
      });
      continue;
    }

    let textPreview = "";
    let skippedReason: string | undefined;
    const officeOrText =
      TEXT_EXT.has(ext) || ext === "docx" || ext === "xlsx" || ext === "pptx" || looksUtf8Text(data);
    if (officeOrText && usedText < MAX_TOTAL_TEXT) {
      const extracted = (await extractFileText(path, data)).slice(0, MAX_TEXT_CHARS);
      textPreview = extracted;
      usedText += extracted.length;
    } else if (!officeOrText) {
      skippedReason = "biner (gambar/media/dll) — cuma nama+ukuran yg dianalisis";
    }

    files.push({ path, size: data.length, kind, ext, textPreview, skippedReason });
  }

  if (entries.length > MAX_FILES) truncated = true;
  if (containsMetadataRtf) {
    /* flagged in namingIssues below */
  }

  const issues = namingIssues(files);
  if (containsMetadataRtf) {
    issues.unshift("Metadata.rtf ada di dalam zip. Seharusnya di-upload terpisah ke Studio, bukan di deliverables.zip.");
  }

  return {
    fileCount: files.length,
    totalUncompressed: total,
    truncated,
    files,
    namingIssues: issues,
    containsMetadataRtf,
  };
}

export function formatZipForPrompt(zip: OdinZipAnalysis) {
  const lines = [
    `File count: ${zip.fileCount}`,
    `Uncompressed bytes (scanned): ${zip.totalUncompressed}`,
    zip.truncated ? "SCAN TRUNCATED (zip terlalu besar/banyak file)" : "",
    zip.namingIssues.length ? `Naming/structure issues:\n- ${zip.namingIssues.join("\n- ")}` : "Naming issues: (none)",
    "",
    "Files:",
  ];
  for (const f of zip.files) {
    lines.push(
      `- [${f.kind}] ${f.path} (${f.size} B, .${f.ext || "?"})${f.skippedReason ? ` — ${f.skippedReason}` : ""}`,
    );
    if (f.textPreview) {
      lines.push(`  TEXT:\n"""\n${f.textPreview.slice(0, 3500)}\n"""`);
    }
  }
  return lines.filter(Boolean).join("\n");
}
