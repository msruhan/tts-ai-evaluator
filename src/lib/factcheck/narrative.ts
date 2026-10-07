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

export const NARRATIVE_RULES = `Narrative style (both languages, same substance):
- One or two flowing paragraphs, 80–180 words, no bullet points, no headings, no markdown, no URLs (the server appends a Sources list).
- Fixed order: (1) opening — what claim(s) were checked and how many verifiable claims the sentence contains; (2) evidence — which sources were consulted by name (e.g. "ESPN's official match summary", "FotMob match stats") and what they say, stating that they reflect the situation as of the query date; (3) reasoning — why that evidence leads to the label, including the subjective part if any; (4) conclusion — end with the label in bold-free plain text, e.g. "Therefore, the label is Accurate."
- English opening pattern: "I fact-checked the claim that ..." (one claim) or "I fact-checked the claims that ..." (several) — never write "claim(s)". Indonesian opening pattern: "Saya telah melakukan pengecekan terhadap klaim ...". Indonesian conclusion: "Oleh karena itu, labelnya adalah <Label>." (keep the English label word).
- Disputed: name which source says what. Unsupported: say where you searched and why no reliable evidence was found. No Claims present: explain why the sentence has no factual claim.
- Only mention sources that are in the provided verified list. Never invent statistics or sources.`;

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
