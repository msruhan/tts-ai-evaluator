const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/g;

export function cleanUrl(url: string): string {
  return url.replace(/[.,;:!?]+$/, "");
}

export function extractUrls(text: string): string[] {
  return [...new Set((text.match(URL_RE) || []).map(cleanUrl))];
}

export function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$|ref_)/i.test(key)) u.searchParams.delete(key);
    }
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return url.trim();
  }
}

export function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = cleanUrl(raw.trim());
    if (!/^https?:\/\//i.test(url)) continue;
    const key = normalizeUrlKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

/** Removes any URL from free text that is not in the verified list. */
export function stripUnverifiedUrls(text: string, verifiedUrls: string[]): string {
  const allowed = new Set(verifiedUrls.map(normalizeUrlKey));
  return text
    .replace(URL_RE, (raw) => {
      const url = cleanUrl(raw);
      return allowed.has(normalizeUrlKey(url)) ? raw : raw.slice(url.length);
    })
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function buildSourcesBlock(urls: string[], verifiedUrls: string[]): string {
  const allowed = new Set(verifiedUrls.map(normalizeUrlKey));
  const list = dedupeUrls(urls).filter((u) => allowed.has(normalizeUrlKey(u)));
  return list.length ? `Sources:\n${list.join("\n")}` : "";
}

export function composeCopyText(narrative: string, sourcesBlock: string): string {
  return [narrative.trim(), sourcesBlock.trim()].filter(Boolean).join("\n\n");
}
