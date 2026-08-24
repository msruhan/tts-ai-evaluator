import { NextResponse } from "next/server";
import { buildContextFromPaste } from "@/lib/gyro/parse-task-paste";
import { reviewWithSumopod } from "@/lib/gyro/sumopod-review";
import { readGyroMemory } from "@/lib/gyro/store";
import {
  GYRO_ISSUE_OPTIONS,
  type GyroIssueKey,
  type TriState,
} from "@/lib/gyro/types";
import { getSumopodModel } from "@/lib/sumopod";

export const runtime = "nodejs";
export const maxDuration = 120;

const TRI: TriState[] = ["yes", "no", "unknown"];
const ISSUE_KEYS = new Set(GYRO_ISSUE_OPTIONS.map((o) => o.key));

function asTri(v: unknown): TriState {
  return TRI.includes(v as TriState) ? (v as TriState) : "unknown";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const incoming = body.context || {};
    const notes = body.notes || {};
    const rubricVersion = incoming.rubricVersion === "v2" ? "v2" : "v1";
    const taskPaste = String(incoming.taskText || body.taskPaste || "");
    const transcript = String(incoming.transcript || body.transcript || "");
    const layoutSummary = String(
      incoming.layoutSummary || body.layoutSummary || "",
    );

    if (!taskPaste.trim() || !transcript.trim()) {
      return NextResponse.json(
        { error: "Task Variables dan Transcript wajib diisi." },
        { status: 400 },
      );
    }

    const context = buildContextFromPaste(
      taskPaste,
      transcript,
      rubricVersion,
      layoutSummary,
    );
    const issues = Array.isArray(notes.issues)
      ? (notes.issues as string[]).filter((k): k is GyroIssueKey =>
          ISSUE_KEYS.has(k as GyroIssueKey),
        )
      : [];

    const memory = await readGyroMemory();
    const result = await reviewWithSumopod(
      {
        context,
        notes: {
          deepResearchRequested: asTri(notes.deepResearchRequested),
          deepResearchTriggered: asTri(notes.deepResearchTriggered),
          deepResearchPhraseSpoken: asTri(notes.deepResearchPhraseSpoken),
          captionsVisible: asTri(notes.captionsVisible),
          visualOverlayUsed: asTri(notes.visualOverlayUsed),
          personalizationObserved: asTri(notes.personalizationObserved),
          recordingComplete: asTri(notes.recordingComplete),
          commentsMatchRecording: asTri(notes.commentsMatchRecording),
          issues,
          comments: String(notes.comments || ""),
          corrections: String(notes.corrections || ""),
        },
        imageDataUrl:
          typeof body.imageDataUrl === "string" ? body.imageDataUrl : undefined,
      },
      memory,
    );

    return NextResponse.json({
      ok: true,
      result,
      model: getSumopodModel(),
      gyroSkills: memory.skills.length,
      parsedTags: {
        p1: context.p1,
        p2: context.p2,
        p3: context.p3,
        multimodal: context.multimodal,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal generate review Gyro.";
    console.error("[gyro/review]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
