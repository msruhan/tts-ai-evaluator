import { NextResponse } from "next/server";
import { reviewWithSumopod } from "@/lib/gyro/sumopod-review";
import { readGyroMemory } from "@/lib/gyro/store";
import {
  GYRO_ISSUE_OPTIONS,
  GYRO_P1_OPTIONS,
  GYRO_P2_OPTIONS,
  GYRO_P3_OPTIONS,
  type GyroIssueKey,
  type P1Tag,
  type P2Tag,
  type P3Tag,
  type SceneKind,
  type TriState,
} from "@/lib/gyro/types";
import { getSumopodModel } from "@/lib/sumopod";

export const runtime = "nodejs";
export const maxDuration = 120;

const TRI: TriState[] = ["yes", "no", "unknown"];
const ISSUE_KEYS = new Set(GYRO_ISSUE_OPTIONS.map((o) => o.key));
const P1 = new Set(GYRO_P1_OPTIONS.map((o) => o.value));
const P2 = new Set(GYRO_P2_OPTIONS.map((o) => o.value));
const P3 = new Set(GYRO_P3_OPTIONS.map((o) => o.value));
const SCENE_KINDS = new Set<SceneKind>(["", "screen_share", "camera", "other"]);

function asTri(v: unknown): TriState {
  return TRI.includes(v as TriState) ? (v as TriState) : "unknown";
}

function asP1(v: unknown): P1Tag {
  return P1.has(v as P1Tag) ? (v as P1Tag) : "";
}
function asP2(v: unknown): P2Tag {
  return P2.has(v as P2Tag) ? (v as P2Tag) : "";
}
function asP3(v: unknown): P3Tag {
  return P3.has(v as P3Tag) ? (v as P3Tag) : "";
}
function asSceneKind(v: unknown): SceneKind {
  return SCENE_KINDS.has(v as SceneKind) ? (v as SceneKind) : "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const context = body.context || {};
    const notes = body.notes || {};
    const rubricVersion = context.rubricVersion === "v2" ? "v2" : "v1";
    const issues = Array.isArray(notes.issues)
      ? (notes.issues as string[]).filter((k): k is GyroIssueKey =>
          ISSUE_KEYS.has(k as GyroIssueKey),
        )
      : [];

    const memory = await readGyroMemory();
    const result = await reviewWithSumopod(
      {
        context: {
          rubricVersion,
          taskLanguage: "id",
          multimodal: asTri(context.multimodal),
          requiresScene: asTri(context.requiresScene),
          sceneKind: asSceneKind(context.sceneKind),
          scene: String(context.scene || ""),
          p1: asP1(context.p1),
          p2: asP2(context.p2),
          p3: asP3(context.p3),
          userGoal: String(context.userGoal || ""),
          initialPrompt: String(context.initialPrompt || ""),
          beforeInstructions: String(context.beforeInstructions || ""),
          whileInstructions: String(context.whileInstructions || ""),
          afterInstructions: String(context.afterInstructions || ""),
          taskText: String(context.taskText || ""),
          transcript: String(context.transcript || ""),
          imageName: context.imageName ? String(context.imageName) : undefined,
          transcriptFileName: context.transcriptFileName
            ? String(context.transcriptFileName)
            : undefined,
        },
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
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal generate review Gyro.";
    console.error("[gyro/review]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
