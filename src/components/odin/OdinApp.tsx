"use client";

import { useMemo, useState, type FormEvent } from "react";
import { applyFeedbackChecklist, FEEDBACK_CHECKLIST } from "@/lib/odin/checklist";
import type { OdinDecision, OdinReviewResult } from "@/lib/odin/types";

const fieldCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

const DECISION_LABEL: Record<OdinDecision, { text: string; cls: string }> = {
  approve: { text: "Approve", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  request_edits: {
    text: "Request edits",
    cls: "bg-amber-50 text-amber-900 border-amber-200",
  },
  reject: { text: "Reject", cls: "bg-rose-50 text-rose-800 border-rose-200" },
  provisional: {
    text: "Provisional",
    cls: "bg-slate-100 text-slate-700 border-slate-200",
  },
};

function FilePicker({
  label,
  hint,
  accept,
  file,
  onChange,
}: {
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">
        {label} <span className="text-rose-600">*</span>
      </span>
      <input
        type="file"
        accept={accept}
        onChange={(e) => onChange(e.target.files?.[0] || null)}
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-700 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-teal-800"
      />
      <span className="mt-1 block text-xs text-slate-500">
        {file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : hint}
      </span>
    </label>
  );
}

function ChecklistPicker({
  checked,
  onToggle,
}: {
  checked: string[];
  onToggle: (id: string) => void;
}) {
  const groups = [
    { id: "fix", title: "Checklist perbaikan" },
    { id: "growth", title: "Growth note" },
    { id: "closing", title: "Closing" },
  ] as const;
  return (
    <div className="mt-4 space-y-3">
      {groups.map((group) => (
        <fieldset key={group.id} className="rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-sm font-medium text-slate-800">{group.title}</legend>
          <div className="space-y-2">
            {FEEDBACK_CHECKLIST.filter((item) => item.group === group.id).map((item) => (
              <label key={item.id} className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={checked.includes(item.id)}
                  onChange={() => onToggle(item.id)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-slate-800">{item.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{item.text}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <p className="text-xs text-slate-500">
        Yang dicentang masuk ke feedback writer. Perbaikan masuk ke Require re-Record, growth note ke Growth note, closing mengganti paragraf penutup.
      </p>
    </div>
  );
}

function CopyBlock({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  const [ok, setOk] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setOk(true);
    window.setTimeout(() => setOk(false), 1400);
  }
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <button
          type="button"
          onClick={copy}
          disabled={!text}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          {ok ? "Tersalin" : "Salin"}
        </button>
      </div>
      <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
        {text || "Belum ada hasil."}
      </pre>
    </section>
  );
}

export default function OdinApp() {
  const [idea, setIdea] = useState("");
  const [notes, setNotes] = useState("");
  const [reviewNo, setReviewNo] = useState("1");
  const [writerName, setWriterName] = useState("");
  const [rtf, setRtf] = useState<File | null>(null);
  const [zip, setZip] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<OdinReviewResult | null>(null);
  const [checked, setChecked] = useState<string[]>([]);

  const canRun = idea.trim() && rtf && zip && !running;

  const zipSummary = useMemo(() => {
    if (!result?.zip) return "";
    const z = result.zip;
    const byKind = { input: 0, artifact: 0, output: 0, other: 0 };
    for (const f of z.files) byKind[f.kind] += 1;
    return `${z.fileCount} file · input ${byKind.input} / artifact ${byKind.artifact} / output ${byKind.output} / other ${byKind.other}`;
  }, [result]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canRun || !rtf || !zip) return;
    setRunning(true);
    setError("");
    try {
      const form = new FormData();
      form.set("idea", idea);
      form.set("notes", notes);
      form.set("reviewNo", reviewNo);
      form.set("writerName", writerName);
      form.set("reviewer", "Masruhan K");
      form.set("metadata", rtf);
      form.set("deliverables", zip);
      const res = await fetch("/api/odin/review", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal generate review.");
      setResult(data.result as OdinReviewResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const writerFeedback = useMemo(
    () => applyFeedbackChecklist(result?.writerFeedback || "", checked),
    [result, checked],
  );
  const decisionKey: OdinDecision | null = result
    ? result.decision === "approve" &&
      FEEDBACK_CHECKLIST.some((item) => item.group === "fix" && checked.includes(item.id))
      ? "request_edits"
      : result.decision
    : null;
  const decision = decisionKey ? DECISION_LABEL[decisionKey] : null;

  function toggleCheck(id: string) {
    setChecked((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <p className="text-xs font-medium uppercase tracking-wide text-teal-700">
            Generalist
          </p>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
            Review helper
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Tempel idea writer + temuanmu, unggah Metadata.rtf dan deliverables.zip.
            AI nulis feedback ke writer dan internal notes buat QC, pakai header GMT.
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <form onSubmit={onSubmit} className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Review #</span>
                <input
                  value={reviewNo}
                  onChange={(e) => setReviewNo(e.target.value)}
                  placeholder="1"
                  className={fieldCls}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">
                  Nama writer
                </span>
                <input
                  value={writerName}
                  onChange={(e) => setWriterName(e.target.value)}
                  placeholder="Alex"
                  className={fieldCls}
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                Describe idea <span className="text-rose-600">*</span>
              </span>
              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                rows={8}
                placeholder="Paste idea / Goal yang di-submit writer…"
                className={`${fieldCls} font-mono text-xs`}
              />
            </label>

            <label className="mt-3 block text-sm">
              <span className="mb-1 block font-medium text-slate-700">
                Temuan / catatan
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={8}
                placeholder="Temuan recording (timestamp MM:SS kalau ada), AQC flags, app, narration, PII. Yang tidak ditulis = UNCHECKED."
                className={`${fieldCls} font-mono text-xs`}
              />
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <FilePicker
                label="Metadata.rtf"
                hint="Format, Topology, Request, Task Description"
                accept=".rtf,.txt,text/rtf,application/rtf"
                file={rtf}
                onChange={setRtf}
              />
              <FilePicker
                label="deliverables.zip"
                hint="input / artifact / final output"
                accept=".zip,application/zip"
                file={zip}
                onChange={setZip}
              />
            </div>

            <ChecklistPicker checked={checked} onToggle={toggleCheck} />

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={!canRun}
                className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {running ? "Nulis review…" : "Generate review"}
              </button>
              {error ? <p className="text-sm text-rose-700">{error}</p> : null}
            </div>
          </section>
        </form>

        <div className="space-y-4">
          {!result ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500">
              Isi idea, catatan, terus unggah rtf + zip. Hasil writer feedback dan QC notes muncul di sini.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {decision ? (
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${decision.cls}`}
                  >
                    {decision.text}
                  </span>
                ) : null}
                {result.model ? (
                  <span className="text-xs text-slate-500">Model: {result.model}</span>
                ) : null}
                <span className="text-xs text-slate-500">{zipSummary}</span>
              </div>
              <CopyBlock title="Feedback untuk writer" text={writerFeedback} />
              <CopyBlock title="Internal notes untuk QC" text={result.qcNotes} />
              {result.zip.namingIssues.length > 0 ? (
                <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  <p className="font-medium">Catatan zip</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {result.zip.namingIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
