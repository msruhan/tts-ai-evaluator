import { NextResponse } from "next/server";
import { runCodexJson } from "@/lib/factcheck/codex";
import { normalizeDate, parseTaskText } from "@/lib/factcheck/parse-task";
import type { FactCheckInput } from "@/lib/factcheck/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    userQuery: { type: "string" },
    fullResponse: { type: "string" },
    targetSentence: { type: "string" },
    queryDate: { type: "string" },
  },
  required: ["userQuery", "fullResponse", "targetSentence", "queryDate"],
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const raw = String(body?.text || "").slice(0, 80_000);
    if (!raw.trim()) {
      return NextResponse.json({ error: "Teks task kosong." }, { status: 400 });
    }

    const { values, missing } = parseTaskText(raw);
    let usedAi = false;
    if (missing.some((f) => f !== "userQuery")) {
      const ai = await runCodexJson<FactCheckInput>(
        `Split this pasted fact-checking task into its fields. Copy text verbatim (do not summarize). Use "" for fields that are not present. queryDate must be YYYY-MM-DD.

Fields: userQuery (the user's question), fullResponse (the complete LLM answer), targetSentence (the specific sentence/claim to evaluate), queryDate.

Pasted task:
"""
${raw}
"""`,
        schema,
        { label: "pecah task" },
      );
      usedAi = true;
      for (const field of missing) {
        const v = field === "queryDate" ? normalizeDate(ai.queryDate || "") : (ai[field] || "").trim();
        if (v) values[field] = v;
      }
    }

    return NextResponse.json({ values, usedAi });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal memecah teks task." },
      { status: 500 },
    );
  }
}
