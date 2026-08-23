import { NextResponse } from "next/server";
import { chatWithGyroReviewer } from "@/lib/gyro/sumopod-chat";
import { readGyroMemory } from "@/lib/gyro/store";
import type {
  GyroAnswer,
  GyroReviewerNotes,
  GyroReviewResult,
  GyroTaskContext,
} from "@/lib/gyro/types";
import { getSumopodModel } from "@/lib/sumopod";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = String(body.message || "").trim();
    if (!message) {
      return NextResponse.json({ error: "Pesan kosong." }, { status: 400 });
    }

    const context = (body.context || {}) as GyroTaskContext;
    const notes = (body.notes || {}) as GyroReviewerNotes;
    const result = (body.result || null) as GyroReviewResult | null;
    const history = Array.isArray(body.history)
      ? body.history
          .filter(
            (m: { role?: string; content?: string }) =>
              (m.role === "user" || m.role === "assistant") &&
              typeof m.content === "string",
          )
          .map((m: { role: "user" | "assistant"; content: string }) => ({
            role: m.role,
            content: m.content.slice(0, 4000),
          }))
      : [];

    // Ensure required nested defaults for chat
    const safeContext: GyroTaskContext = {
      ...context,
      taskLanguage: "id",
      rubricVersion: context.rubricVersion === "v2" ? "v2" : "v1",
      multimodal: context.multimodal || "unknown",
      requiresScene: context.requiresScene || "unknown",
      sceneKind: context.sceneKind || "",
      scene: context.scene || "",
      p1: context.p1 || "",
      p2: context.p2 || "",
      p3: context.p3 || "",
      userGoal: context.userGoal || "",
      initialPrompt: context.initialPrompt || "",
      beforeInstructions: context.beforeInstructions || "",
      whileInstructions: context.whileInstructions || "",
      afterInstructions: context.afterInstructions || "",
      taskText: context.taskText || "",
      transcript: context.transcript || "",
    };

    const safeNotes: GyroReviewerNotes = {
      deepResearchRequested: notes.deepResearchRequested || "unknown",
      deepResearchTriggered: notes.deepResearchTriggered || "unknown",
      deepResearchPhraseSpoken: notes.deepResearchPhraseSpoken || "unknown",
      captionsVisible: notes.captionsVisible || "unknown",
      visualOverlayUsed: notes.visualOverlayUsed || "unknown",
      personalizationObserved: notes.personalizationObserved || "unknown",
      recordingComplete: notes.recordingComplete || "unknown",
      commentsMatchRecording: notes.commentsMatchRecording || "unknown",
      issues: Array.isArray(notes.issues) ? notes.issues : [],
      comments: notes.comments || "",
      corrections: notes.corrections || "",
    };

    const safeResult =
      result && Array.isArray(result.answers)
        ? {
            summary: String(result.summary || ""),
            answers: result.answers as GyroAnswer[],
            json: result.json || {},
          }
        : null;

    const memory = await readGyroMemory();
    const out = await chatWithGyroReviewer({
      message: message.slice(0, 4000),
      history,
      context: safeContext,
      notes: safeNotes,
      result: safeResult,
      memory,
    });

    return NextResponse.json({
      ok: true,
      ...out,
      model: getSumopodModel(),
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Gagal chat dengan AI Gyro.";
    console.error("[gyro/chat]", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
