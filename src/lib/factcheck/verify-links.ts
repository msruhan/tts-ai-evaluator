import {
  detectBlockedOrError,
  excerptAround,
  extractPublishedDate,
  extractTitle,
  htmlToText,
  matchKeyValues,
} from "./link-text";
import type { Emit, LinkCheck, SourceCandidate, VerifiedSource } from "./types";

const TIMEOUT_MS = 10_000;
const MAX_BODY_CHARS = 3_000_000;
const MIN_TEXT_CHARS = 200;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

function failed(
  url: string,
  status: LinkCheck["status"],
  detail: string,
  httpStatus?: number,
): LinkCheck {
  return { url, status, httpStatus, detail, keyMatch: "no_match", matchedValues: [], excerpt: "" };
}

function fetchPage(url: string) {
  return fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
}

function isTimeout(err: unknown) {
  const name = err instanceof Error ? err.name : "";
  return name === "TimeoutError" || name === "AbortError";
}

function networkReason(err: unknown): string {
  const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
  return cause?.code || cause?.message || (err instanceof Error ? err.message : String(err));
}

export async function checkLink(url: string, keyValues: string[]): Promise<LinkCheck> {
  let res: Response;
  try {
    try {
      res = await fetchPage(url);
    } catch (err) {
      if (isTimeout(err)) throw err;
      await new Promise((r) => setTimeout(r, 800));
      res = await fetchPage(url);
    }
  } catch (err) {
    if (isTimeout(err)) return failed(url, "timeout", `timeout ${TIMEOUT_MS / 1000} dtk`);
    return failed(url, "http_error", `gagal terhubung (${networkReason(err)})`);
  }

  if (res.status !== 200) {
    const blocked = [202, 401, 403, 429].includes(res.status);
    return failed(
      url,
      blocked ? "blocked" : "http_error",
      blocked ? `HTTP ${res.status} (diblokir / proteksi bot)` : `HTTP ${res.status}`,
      res.status,
    );
  }

  let body: string;
  try {
    body = (await res.text()).slice(0, MAX_BODY_CHARS);
  } catch {
    return failed(url, "empty", "body tidak bisa dibaca", 200);
  }
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("json") || /^\s*[{[]/.test(body)) {
    try {
      const parsed = JSON.parse(body);
      const empty =
        parsed == null ||
        (Array.isArray(parsed) && parsed.length === 0) ||
        (typeof parsed === "object" && Object.keys(parsed).length === 0);
      if (empty) return failed(url, "empty", "JSON kosong", 200);
      const { keyMatch, matchedValues } = matchKeyValues(body, keyValues);
      return {
        url,
        status: "ok",
        httpStatus: 200,
        keyMatch,
        matchedValues,
        excerpt: excerptAround(body, matchedValues, 1500),
        detail: "200 · JSON valid",
      };
    } catch {
      if (contentType.includes("json")) return failed(url, "empty", "JSON tidak valid", 200);
    }
  }

  const title = extractTitle(body);
  const text = htmlToText(body);
  if (text.length < MIN_TEXT_CHARS) {
    return failed(url, "empty", `konten terlalu sedikit (${text.length} karakter)`, 200);
  }
  const blockReason = detectBlockedOrError(text, title);
  if (blockReason) return failed(url, "blocked", blockReason, 200);

  const { keyMatch, matchedValues } = matchKeyValues(text, keyValues);
  return {
    url,
    status: "ok",
    httpStatus: 200,
    keyMatch,
    matchedValues,
    excerpt: excerptAround(text, matchedValues, 1500),
    detail: "200 · konten ada",
    publishedDate: extractPublishedDate(body) || undefined,
  };
}

export function describeCheck(check: LinkCheck): string {
  if (check.status !== "ok") return check.detail;
  if (check.keyMatch === "no_match") return `${check.detail} · nilai kunci tidak ditemukan`;
  const values = check.matchedValues.map((v) => `'${v}'`).join(", ");
  return `${check.detail} · memuat ${values}`;
}

export async function verifyLinksSequential(
  candidates: SourceCandidate[],
  keyValuesByClaim: Record<string, string[]>,
  opts: { emit: Emit; stopWhen?: (verified: VerifiedSource[]) => boolean },
): Promise<{ verified: VerifiedSource[]; rejected: LinkCheck[] }> {
  const verified: VerifiedSource[] = [];
  const rejected: LinkCheck[] = [];

  for (const cand of candidates) {
    if (opts.stopWhen?.(verified)) break;
    opts.emit({ type: "link", url: cand.url, status: "checking", detail: cand.title });
    const keyValues = cand.claimIds.flatMap((id) => keyValuesByClaim[id] || []);
    const check = await checkLink(cand.url, keyValues);
    if (check.status === "ok") {
      verified.push({ ...cand, check });
      opts.emit({ type: "link", url: cand.url, status: "ok", detail: describeCheck(check) });
    } else {
      rejected.push(check);
      opts.emit({ type: "link", url: cand.url, status: "failed", detail: describeCheck(check) });
    }
  }

  return { verified, rejected };
}
