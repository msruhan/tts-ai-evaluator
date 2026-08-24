import type { GyroTaskContext, GyroReviewerNotes } from "./types";
import type { Review1Result } from "./review1-form";
import type { GyroAnswer } from "./types";

/** Structured cross-links so Review1 + Review2 stay coherent with inputs. */
export function buildCrossConsistencyBrief(
  context: GyroTaskContext,
  notes: GyroReviewerNotes,
): string {
  const tags = [context.p1, context.p2, context.p3].filter(Boolean).join(" | ");
  const multimodal = context.multimodal || "unknown";
  const hasLayout = Boolean(context.layoutSummary?.trim());
  const turnCount = context.whileTurns?.length || 0;

  const visualMode =
    multimodal === "no"
      ? "NON-MULTIMODAL (voice/recording only) → R1 visual_understanding=Not Relevant; overlay/visual cards sering N/A; Q2/Q17 jangan menuntut screen share."
      : multimodal === "yes"
        ? "MULTIMODAL YES → scene harus dipakai; R1 visual_* aktif (bukan asal Not Relevant); Q2 cek scene ready."
        : "Multimodal unknown → infer dari Layout/Task (screen share / camera) atau transcript.";

  const p1Rule =
    context.p1 === "P1:DIRECT"
      ? "P1:DIRECT → Turn awal + segera minta Deep Research; Q4/Q7 & R1 collaborativity harus mencerminkan itu."
      : context.p1 === "P1:CONVO"
        ? "P1:CONVO → multi-turn dulu LALU minta Deep Research; jangan nilai seolah DIRECT."
        : "P1 tag tidak jelas → infer dari Layout Initial Prompt + transcript.";

  const p2Rule =
    context.p2 === "P2:IMPATIENT"
      ? "P2:IMPATIENT → While Turns harus muncul di transcript (masih lama / ETA / frustrasi); Q5/Q8 & R1 conversation_flow/emotional_calibration selaras."
      : context.p2 === "P2:LEAVE/WAIT"
        ? "P2:LEAVE/WAIT → hampir tidak ada chat saat menunggu; jangan mengarang impatient turns."
        : context.p2 === "P2:RELATED" || context.p2 === "P2:UNRELATED"
          ? `${context.p2} → chat saat menunggu sesuai tag; cocokkan Q5/Q8 dengan transcript.`
          : "P2 tag tidak jelas → infer dari While Instruction / While Turns + transcript.";

  const p3Rule =
    context.p3 === "P3:SUMMARIZE"
      ? "P3:SUMMARIZE → setelah report, user minta ringkasan/overview; Q6/Q9 & R1 easy_to_listen/content_relevance selaras."
      : context.p3 === "P3:DISCUSSION"
        ? "P3:DISCUSSION → follow-up diskusi temuan (bukan hanya summarize)."
        : context.p3 === "P3:DRILL WHILE READING"
          ? "P3:DRILL WHILE READING → tantangan klaim on-screen saat membaca report."
          : context.p3 === "P3:FOLLOWUP-DR"
            ? "P3:FOLLOWUP-DR → ada permintaan Deep Research kedua."
            : "P3 tag tidak jelas → infer dari After Draft / After Instruction + transcript.";

  const layoutRule = hasLayout
    ? `Layout Summary TERSEDIA (${turnCount} while turns). Wajib bandingkan:
- Initial Prompt Layout ↔ ucapan awal transcript ↔ Q4/Q7
- While Turns 1–N ↔ ucapan tunggu transcript ↔ Q5/Q8 (catat turn hilang/beda/urutan)
- After Draft ↔ follow-up P3 transcript ↔ Q6/Q9
- Scene/Goal Layout ↔ Q1/Q2/Q3 & R1 goal_completion/content_relevance`
    : "Layout Summary kosong → andalkan Task Variables + transcript; jangan mengarang While Turns.";

  const notesRule = [
    notes.deepResearchTriggered !== "unknown"
      ? `Reviewer note DR triggered=${notes.deepResearchTriggered} — selaraskan R1 deepResearchTriggered & Q11 (kecuali transcript jelas bertolak belakang; jelaskan).`
      : null,
    notes.recordingComplete !== "unknown"
      ? `Recording complete=${notes.recordingComplete} → pengaruhi Q12.`
      : null,
    notes.issues.length
      ? `Issues reviewer: ${notes.issues.join(", ")} → Q21/Q12 & field R1 terkait.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `## CROSS-FIELD CONSISTENCY (WAJIB — Review1 ↔ Review2 ↔ Input)
Tag path: ${tags || "(infer)"}
${visualMode}
${p1Rule}
${p2Rule}
${p3Rule}
${layoutRule}
${notesRule || "Catatan reviewer minim — utamakan Task/Layout/Transcript."}

### Matriks saling-terhubung (jangan saling bertentangan)
1. R1 deepResearchTriggered ↔ R2 Q11 (triggered). Q10 = REQUESTED (frasa), Q11 = TRIGGERED (fitur jalan/report). Boleh Q10=Ya & Q11=Tidak.
2. R1 extension_correctness ↔ Deep Research/tool: jika DR gagal/paruh, jangan "No Issues" tanpa penjelasan.
3. R1 live_screen_captions (2) ↔ R1 transcript_quality_post (30) ↔ R2 Q15 — arah masalah sama.
4. R1 conversation_flow (12) ↔ R2 Q16; R1 audio_understanding (3) ↔ salah dengar di transcript.
5. R1 goal_completion (17) + user_effort (18) + overall_satisfaction (26) ↔ R2 Q3/Q19/Q22 — arah kepuasan/goal sama.
6. R1 content_relevance (14) + response_depth (15) + truthfulness (16) harus koheren: Major Issues di (14)/(16) jarang diikuti (15)=5 atau (26)=Very satisfied.
7. R1 ui_usability (1) ↔ (1.b): jika (1)=No Issues maka (1.b) menyatakan UI jelas; jika Minor/Major maka (1.b) jelaskan dengan bukti/timestamp bila ada.
8. Visual stack R1 (4)(5)(19–24) harus satu cerita: Not Relevant / N/A konsisten bila tidak ada visual; jangan campur "No Issues" dengan "tidak ada visual".
9. R2 Q1/Q18 (layout/entity coherence) ↔ konsistensi Scene–Goal–Prompt–Instructions antar Task Variables & Layout Summary.
10. R2 Q20 (instruction–transcript) ↔ kepatuhan While/After Draft; sebutkan turn yang cocok/tidak.
11. Summary Review2 harus merangkum temuan yang sama dengan rating R1 kunci (DR, goal, P2/P3, visual mode) — bukan narasi terpisah.
12. quality_check_accurate=Yes hanya jika jawaban grounded & tidak saling kontradiksi; grammar_check=Yes untuk teks ID yang rapi.

### Prioritas bukti
1) Transcript (apa yang benar-benar terjadi)
2) Layout Summary (skrip yang seharusnya)
3) Task Variables (tag/setup)
4) Catatan reviewer (recording-only / override lembut)`;
}

export function findCoherenceIssues(
  context: GyroTaskContext,
  review1: Review1Result,
  review2Answers: GyroAnswer[],
): string[] {
  const issues: string[] = [];
  const byId = (id: string) =>
    review1.fields.find((f) => f.id === id)?.rating || "";
  const q = (id: string) =>
    review2Answers.find((a) => a.id === id)?.value || "";

  const drR1 = review1.deepResearchTriggered;
  const q11 = q("Q11");
  if (
    drR1 === "Yes" &&
    /tidak|belum|gagal|no\b|tidak terpicu/i.test(q11) &&
    !/terpicu|triggered|ya\b|berjalan|report/i.test(q11)
  ) {
    issues.push(
      "Kontradiksi: R1 deepResearchTriggered=Yes tetapi Q11 terkesan DR tidak terpicu.",
    );
  }
  if (
    drR1 === "No" &&
    /terpicu|triggered|berjalan|report (muncul|selesai)/i.test(q11) &&
    !/tidak terpicu|belum terpicu|gagal/i.test(q11)
  ) {
    issues.push(
      "Kontradiksi: R1 deepResearchTriggered=No tetapi Q11 terkesan DR terpicu.",
    );
  }

  if (context.multimodal === "no") {
    const vu = byId("visual_understanding");
    if (vu && !/not relevant|n\/a/i.test(vu) && /no issues/i.test(vu)) {
      issues.push(
        "Multimodal=NO tetapi visual_understanding=No Issues (harusnya Not Relevant kecuali ada visual tak terduga).",
      );
    }
  }

  const ui = byId("ui_usability");
  const uiExp = byId("ui_usability_explanation");
  if (/major issue/i.test(ui) && /tidak ada|no (noticeable )?issues|ui jelas/i.test(uiExp)) {
    issues.push("(1) Major Issue(s) tetapi (1.b) menyatakan UI jelas — selaraskan.");
  }
  if (/^no issues$/i.test(ui.trim()) && /rusak|bingung|gagal tap|error ui/i.test(uiExp)) {
    issues.push("(1) No Issues tetapi (1.b) menyebut masalah UI — selaraskan.");
  }

  const goal = byId("goal_completion");
  const sat = byId("overall_satisfaction");
  if (/major issue/i.test(goal) && /very satisfied/i.test(sat)) {
    issues.push(
      "goal_completion=Major Issue(s) tetapi overall_satisfaction=Very satisfied — tidak koheren.",
    );
  }

  const depth = byId("response_depth");
  const truth = byId("truthfulness");
  if (depth === "5" && /major issue/i.test(truth)) {
    issues.push(
      "response_depth=5 (Excellent) tetapi truthfulness=Major Issue(s) — turunkan depth atau perbaiki truthfulness.",
    );
  }

  if (context.whileTurns?.length >= 3) {
    const q5 = q("Q5");
    if (/unknown|tidak cukup bukti|belum diisi/i.test(q5)) {
      issues.push(
        "Ada While Turns di Layout tetapi Q5 masih unknown/lemah — nilai kepatuhan turn vs transcript.",
      );
    }
  }

  return issues;
}
