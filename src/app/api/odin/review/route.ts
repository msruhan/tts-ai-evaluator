import { NextResponse } from "next/server";
import { formatOdinReviewHeader } from "@/lib/odin/header";
import { parseMetadataRtf } from "@/lib/odin/rtf";
import { reviewOdinTask } from "@/lib/odin/review";
import { analyzeDeliverablesZip } from "@/lib/odin/zip";
export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_RTF = 2 * 1024 * 1024;
const MAX_ZIP = 40 * 1024 * 1024;

function asFile(value: FormDataEntryValue | null, label: string): File {
  if (!value || typeof value === "string" || typeof value.arrayBuffer !== "function") {
    throw new Error(`${label} wajib diunggah.`);
  }
  return value;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const idea = String(form.get("idea") || "").trim();
    const notes = String(form.get("notes") || "").trim();
    const reviewNo = String(form.get("reviewNo") || "").trim();
    const writerName = String(form.get("writerName") || "").trim();
    const reviewer = String(form.get("reviewer") || "Masruhan K").trim() || "Masruhan K";

    if (!idea) {
      return NextResponse.json(
        { error: "Describe idea wajib diisi." },
        { status: 400 },
      );
    }

    const rtfFile = asFile(form.get("metadata"), "metadata.rtf");
    const zipFile = asFile(form.get("deliverables"), "deliverables.zip");

    if (rtfFile.size > MAX_RTF) {
      return NextResponse.json({ error: "metadata.rtf kebesaran (max 2 MB)." }, { status: 400 });
    }
    if (zipFile.size > MAX_ZIP) {
      return NextResponse.json(
        { error: "deliverables.zip kebesaran (max 40 MB)." },
        { status: 400 },
      );
    }

    const rtfName = rtfFile.name.toLowerCase();
    if (rtfName && !rtfName.endsWith(".rtf") && !rtfName.endsWith(".txt")) {
      return NextResponse.json(
        { error: "Unggah Metadata.rtf (bukan zip/pdf)." },
        { status: 400 },
      );
    }
    const zipName = zipFile.name.toLowerCase();
    if (zipName && !zipName.endsWith(".zip")) {
      return NextResponse.json({ error: "Unggah deliverables.zip." }, { status: 400 });
    }

    const rtfBuf = Buffer.from(await rtfFile.arrayBuffer());
    const zipBuf = Buffer.from(await zipFile.arrayBuffer());
    const metadata = parseMetadataRtf(rtfBuf.toString("utf8"));
    if (!metadata.rawText.trim()) {
      return NextResponse.json(
        { error: "metadata.rtf kosong atau tidak bisa dibaca." },
        { status: 400 },
      );
    }

    const zip = await analyzeDeliverablesZip(zipBuf);
    const header = formatOdinReviewHeader(reviewNo, reviewer);
    const result = await reviewOdinTask({
      idea,
      notes,
      header,
      reviewNo,
      writerName,
      metadata,
      zip,
    });

    return NextResponse.json({
      ok: true,
      result,
      model: result.model,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal generate review.";
    console.error("[odin/review]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
