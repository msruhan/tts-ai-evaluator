import { classifyDate } from "./dates";
import type { SourceCandidate } from "./types";

const TAVILY_URL = "https://api.tavily.com/search";

type TavilyResult = {
  url: string;
  title?: string;
  content?: string;
  score?: number;
  published_date?: string;
};

export function assertTavilyKey() {
  if (!process.env.TAVILY_API_KEY?.trim()) {
    throw new Error("TAVILY_API_KEY belum diset di .env.local.");
  }
}

export async function tavilySearch(
  query: string,
  opts: {
    queryDate: string;
    claimIds: string[];
    endDate?: string;
    maxResults?: number;
  },
): Promise<SourceCandidate[]> {
  assertTavilyKey();
  const body: Record<string, unknown> = {
    query,
    search_depth: "advanced",
    max_results: opts.maxResults ?? 5,
    include_raw_content: false,
    include_answer: false,
  };
  if (opts.endDate) body.end_date = opts.endDate;

  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY!.trim()}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Tavily error ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { results?: TavilyResult[] };
  return (json.results || [])
    .filter((r) => /^https?:\/\//.test(r.url))
    .map((r) => ({
      url: r.url,
      title: r.title || r.url,
      origin: "tavily" as const,
      publishedDate: r.published_date,
      dateStatus: classifyDate(r.published_date, opts.queryDate),
      claimIds: [...opts.claimIds],
      snippet: r.content?.slice(0, 600),
      score: r.score,
    }));
}
