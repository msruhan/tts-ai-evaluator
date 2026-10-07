import type { FactCheckInput, VerifiedSource } from "./types";

export const LABEL_RULES = `Labels (judge ONLY the Target Sentence, not the whole response):
- Accurate: all claims are supported by reputable evidence and no reputable contradicting evidence exists.
- Inaccurate: at least one important claim is contradicted by reputable evidence, or a subjective claim most people would disagree with.
- Disputed: credible sources support different conclusions and the discrepancy cannot be reconciled.
- Unsupported: no reliable evidence can be found to support at least one claim.
- No Claims present: the target sentence contains no factual claim.`;

export const QUERY_DATE_RULES = (queryDate: string) => `Query date rules (query date = ${queryDate}):
- Evaluate what was known/true on or before ${queryDate}, NOT today.
- Never base the label on a source marked after_query_date or an event after ${queryDate}.
- If evidence only became available after ${queryDate}, the claim is Unsupported, not Inaccurate.
- unknown_date sources are usable only when their content clearly describes events on or before ${queryDate}.
- Subjective wording ("the greatest", "unmatched", "the only hurdle") is not a plain fact: check whether reputable sources genuinely support or dispute that characterization.`;

const OPENINGS_EN = ["I fact-checked", "I checked", "I reviewed", "I looked into", "I verified", "I went through"];
const OPENINGS_ID = [
  "Saya telah melakukan pengecekan terhadap",
  "Saya mengecek",
  "Saya menelusuri",
  "Saya memeriksa",
  "Saya sudah mengecek",
];

function pick<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

export function narrativeRules() {
  const openEn = pick(OPENINGS_EN);
  const openId = pick(OPENINGS_ID);
  return `Narrative style (both languages, same substance):
- Write it like a person telling a colleague how they actually traced the facts, step by step. Everyday, natural language; relaxed but still professional. It must not sound like AI.
- Length 170–300 words, split into 2–4 short paragraphs. No bullet points, no headings, no markdown, no URLs (the server appends a Sources list).
- Opening: start with "${openEn} ..." in English and "${openId} ..." in Indonesian, then say in plain words what the sentence claims and how many verifiable claims it contains. Write "the claim that" (one) or "the claims that" (several), never "claim(s)".
- Then walk through the checking in order using ordinal steps — English "First, ...", "Second, ...", "Third, ...", "Finally, ..."; Indonesian "Pertama, ...", "Kedua, ...", "Ketiga, ...", "Terakhir, ...". Each step = one source (or one claim) named by site, e.g. "First, I checked the claim about the final score on ESPN's official match summary..." / "Pertama, saya mengecek klaim soal skor akhir di ringkasan pertandingan resmi ESPN...". Say what you looked at on that page (box score, match stats, article, standings table), what it actually shows (concrete numbers/names), and whether that matches the sentence. Mention that the source is dated on or before the query date when relevant.
- After the steps, explain briefly in your own words why this adds up to the label (including the subjective wording, if any), then end with exactly "Therefore, the label is <Label>." / "Oleh karena itu, labelnya adalah <Label>." (keep the English label word).
- Sound human: use contractions in English ("didn't", "it's"), vary sentence length, use light connectors ("then", "after that", "to double-check", "lalu", "setelah itu", "untuk memastikan"). Avoid stiff AI phrasing: "Furthermore", "Moreover", "Notably", "It is worth noting", "delve", "comprehensive", "In conclusion", em dashes, and Indonesian "Adapun", "Selain itu, perlu dicatat", "Dengan demikian dapat disimpulkan".
- Write as if you browsed the sites yourself: never mention the pipeline or prompt ("provided sources", "verified list", "the list", "JSON", "API response", "header field", "keyMatch"). Call the date "the query date" / "tanggal query" (not "tanggal kueri").
- The Indonesian version is natural everyday Indonesian (not a word-for-word translation, not overly formal), with the same steps and facts.
- Disputed: say which source says what. Unsupported: describe where you looked and why nothing reliable turned up. No Claims present: explain why the sentence has no factual claim (no ordinal steps needed).
- Only mention sources that are in the provided verified list. Never invent statistics, pages, or sources.`;
}

export function formatTaskBlock(input: FactCheckInput) {
  return `Query date: ${input.queryDate}

User query:
"""
${input.userQuery.trim() || "(not provided)"}
"""

Full response (context only):
"""
${input.fullResponse.trim() || "(not provided)"}
"""

Target sentence (the ONLY thing to fact-check):
"""
${input.targetSentence.trim()}
"""`;
}

export function sourceId(index: number) {
  return `S${index + 1}`;
}

export function formatSourcesForPrompt(sources: VerifiedSource[]) {
  if (!sources.length) return "(no verified sources — every candidate URL failed to open or none were found)";
  return sources
    .map((s, i) => {
      const body = s.apiExcerpt || s.check.excerpt || s.snippet || "";
      return `[${sourceId(i)}] ${s.title}
origin: ${s.origin} · date: ${s.publishedDate || s.check.publishedDate || "unknown"} · dateStatus: ${s.dateStatus} · keyMatch: ${s.check.keyMatch}${s.check.matchedValues.length ? ` (${s.check.matchedValues.join(", ")})` : ""}
url: ${s.url}
content:
${body.slice(0, 2500)}`;
    })
    .join("\n\n");
}

export function resolveSourceIds(ids: string[], sources: VerifiedSource[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const n = Number(String(id).replace(/[^0-9]/g, ""));
    const s = sources[n - 1];
    if (s && !out.includes(s.url)) out.push(s.url);
  }
  return out;
}
