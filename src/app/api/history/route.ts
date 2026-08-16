import { NextResponse } from "next/server";
import { listEvaluations, readMemory, getStorageMode } from "@/lib/store";
import { AVALANCH_SKILLS } from "@/lib/avalanch-skills";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [items, memory] = await Promise.all([
      listEvaluations(),
      readMemory(),
    ]);
    return NextResponse.json({
      items,
      memoryCount: memory.skills.length,
      avalanchSkillsCount: AVALANCH_SKILLS.length,
      storage: getStorageMode(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal memuat history.";
    console.error("[history]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
