import { NextResponse } from "next/server";
import { deleteEvaluation, getEvaluation } from "@/lib/store";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const record = await getEvaluation(id);
    if (!record) {
      return NextResponse.json(
        { error: "Evaluasi tidak ditemukan." },
        { status: 404 },
      );
    }
    return NextResponse.json({ record });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal memuat evaluasi.";
    console.error("[history/:id]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const ok = await deleteEvaluation(id);
    if (!ok) {
      return NextResponse.json(
        { error: "Evaluasi tidak ditemukan." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal menghapus evaluasi.";
    console.error("[history/:id DELETE]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
