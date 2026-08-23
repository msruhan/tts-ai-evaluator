import { NextResponse } from "next/server";
import {
  addGyroSkills,
  readGyroMemory,
  writeGyroMemory,
} from "@/lib/gyro/store";
import { GYRO_REVIEWER_SKILLS } from "@/lib/gyro/avalanch-reviewer-skills";

export const runtime = "nodejs";

export async function GET() {
  try {
    const memory = await readGyroMemory();
    return NextResponse.json({
      ok: true,
      memory,
      foundationSkillCount: GYRO_REVIEWER_SKILLS.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal memuat gyro memory.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body?.action === "clear") {
      await writeGyroMemory({ skills: [], sources: [], playbook: "" });
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "add" && Array.isArray(body.skills)) {
      const n = await addGyroSkills(body.skills, String(body.sourceName || "manual"));
      const memory = await readGyroMemory();
      return NextResponse.json({ ok: true, added: n, memory });
    }
    if (typeof body?.playbook === "string") {
      const memory = await readGyroMemory();
      memory.playbook = body.playbook.slice(0, 1200);
      await writeGyroMemory(memory);
      return NextResponse.json({ ok: true, memory });
    }
    return NextResponse.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal menyimpan gyro memory.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
