import type {
  MultimodalState,
  P1Tag,
  P2Tag,
  P3Tag,
  GyroTaskContext,
  RubricVersion,
  SceneKind,
} from "./types";
import {
  parseLayoutSummary,
  preferNonEmpty,
} from "./parse-layout-summary";

function sectionAfter(raw: string, startRe: RegExp, endRe?: RegExp): string {
  const m = raw.match(startRe);
  if (!m || m.index == null) return "";
  const from = m.index + m[0].length;
  const rest = raw.slice(from);
  if (!endRe) return rest.trim();
  const end = rest.search(endRe);
  return (end >= 0 ? rest.slice(0, end) : rest).trim();
}

function parseP1(raw: string): P1Tag {
  const m = raw.match(/\bP1:(DIRECT|CONVO)\b/i);
  if (!m) return "";
  return `P1:${m[1].toUpperCase()}` as P1Tag;
}

function parseP2(raw: string): P2Tag {
  const m = raw.match(/\bP2:(LEAVE\/WAIT|IMPATIENT|RELATED|UNRELATED)\b/i);
  if (!m) return "";
  const v = m[1].toUpperCase();
  if (v.includes("LEAVE")) return "P2:LEAVE/WAIT";
  if (v === "IMPATIENT") return "P2:IMPATIENT";
  if (v === "RELATED") return "P2:RELATED";
  if (v === "UNRELATED") return "P2:UNRELATED";
  return "";
}

function parseP3(raw: string): P3Tag {
  if (/\bP3:DRILL WHILE READING\b/i.test(raw)) return "P3:DRILL WHILE READING";
  if (/\bP3:FOLLOWUP-DR\b/i.test(raw)) return "P3:FOLLOWUP-DR";
  if (/\bP3:DISCUSSION\b/i.test(raw)) return "P3:DISCUSSION";
  if (/\bP3:SUMMARIZE\b/i.test(raw)) return "P3:SUMMARIZE";
  return "";
}

/** Parse Outlier "Task Variables" paste into structured fields when possible. */
export function parseTaskPaste(paste: string): Partial<GyroTaskContext> {
  const raw = String(paste || "");
  if (!raw.trim()) return {};

  let multimodal: MultimodalState = "unknown";
  if (/multimodal\?[^\n]{0,40}YES/i.test(raw) || /\bYES\s*🎥/.test(raw)) {
    multimodal = "yes";
  } else if (/multimodal\?[^\n]{0,40}NO\b/i.test(raw)) {
    multimodal = "no";
  }

  const sceneLine =
    sectionAfter(
      raw,
      /\bScene\t|\bScene\s+/i,
      /\n💬|\nInitial Prompt|\n🎯|\nUser Goal|\n🏷️|\nPhase Tags|\n📋/i,
    )
      .split("\n")[0]
      ?.trim() || "";

  let sceneKind: SceneKind = "";
  if (/screen share|screen-share|tokopedia|amazon|product (page|listing)/i.test(raw)) {
    sceneKind = "screen_share";
  } else if (/\bcamera\b/i.test(sceneLine)) {
    sceneKind = "camera";
  }

  return {
    taskLanguage: "id",
    multimodal,
    requiresScene: multimodal === "yes" ? "yes" : multimodal === "no" ? "no" : "unknown",
    sceneKind,
    scene: sceneLine,
    p1: parseP1(raw),
    p2: parseP2(raw),
    p3: parseP3(raw),
    userGoal: sectionAfter(
      raw,
      /(?:🎯\s*)?User Goal\s*/i,
      /\n🏷️|\nPhase Tags|\n📋|\nBefore Instructions/i,
    ),
    initialPrompt: sectionAfter(
      raw,
      /(?:💬\s*)?Initial Prompt\s*/i,
      /\n🎯|\nUser Goal|\n🏷️|\nPhase Tags|\n📋/i,
    ),
    beforeInstructions: sectionAfter(
      raw,
      /Before Instructions\s*(?:\(Phase 1\))?\s*/i,
      /\nWhile Instructions|\nAfter Instructions|\n⚠️/i,
    ),
    whileInstructions: sectionAfter(
      raw,
      /While Instructions\s*(?:\(Phase 2\))?\s*/i,
      /\nAfter Instructions|\n⚠️/i,
    ),
    afterInstructions: sectionAfter(
      raw,
      /After Instructions\s*(?:\(Phase 3\))?\s*/i,
      /\n⚠️|\nMake sure you have read/i,
    ),
    taskText: raw.slice(0, 20000),
  };
}

export function emptyTaskContext(rubricVersion: RubricVersion = "v1"): GyroTaskContext {
  return {
    rubricVersion,
    taskLanguage: "id",
    multimodal: "unknown",
    requiresScene: "unknown",
    sceneKind: "",
    scene: "",
    p1: "",
    p2: "",
    p3: "",
    userGoal: "",
    initialPrompt: "",
    beforeInstructions: "",
    whileInstructions: "",
    afterInstructions: "",
    whileTurns: [],
    afterDraft: "",
    taskText: "",
    layoutSummary: "",
    transcript: "",
  };
}

export function buildContextFromPaste(
  taskPaste: string,
  transcript: string,
  rubricVersion: RubricVersion = "v1",
  layoutSummary = "",
): GyroTaskContext {
  const base = emptyTaskContext(rubricVersion);
  const fromTask = parseTaskPaste(taskPaste);
  const fromLayout = parseLayoutSummary(layoutSummary);

  // Task Variables = tags/setup; Layout Summary = scene/goal/scripts/turns (prefer when present)
  const whileTurns =
    fromLayout.whileTurns && fromLayout.whileTurns.length > 0
      ? fromLayout.whileTurns
      : [];

  return {
    ...base,
    ...fromTask,
    taskLanguage: "id",
    rubricVersion,
    multimodal:
      fromTask.multimodal && fromTask.multimodal !== "unknown"
        ? fromTask.multimodal
        : fromLayout.multimodal || "unknown",
    requiresScene:
      fromTask.requiresScene && fromTask.requiresScene !== "unknown"
        ? fromTask.requiresScene
        : fromLayout.requiresScene || "unknown",
    sceneKind: (fromTask.sceneKind || fromLayout.sceneKind || "") as SceneKind,
    scene: preferNonEmpty(fromLayout.scene, fromTask.scene),
    p1: (fromTask.p1 || fromLayout.p1 || "") as P1Tag,
    p2: (fromTask.p2 || fromLayout.p2 || "") as P2Tag,
    p3: (fromTask.p3 || fromLayout.p3 || "") as P3Tag,
    userGoal: preferNonEmpty(fromLayout.userGoal, fromTask.userGoal),
    initialPrompt: preferNonEmpty(
      fromLayout.initialPrompt,
      fromTask.initialPrompt,
    ),
    beforeInstructions: preferNonEmpty(
      fromLayout.beforeInstructions,
      fromTask.beforeInstructions,
    ),
    whileInstructions: preferNonEmpty(
      fromLayout.whileInstructions,
      fromTask.whileInstructions,
    ),
    afterInstructions: preferNonEmpty(
      fromLayout.afterInstructions,
      fromTask.afterInstructions,
    ),
    whileTurns,
    afterDraft: preferNonEmpty(fromLayout.afterDraft, ""),
    taskText: taskPaste.slice(0, 20000),
    layoutSummary: layoutSummary.slice(0, 20000),
    transcript: transcript.slice(0, 100_000),
  };
}
