import { NextResponse } from "next/server";
import { assertLocalRuntime } from "@/lib/factcheck/codex";
import { runComparison } from "@/lib/factcheck/compare";
import { ndjsonResponse } from "@/lib/factcheck/ndjson";
import type { AiResearchResult } from "@/lib/factcheck/types";
import { readFactCheckInput, readManualResearch } from "@/lib/factcheck/validate";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  let parsed;
  try {
    assertLocalRuntime();
    const body = await request.json();
    const ai = body?.aiResult as AiResearchResult | undefined;
    if (!ai?.extraction || !Array.isArray(ai.sources) || !Array.isArray(ai.verdicts)) {
      throw new Error("Jalankan riset AI terlebih dahulu sebelum membandingkan.");
    }
    parsed = {
      input: readFactCheckInput(body.input),
      ai,
      manual: readManualResearch(body.manual),
    };
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request tidak valid." },
      { status: 400 },
    );
  }
  const { input, ai, manual } = parsed;
  return ndjsonResponse((emit) => runComparison(input, ai, manual, emit));
}
