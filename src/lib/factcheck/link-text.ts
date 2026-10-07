import type { KeyMatch } from "./types";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

export function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
}

export function extractPublishedDate(html: string): string {
  const patterns = [
    /<meta[^>]+(?:property|name|itemprop)=["'](?:article:published_time|og:published_time|datePublished|publish-date|pubdate|date)["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["'](?:article:published_time|og:published_time|datePublished)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return "";
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

const BLOCK_PATTERNS: [RegExp, string][] = [
  [/\b(captcha|are you a robot|verify you are human|unusual traffic)\b/i, "captcha / bot check"],
  [/\b(access denied|request blocked|forbidden|attention required)\b/i, "akses ditolak"],
  [/\b(enable javascript and cookies to continue|checking your browser)\b/i, "butuh JavaScript / bot check"],
  [/\b(page not found|404 not found|this page (?:does not|doesn't) exist|page (?:could not|can't) be found)\b/i, "halaman tidak ditemukan"],
  [/\b(subscribe to (?:continue|read)|this content is for subscribers)\b/i, "paywall"],
];

/** Only short pages are judged by these phrases; long articles may mention them legitimately. */
export function detectBlockedOrError(text: string, title: string): string {
  const head = `${title}\n${text.slice(0, 1500)}`;
  if (text.length > 4000 && !/\b404\b|not found/i.test(title)) return "";
  for (const [re, reason] of BLOCK_PATTERNS) {
    if (re.test(head)) return reason;
  }
  if (/\b404\b|not found/i.test(title)) return "halaman tidak ditemukan";
  return "";
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function valuePattern(value: string): RegExp {
  const v = value.trim();
  if (/^[\d.,:%–-]+$/.test(v)) {
    return new RegExp(`(?<![\\d.])${escapeRe(v)}(?![\\d])`);
  }
  return new RegExp(escapeRe(v).replace(/\s+/g, "\\s+"), "i");
}

function fold(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function matchKeyValues(
  text: string,
  keyValues: string[],
): { keyMatch: KeyMatch; matchedValues: string[] } {
  const values = [...new Set(keyValues.map((v) => v.trim()).filter(Boolean))];
  if (!values.length) return { keyMatch: "no_match", matchedValues: [] };
  const haystack = fold(text);
  const matchedValues = values.filter((v) => valuePattern(fold(v)).test(haystack));
  const keyMatch: KeyMatch =
    matchedValues.length === 0
      ? "no_match"
      : matchedValues.length === values.length
        ? "match"
        : "partial";
  return { keyMatch, matchedValues };
}

export function excerptAround(text: string, matchedValues: string[], max = 1500): string {
  if (text.length <= max) return text;
  const folded = fold(text);
  const windows: string[] = [];
  const per = Math.max(200, Math.floor(max / Math.max(1, matchedValues.length)));
  for (const v of matchedValues) {
    const m = valuePattern(fold(v)).exec(folded);
    if (!m) continue;
    const start = Math.max(0, m.index - Math.floor(per / 2));
    windows.push(text.slice(start, start + per));
  }
  const joined = windows.join(" … ");
  return (joined || text).slice(0, max);
}
