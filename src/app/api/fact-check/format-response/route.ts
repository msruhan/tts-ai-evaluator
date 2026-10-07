import { NextResponse } from "next/server";
import { runCodexJson } from "@/lib/factcheck/codex";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: { text: { type: "string" } },
  required: ["text"],
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const raw = String(body?.text || "").slice(0, 60_000);
    if (!raw.trim()) {
      return NextResponse.json({ error: "Full Response kosong." }, { status: 400 });
    }
    const out = await runCodexJson<{ text: string }>(
      `Reformat this pasted LLM response so its tables are machine-readable. Rules:
- Keep every word, number, symbol and citation marker (e.g. [1.4.2]) exactly as written. Do not add, remove, summarize, translate or correct anything.
- Rebuild any table (including tables whose cells were pasted one per line or run together) as tab-separated rows: one row per line, cells separated by a single TAB character, header row first.
- Keep headings, paragraphs and bullet lists as plain text lines in their original order, with a blank line between sections.

Pasted response:
"""
${raw}
"""`,
      schema,
      { label: "olah response" },
    );
    return NextResponse.json({ text: out.text });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal mengolah response." },
      { status: 500 },
    );
  }
}
