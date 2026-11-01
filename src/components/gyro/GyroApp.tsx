"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  buildComplianceItems,
  complianceStats,
  type ComplianceItem,
  type ComplianceStatus,
} from "@/lib/gyro/compliance-items";
import {
  deterministicSuggestions,
  type FieldSuggestion,
} from "@/lib/gyro/deterministic-suggestions";
import {
  buildContextFromPaste,
  emptyTaskContext,
} from "@/lib/gyro/parse-task-paste";
import {
  emptyReview1,
  formatReview1Text,
  REVIEW1_FIELD_DEFS,
  type Review1Field,
  type Review1Result,
} from "@/lib/gyro/review1-form";
import type { GyroTaskContext, MultimodalState } from "@/lib/gyro/types";

type FieldUiState = "empty" | "suggested" | "accepted" | "overridden";
type FormTab = "saran" | "manual" | "semua";

function fieldState(
  rating: string,
  suggestion?: FieldSuggestion,
): FieldUiState {
  if (!suggestion) return rating ? "overridden" : "empty";
  if (!rating) return "suggested";
  if (rating === suggestion.value) return "accepted";
  return "overridden";
}

function exportHelperText(
  ctx: GyroTaskContext,
  compliance: ComplianceItem[],
  review1: Review1Result,
  suggestions: FieldSuggestion[],
): string {
  const lines: string[] = [];
  lines.push("=== GYRO REVIEW HELPER ===");
  lines.push("");
  lines.push("-- EXPECTED (dari task) --");
  lines.push(`Multimodal: ${ctx.multimodal}`);
  lines.push(`Scene: ${ctx.sceneKind || "-"} ${ctx.scene || ""}`.trim());
  lines.push(`P1: ${ctx.p1 || "-"}`);
  lines.push(`P2: ${ctx.p2 || "-"}`);
  lines.push(`P3: ${ctx.p3 || "-"}`);
  lines.push(`Goal: ${ctx.userGoal || "-"}`);
  lines.push("");
  lines.push("-- COMPLIANCE --");
  for (const c of compliance) {
    lines.push(`[${c.status}] ${c.title}`);
    if (c.note) lines.push(`  catatan: ${c.note}`);
  }
  lines.push("");
  lines.push("-- SARAN DETERMINISTIC --");
  for (const s of suggestions) {
    const f = review1.fields.find((x) => x.id === s.fieldId);
    lines.push(
      `${f?.title || s.fieldId}: ${s.value} (${fieldState(f?.rating || "", s)}) — ${s.reason}`,
    );
  }
  lines.push("");
  lines.push(formatReview1Text(review1));
  return lines.join("\n");
}

