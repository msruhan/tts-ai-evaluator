import { NextResponse } from "next/server";
import { addReview } from "@/lib/store";
import type { ReviewVerdict } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const verdict = body.verdict as ReviewVerdict;
    const comment = String(body.comment || "");

    const { record, skill } = await addReview(id, { verdict, comment });
    return NextResponse.json({ record, skill });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal menyimpan review.";
    const status = message.includes("tidak ditemukan")
      ? 404
      : message.includes("wajib") || message.includes("tidak valid")
        ? 400
        : 500;
    console.error("[history/:id/review]", error);
    return NextResponse.json({ error: message }, { status });
  }
}
