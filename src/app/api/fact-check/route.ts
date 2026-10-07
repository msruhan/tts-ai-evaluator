import { NextResponse } from "next/server";
import { assertLocalRuntime } from "@/lib/factcheck/codex";
import { ndjsonResponse } from "@/lib/factcheck/ndjson";
import { runAiResearch } from "@/lib/factcheck/pipeline";
import { readFactCheckInput } from "@/lib/factcheck/validate";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  let input;
  try {
    assertLocalRuntime();
    input = readFactCheckInput(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request tidak valid." },
      { status: 400 },
    );
  }
  return ndjsonResponse((emit) => runAiResearch(input, emit));
}
