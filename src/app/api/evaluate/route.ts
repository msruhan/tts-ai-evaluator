import { NextResponse } from "next/server";
import { evaluateWithSumopod, getSumopodModel } from "@/lib/sumopod";
import {
  formatMemoryForPrompt,
  readMemory,
  saveEvaluation,
} from "@/lib/store";
import { AVALANCH_SKILLS } from "@/lib/avalanch-skills";
import type { EvalLanguage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const ALLOWED_LANGUAGES = new Set<EvalLanguage>(["id", "ms", "en"]);

const ALLOWED_MIME = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
  "audio/x-flac",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
]);

function normalizeMime(file: File): string {
  const type = (file.type || "").toLowerCase();
  if (type && ALLOWED_MIME.has(type)) {
    if (type === "audio/mp3") return "audio/mpeg";
    if (type === "audio/x-wav" || type === "audio/wave") return "audio/wav";
    if (type === "audio/x-flac") return "audio/flac";
    if (type === "audio/x-m4a") return "audio/mp4";
    return type;
  }

  const name = file.name.toLowerCase();
  if (name.endsWith(".mp3")) return "audio/mpeg";
  if (name.endsWith(".wav")) return "audio/wav";
  if (name.endsWith(".webm")) return "audio/webm";
  if (name.endsWith(".ogg")) return "audio/ogg";
  if (name.endsWith(".flac")) return "audio/flac";
  if (name.endsWith(".m4a") || name.endsWith(".mp4")) return "audio/mp4";
  if (name.endsWith(".aac")) return "audio/aac";

  throw new Error(`Format file tidak didukung: ${file.name || type || "unknown"}`);
}

async function fileToBase64(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    mimeType: normalizeMime(file),
    data: buffer.toString("base64"),
  };
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const textPrompt = String(form.get("textPrompt") || "").trim();
    const listenerNote = String(form.get("listenerNote") || "").trim();
    const languageErrors = {
      reference: String(form.get("languageErrorReference") || "").trim(),
      audioA: String(form.get("languageErrorAudioA") || "").trim(),
      audioB: String(form.get("languageErrorAudioB") || "").trim(),
    };
    const languageRaw = String(form.get("language") || "id").trim() as EvalLanguage;
    const language = ALLOWED_LANGUAGES.has(languageRaw) ? languageRaw : "id";
    const reference = form.get("reference");
    const audioA = form.get("audioA");
    const audioB = form.get("audioB");

    if (!textPrompt) {
      return NextResponse.json(
        { error: "Text prompt wajib diisi." },
        { status: 400 },
      );
    }

    if (
      !(reference instanceof File) ||
      !(audioA instanceof File) ||
      !(audioB instanceof File)
    ) {
      return NextResponse.json(
        { error: "Reference, Audio A, dan Audio B wajib diunggah." },
        { status: 400 },
      );
    }

    const maxBytes = 20 * 1024 * 1024;
    for (const [label, file] of [
      ["Reference", reference],
      ["Audio A", audioA],
      ["Audio B", audioB],
    ] as const) {
      if (file.size <= 0) {
        return NextResponse.json(
          { error: `${label} kosong.` },
          { status: 400 },
        );
      }
      if (file.size > maxBytes) {
        return NextResponse.json(
          { error: `${label} terlalu besar (maks 20MB).` },
          { status: 400 },
        );
      }
    }

    const memory = await readMemory();
    const memoryGuide = formatMemoryForPrompt(memory);
    const model = getSumopodModel();

    const result = await evaluateWithSumopod({
      textPrompt,
      reference: await fileToBase64(reference),
      audioA: await fileToBase64(audioA),
      audioB: await fileToBase64(audioB),
      memoryGuide,
      listenerNote: listenerNote || undefined,
      languageErrors,
      language,
    });

    const record = await saveEvaluation({
      textPrompt,
      language,
      listenerNote: listenerNote || undefined,
      languageErrors,
      model,
      fileNames: {
        reference: reference.name,
        audioA: audioA.name,
        audioB: audioB.name,
      },
      result,
    });

    return NextResponse.json({
      id: record.id,
      model,
      language,
      result,
      memorySkillsUsed: memory.skills.length,
      avalanchSkillsUsed: AVALANCH_SKILLS.length,
      record,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal mengevaluasi audio.";
    console.error("[evaluate]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