export default function GyroApp() {
  const [taskPaste, setTaskPaste] = useState("");
  const [layoutPaste, setLayoutPaste] = useState("");
  const [transcript, setTranscript] = useState("");
  const [ctx, setCtx] = useState<GyroTaskContext>(emptyTaskContext());
  const [processed, setProcessed] = useState(false);
  const [compliance, setCompliance] = useState<ComplianceItem[]>([]);
  const [review1, setReview1] = useState<Review1Result>(emptyReview1);
  const [copyOk, setCopyOk] = useState(false);
  const [resetPrompt, setResetPrompt] = useState(false);
  const [formTab, setFormTab] = useState<FormTab>("saran");

  const suggestions = useMemo(
    () => (processed ? deterministicSuggestions(ctx) : []),
    [ctx, processed],
  );
  const suggestionMap = useMemo(() => {
    const m = new Map<string, FieldSuggestion>();
    for (const s of suggestions) m.set(s.fieldId, s);
    return m;
  }, [suggestions]);

  const stats = complianceStats(compliance);
  const pendingSuggestions = suggestions.filter((s) => {
    const f = review1.fields.find((x) => x.id === s.fieldId);
    return !f?.rating;
  }).length;

  const filledFields = review1.fields.filter((f) => f.rating.trim()).length;

  function applyProcess(forceResetFields: boolean) {
    const next = buildContextFromPaste(taskPaste, transcript, "v1", layoutPaste);
    setCtx(next);
    setCompliance((prev) =>
      buildComplianceItems(next, forceResetFields ? [] : prev),
    );
    if (forceResetFields) setReview1(emptyReview1());
    setProcessed(true);
    setResetPrompt(false);
    setFormTab("saran");
  }

  function onProcess() {
    if (!taskPaste.trim()) return;
    if (processed && review1.fields.some((f) => Boolean(f.rating))) {
      setResetPrompt(true);
      return;
    }
    applyProcess(false);
  }

  function setMultimodal(v: MultimodalState) {
    const next: GyroTaskContext = {
      ...ctx,
      multimodal: v,
      requiresScene: v === "yes" ? "yes" : v === "no" ? "no" : "unknown",
    };
    setCtx(next);
    setCompliance((prev) => buildComplianceItems(next, prev));
  }

  function setComplianceStatus(id: string, status: ComplianceStatus) {
    setCompliance((rows) =>
      rows.map((r) => (r.id === id ? { ...r, status } : r)),
    );
  }

  function setComplianceNote(id: string, note: string) {
    setCompliance((rows) =>
      rows.map((r) => (r.id === id ? { ...r, note } : r)),
    );
  }

  function setFieldRating(fieldId: string, rating: string) {
    setReview1((r) => ({
      ...r,
      fields: r.fields.map((f) => (f.id === fieldId ? { ...f, rating } : f)),
    }));
  }

  function setFieldExplanation(fieldId: string, explanationId: string) {
    setReview1((r) => ({
      ...r,
      fields: r.fields.map((f) =>
        f.id === fieldId ? { ...f, explanationId } : f,
      ),
    }));
  }

  function acceptSuggestion(s: FieldSuggestion) {
    setFieldRating(s.fieldId, s.value);
  }

  function acceptAllSuggestions() {
    setReview1((r) => ({
      ...r,
      fields: r.fields.map((f) => {
        const sug = suggestionMap.get(f.id);
        if (!sug || f.rating) return f;
        return { ...f, rating: sug.value };
      }),
    }));
  }

  async function copyExport() {
    const text = exportHelperText(ctx, compliance, review1, suggestions);
    await navigator.clipboard.writeText(text);
    setCopyOk(true);
    window.setTimeout(() => setCopyOk(false), 2000);
  }

  const visibleDefs = REVIEW1_FIELD_DEFS.filter((d) => {
    const sug = suggestionMap.has(d.id);
    if (formTab === "saran") return sug;
    if (formTab === "manual") return !sug;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-teal-700">
            Gyro Accordion · Review Helper
          </p>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
            Alat bantu review Expected vs Actual
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Bandingkan yang diminta task vs yang dikerjakan. Saran otomatis hanya
            untuk yang pasti dari Task Variables.{" "}
            <Link
              href="/live-eval-handbook"
              className="font-medium text-teal-700 underline-offset-2 hover:underline"
            >
              Buku Panduan Rater
            </Link>
          </p>
        </div>
      </header>

      {processed && (
        <div className="sticky top-11 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2.5 text-sm sm:px-6">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
              Belum {stats.unchecked}
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">
              Sesuai {stats.match}
            </span>
            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-800">
              Tidak sesuai {stats.mismatch}
            </span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-900">
              Saran menunggu {pendingSuggestions}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
              Form {filledFields}/{review1.fields.length}
            </span>
            <span className="text-slate-500">Checklist {stats.pct}%</span>
            {pendingSuggestions > 0 && (
              <button
                type="button"
                onClick={acceptAllSuggestions}
                className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
              >
                Terima semua saran
              </button>
            )}
            <button
              type="button"
              onClick={copyExport}
              className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {copyOk ? "Tersalin" : "Salin ringkasan"}
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Input task</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                Task Variables <span className="text-rose-600">*</span>
              </span>
              <textarea
                value={taskPaste}
                onChange={(e) => setTaskPaste(e.target.value)}
                rows={10}
                placeholder="Paste blok Task Variables dari Outlier…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs leading-relaxed text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                Layout Summary{" "}
                <span className="text-slate-400">(disarankan)</span>
              </span>
              <textarea
                value={layoutPaste}
                onChange={(e) => setLayoutPaste(e.target.value)}
                rows={10}
                placeholder="Paste Layout Summary (while turns, after draft)…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs leading-relaxed text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </label>
          </div>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              Transcript{" "}
              <span className="text-slate-400">(opsional — bukti)</span>
            </span>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={5}
              placeholder="Opsional: paste transcript untuk membantu cek compliance…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs leading-relaxed text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onProcess}
              disabled={!taskPaste.trim()}
              className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {processed ? "Perbarui dari paste" : "Proses task"}
            </button>
            {resetPrompt && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <span>Ada nilai yang sudah diisi. Reset saran & field?</span>
                <button
                  type="button"
                  className="rounded-lg bg-amber-800 px-2.5 py-1 text-white"
                  onClick={() => applyProcess(true)}
                >
                  Reset & proses
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-amber-300 bg-white px-2.5 py-1"
                  onClick={() => applyProcess(false)}
                >
                  Pertahankan nilai
                </button>
                <button
                  type="button"
                  className="text-amber-800 underline"
                  onClick={() => setResetPrompt(false)}
                >
                  Batal
                </button>
              </div>
            )}
          </div>
        </section>

        {!processed ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
            Paste Task Variables lalu klik <strong>Proses task</strong> untuk
            melihat Expected vs checklist.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Yang diminta task
              </h2>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    Multimodal
                  </span>
                  {(["yes", "no", "unknown"] as MultimodalState[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setMultimodal(v)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        ctx.multimodal === v
                          ? "bg-teal-700 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {v === "yes" ? "YES" : v === "no" ? "NO" : "?"}
                    </button>
                  ))}
                </div>
                <p className="text-sm text-slate-600">
                  Scene:{" "}
                  <span className="font-medium text-slate-800">
                    {ctx.sceneKind || "—"}
                  </span>
                </p>
                {ctx.scene ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                    {ctx.scene}
                  </p>
                ) : null}
              </div>

              <Card title="User goal" body={ctx.userGoal} />
              <Card title="Initial prompt" body={ctx.initialPrompt} mono />
              <Card
                title={`P1 ${ctx.p1 || ""}`.trim()}
                body={ctx.beforeInstructions}
              />
              <Card
                title={`P2 ${ctx.p2 || ""}`.trim()}
                body={[
                  ctx.whileInstructions,
                  ctx.whileTurns.length
                    ? ctx.whileTurns
                        .map((t, i) => `Turn ${i + 1}: ${t}`)
                        .join("\n\n")
                    : "",
                ]
                  .filter(Boolean)
                  .join("\n\n")}
              />
              <Card
                title={`P3 ${ctx.p3 || ""}`.trim()}
                body={[ctx.afterInstructions, ctx.afterDraft]
                  .filter(Boolean)
                  .join("\n\n")}
              />

              {transcript.trim() ? (
                <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                    Transcript (bukti)
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs text-slate-700">
                    {transcript}
                  </pre>
                </details>
              ) : null}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Checklist compliance
              </h2>

              {compliance.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <h3 className="text-sm font-semibold text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
                    {item.expected || "—"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(
                      [
                        ["unchecked", "Belum"],
                        ["match", "Sesuai"],
                        ["mismatch", "Tidak sesuai"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setComplianceStatus(item.id, value)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                          item.status === value
                            ? value === "match"
                              ? "bg-emerald-600 text-white"
                              : value === "mismatch"
                                ? "bg-rose-600 text-white"
                                : "bg-slate-700 text-white"
                            : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={item.note}
                    onChange={(e) =>
                      setComplianceNote(item.id, e.target.value)
                    }
                    placeholder="Catatan singkat (opsional)…"
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
                  />
                </div>
              ))}

              <div className="flex flex-wrap items-end justify-between gap-2 pt-2">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Form Review 1
                  </h2>
                  <p className="text-xs text-slate-500">
                    Tab Saran = yang pasti dari task. Manual = judgement kamu.
                  </p>
                </div>
                <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
                  {(
                    [
                      ["saran", "Saran"],
                      ["manual", "Manual"],
                      ["semua", "Semua"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFormTab(id)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                        formTab === id
                          ? "bg-teal-700 text-white"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {(formTab === "manual" || formTab === "semua") && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Deep Research terpicu?
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    No ≠ otomatis fail — catat fakta dari sesi.
                  </p>
                  <div className="mt-2 flex gap-2">
                    {(["Yes", "No"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() =>
                          setReview1((r) => ({
                            ...r,
                            deepResearchTriggered: v,
                          }))
                        }
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                          review1.deepResearchTriggered === v
                            ? "bg-slate-800 text-white"
                            : "border border-slate-200 text-slate-600"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={review1.deepResearchNoteId}
                    onChange={(e) =>
                      setReview1((r) => ({
                        ...r,
                        deepResearchNoteId: e.target.value,
                      }))
                    }
                    rows={2}
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
                  />
                </div>
              )}

              {visibleDefs.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-sm text-slate-500">
                  Tidak ada field di tab ini.
                  {formTab === "saran"
                    ? " Coba set Multimodal = NO, atau buka tab Manual/Semua."
                    : ""}
                </p>
              ) : (
                visibleDefs.map((def) => {
                  const field = review1.fields.find((f) => f.id === def.id)!;
                  const sug = suggestionMap.get(def.id);
                  return (
                    <FieldCard
                      key={def.id}
                      def={def}
                      field={field}
                      suggestion={sug}
                      onAccept={() => sug && acceptSuggestion(sug)}
                      onRating={(v) => setFieldRating(def.id, v)}
                      onExplanation={(v) => setFieldExplanation(def.id, v)}
                    />
                  );
                })
              )}

              {(formTab === "manual" || formTab === "semua") && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Quality & grammar check
                  </h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <YesNo
                      label="Quality check akurat?"
                      value={review1.qualityCheckAccurate}
                      onChange={(v) =>
                        setReview1((r) => ({
                          ...r,
                          qualityCheckAccurate: v,
                        }))
                      }
                    />
                    <YesNo
                      label="Grammar check bersih?"
                      value={review1.grammarCheck}
                      onChange={(v) =>
                        setReview1((r) => ({ ...r, grammarCheck: v }))
                      }
                    />
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "Yes" | "No";
  onChange: (v: "Yes" | "No") => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-700">{label}</p>
      <div className="mt-1 flex gap-2">
        {(["Yes", "No"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              value === v
                ? "bg-slate-800 text-white"
                : "border border-slate-200 text-slate-600"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function FieldCard({
  def,
  field,
  suggestion,
  onAccept,
  onRating,
  onExplanation,
}: {
  def: (typeof REVIEW1_FIELD_DEFS)[number];
  field: Review1Field;
  suggestion?: FieldSuggestion;
  onAccept: () => void;
  onRating: (v: string) => void;
  onExplanation: (v: string) => void;
}) {
  const state = fieldState(field.rating, suggestion);
  const selectedMulti = new Set(
    field.rating
      ? field.rating.split(" | ").map((s) => s.trim()).filter(Boolean)
      : [],
  );

  function toggleMulti(opt: string) {
    const next = new Set(selectedMulti);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    onRating([...next].join(" | "));
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{def.title}</h3>
        {suggestion ? (
          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-800">
            Disarankan (pasti)
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Manual
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-600">{def.explainId}</p>

      {suggestion ? (
        <div className="mt-2 rounded-lg border border-teal-100 bg-teal-50/80 px-3 py-2 text-xs text-teal-950">
          <p>
            Usul: <strong>{suggestion.value}</strong>
          </p>
          <p className="mt-0.5 opacity-90">{suggestion.reason}</p>
          {state === "suggested" ? (
            <button
              type="button"
              onClick={onAccept}
              className="mt-2 rounded-lg bg-teal-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-800"
            >
              Terima
            </button>
          ) : null}
        </div>
      ) : null}

      {def.freeText ? (
        <textarea
          value={field.rating}
          onChange={(e) => onRating(e.target.value)}
          rows={3}
          placeholder="Isi teks bebas…"
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
        />
      ) : def.multi ? (
        <div className="mt-2 space-y-1.5">
          {def.options.map((o) => (
            <label
              key={o}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-100 px-2 py-1.5 text-xs hover:bg-slate-50"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={selectedMulti.has(o)}
                onChange={() => toggleMulti(o)}
              />
              <span>{o}</span>
            </label>
          ))}
        </div>
      ) : (
        <select
          value={field.rating}
          onChange={(e) => onRating(e.target.value)}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
        >
          <option value="">— Belum diisi —</option>
          {def.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}

      {!def.freeText && (
        <textarea
          value={field.explanationId}
          onChange={(e) => onExplanation(e.target.value)}
          rows={2}
          placeholder="Penjelasan / catatan (opsional)…"
          className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
        />
      )}

      <p className="mt-1 text-[11px] text-slate-400">
        Status:{" "}
        {state === "accepted"
          ? "Diterima dari saran"
          : state === "overridden"
            ? suggestion
              ? "Diubah manual"
              : "Terisi"
            : state === "suggested"
              ? "Menunggu Terima"
              : "Kosong"}
      </p>
    </div>
  );
}

function Card({
  title,
  body,
  mono,
}: {
  title: string;
  body: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title || "—"}</h3>
      <p
        className={`mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {body?.trim() || (
          <span className="text-slate-400">Tidak ter-parse dari paste.</span>
        )}
      </p>
    </div>
  );
}
