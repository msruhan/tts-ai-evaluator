import { NextResponse } from "next/server";
import { readMemory } from "@/lib/store";
import { AVALANCH_SKILLS } from "@/lib/avalanch-skills";

export const runtime = "nodejs";

export async function GET() {
  try {
    const memory = await readMemory();
    return NextResponse.json({
      memory,
      avalanchSkills: AVALANCH_SKILLS,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal memuat memory.";
    console.error("[memory]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
