"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import {
  FACT_LABELS,
  type AiResearchResult,
  type FactCheckInput,
  type FactLabel,
  type FinalReview,
  type ProgressEvent,
} from "@/lib/factcheck/types";
import {
  ClaimBreakdown,
  ConfidenceBadge,
  LabelBadge,
  NarrativeCard,
  ProgressLog,
  type LinkRow,
  type StageRow,
} from "./parts";
import {
  clearHistory,
  findHistoryEntry,
  getHistoryServerSnapshot,
  getHistorySnapshot,
  newHistoryId,
  removeHistoryEntry,
  subscribeHistory,
  upsertHistoryEntry,
  type HistoryEntry,
} from "./history";
import HistoryPanel from "./HistoryPanel";
import ResponseField from "./ResponseField";
import { FACT_CHECK_API } from "./routes";
import { streamNdjson } from "./stream";

type RunState<T> = {
  running: boolean;
  stages: StageRow[];
  links: LinkRow[];
  result: T | null;
  error: string;
};

function emptyRun<T>(): RunState<T> {
  return { running: false, stages: [], links: [], result: null, error: "" };
}

const EMPTY_INPUT: FactCheckInput = {
  userQuery: "",
  fullResponse: "",
  targetSentence: "",
  queryDate: "",
};

const AGREEMENT_LABEL = {
  agree: { text: "Sepakat", cls: "bg-emerald-50 text-emerald-800" },
  disagree: { text: "Berbeda", cls: "bg-rose-50 text-rose-800" },
  ai_only: { text: "Hanya AI", cls: "bg-slate-100 text-slate-700" },
  manual_only: { text: "Hanya manual", cls: "bg-sky-50 text-sky-800" },
} as const;

const fieldCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";

function useStreamRun<T>() {
  const [state, setState] = useState<RunState<T>>(emptyRun<T>());
  const abortRef = useRef<AbortController | null>(null);

  const start = async (url: string, body: unknown, onResult?: (data: T) => void) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ ...emptyRun<T>(), running: true });

    const onEvent = (event: ProgressEvent) => {
      if (event.type === "result") onResult?.(event.data as T);
      setState((prev) => {
        if (event.type === "stage") {
          return { ...prev, stages: [...prev.stages, { stage: event.stage, message: event.message }] };
        }
        if (event.type === "link") {
          const row = { url: event.url, status: event.status, detail: event.detail };
          const exists = prev.links.some((l) => l.url === event.url);
          return {
            ...prev,
            links: exists
              ? prev.links.map((l) => (l.url === event.url ? row : l))
              : [...prev.links, row],
          };
        }
        if (event.type === "result") return { ...prev, result: event.data as T };
        return { ...prev, error: event.message };
      });
    };

    try {
      await streamNdjson(url, body, onEvent, controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) {
        setState((prev) => ({ ...prev, error: err instanceof Error ? err.message : String(err) }));
      }
    } finally {
      if (abortRef.current === controller) {
        setState((prev) => ({ ...prev, running: false }));
      }
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setState(emptyRun<T>());
  };

  const restore = (result: T | null) => {
    abortRef.current?.abort();
    setState({ ...emptyRun<T>(), result });
  };

  return { state, start, reset, restore };
}

export default function FactCheckApp() {
  const [input, setInput] = useState<FactCheckInput>(EMPTY_INPUT);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseNote, setParseNote] = useState("");

  const [manualLabel, setManualLabel] = useState<FactLabel | "">("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualUrls, setManualUrls] = useState("");

  const ai = useStreamRun<AiResearchResult>();
  const cmp = useStreamRun<FinalReview>();

  const history = useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getHistoryServerSnapshot,
  );
  const [entryId, setEntryId] = useState<string | null>(null);

  const set = (field: keyof FactCheckInput) => (value: string) =>
    setInput((prev) => ({ ...prev, [field]: value }));

  const canCheck = input.targetSentence.trim() !== "" && /^\d{4}-\d{2}-\d{2}$/.test(input.queryDate);
  const manualUrlList = manualUrls
    .split(/\s+/)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));
  const canCompare =
    !!ai.state.result && !ai.state.running && !cmp.state.running &&
    (manualNotes.trim() !== "" || manualUrlList.length > 0);

  async function handleParse() {
    if (!pasteText.trim()) return;
    setParsing(true);
    setParseNote("");
    try {
      const res = await fetch(`${FACT_CHECK_API}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memecah teks.");
      const values = data.values as Partial<FactCheckInput>;
      setInput((prev) => ({ ...prev, ...values }));
      const filled = Object.keys(values).length;
      setParseNote(
        `${filled} dari 4 field terisi${data.usedAi ? " (dibantu Codex)" : ""}. Periksa kembali sebelum cek fakta.`,
      );
      setPasteOpen(false);
    } catch (err) {
      setParseNote(err instanceof Error ? err.message : String(err));
    } finally {
      setParsing(false);
    }
  }

  function handleCheck() {
    cmp.reset();
    const runInput = { ...input };
    const manual = { label: manualLabel, notes: manualNotes, urls: manualUrls };
    void ai.start(FACT_CHECK_API, runInput, (data) => {
      const id = newHistoryId();
      const now = new Date().toISOString();
      setEntryId(id);
      upsertHistoryEntry({
        id,
        createdAt: now,
        updatedAt: now,
        input: runInput,
        manual,
        aiResult: data,
        finalReview: null,
      });
    });
  }

  function handleCompare() {
    if (!ai.state.result) return;
    const aiResult = ai.state.result;
    const runInput = { ...input };
    const manual = { label: manualLabel, notes: manualNotes, urls: manualUrls };
    const targetId = entryId;
    void cmp.start(
      `${FACT_CHECK_API}/compare`,
      {
        input: runInput,
        aiResult,
        manual: { label: manualLabel || undefined, notes: manualNotes, urls: manualUrlList },
      },
      (data) => {
        const existing = findHistoryEntry(targetId);
        const now = new Date().toISOString();
        const id = existing?.id ?? newHistoryId();
        setEntryId(id);
        upsertHistoryEntry({
          id,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          input: runInput,
          manual,
          aiResult,
          finalReview: data,
        });
      },
    );
  }

  function handleLoad(entry: HistoryEntry) {
    setInput(entry.input);
    setManualLabel(entry.manual.label);
    setManualNotes(entry.manual.notes);
    setManualUrls(entry.manual.urls);
    ai.restore(entry.aiResult);
    cmp.restore(entry.finalReview);
    setEntryId(entry.id);
    setParseNote("");
  }

  function handleDelete(id: string) {
    removeHistoryEntry(id);
    if (id === entryId) setEntryId(null);
  }

  function handleReset() {
    setEntryId(null);
    ai.reset();
    cmp.reset();
    setInput(EMPTY_INPUT);
    setManualLabel("");
    setManualNotes("");
    setManualUrls("");
    setParseNote("");
  }

  const aiResult = ai.state.result;
  const final = cmp.state.result;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-teal-700">Factuality reviewer</p>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Fact Check AI</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Cek fakta <strong>Target Sentence</strong> per <strong>Query Date</strong>: riset AI (sports API resmi + Tavily, setiap URL dibuka satu per satu),
            riset manual Anda, lalu perbandingan keduanya menjadi final review. Berjalan lokal dengan Codex CLI.
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-4">
          <HistoryPanel
            entries={history}
            activeId={entryId}
            onLoad={handleLoad}
            onDelete={handleDelete}
            onClear={() => {
              clearHistory();
              setEntryId(null);
            }}
          />
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">1. Data task</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPasteOpen((v) => !v)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Tempel &amp; pecah otomatis
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                >
                  Reset
                </button>
              </div>
            </div>

            {pasteOpen && (
              <div className="mb-3 space-y-2 rounded-xl border border-teal-100 bg-teal-50/40 p-3">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={8}
                  placeholder="Tempel seluruh teks halaman task (User Query, Response, Target Sentence, Query Date)…"
                  className={`${fieldCls} font-mono text-xs`}
                />
                <button
                  type="button"
                  onClick={handleParse}
                  disabled={parsing || !pasteText.trim()}
                  className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {parsing ? "Memecah…" : "Pecah ke field"}
                </button>
              </div>
            )}
            {parseNote && <p className="mb-3 text-xs text-slate-600">{parseNote}</p>}

            <div className="space-y-3">
              <label className="block rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm">
                <span className="mb-1 block font-semibold text-rose-900">
                  Query Date <span className="text-rose-600">*</span>
                </span>
                <span className="mb-2 block text-xs text-rose-800">Semua penilaian berdasarkan kondisi pada tanggal ini, bukan hari ini.</span>
                <input
                  type="date"
                  value={input.queryDate}
                  onChange={(e) => set("queryDate")(e.target.value)}
                  className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-rose-100"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">
                  Target Sentence <span className="text-rose-600">*</span>
                </span>
                <textarea
                  value={input.targetSentence}
                  onChange={(e) => set("targetSentence")(e.target.value)}
                  rows={3}
                  className={`${fieldCls} border-sky-200 bg-sky-50`}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">User Query</span>
                <textarea value={input.userQuery} onChange={(e) => set("userQuery")(e.target.value)} rows={2} className={fieldCls} />
              </label>
              <ResponseField
                value={input.fullResponse}
                onChange={set("fullResponse")}
                targetSentence={input.targetSentence}
                className={fieldCls}
              />
              <button
                type="button"
                onClick={handleCheck}
                disabled={!canCheck || ai.state.running}
                className="w-full rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {ai.state.running ? "Sedang mengecek…" : "Cek Fakta"}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">3. Riset manual</h2>
            <p className="mb-3 text-xs text-slate-500">Bisa diisi kapan saja. URL akan dibuka satu per satu saat perbandingan.</p>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Label versi Anda (opsional)</span>
                <select
                  value={manualLabel}
                  onChange={(e) => setManualLabel(e.target.value as FactLabel | "")}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm"
                >
                  <option value="">— belum dipilih —</option>
                  {FACT_LABELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Catatan / reasoning manual</span>
                <textarea
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  rows={5}
                  placeholder="Temuan Anda, boleh Bahasa Indonesia atau English…"
                  className={fieldCls}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">URL sumber manual (satu per baris)</span>
                <textarea
                  value={manualUrls}
                  onChange={(e) => setManualUrls(e.target.value)}
                  rows={4}
                  placeholder="https://…"
                  className={`${fieldCls} font-mono text-xs`}
                />
              </label>
              <button
                type="button"
                onClick={handleCompare}
                disabled={!canCompare}
                className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
              >
                {cmp.state.running ? "Membandingkan…" : "Bandingkan & Buat Final Review"}
              </button>
              {!ai.state.result && <p className="text-xs text-slate-500">Jalankan Cek Fakta dulu untuk mengaktifkan perbandingan.</p>}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">2. Hasil riset AI</h2>
            {!ai.state.running && !aiResult && !ai.state.error && !ai.state.stages.length && (
              <p className="text-sm text-slate-500">Isi Target Sentence dan Query Date, lalu klik Cek Fakta.</p>
            )}
            <ProgressLog stages={ai.state.stages} links={ai.state.links} running={ai.state.running} />
            {ai.state.error && (
              <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{ai.state.error}</p>
            )}
            {aiResult && (
              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500">Label AI</span>
                  <LabelBadge label={aiResult.label} size="lg" />
                </div>
                <NarrativeCard title="Reasoning AI" narrative={aiResult.narrative} sourcesBlock={aiResult.sourcesBlock} />
                <details className="rounded-xl border border-slate-200 bg-white p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                    Rincian per klaim ({aiResult.extraction.claims.length})
                  </summary>
                  <div className="mt-3">
                    <ClaimBreakdown extraction={aiResult.extraction} verdicts={aiResult.verdicts} sources={aiResult.sources} />
                  </div>
                </details>
              </div>
            )}
          </section>

          {(cmp.state.running || cmp.state.stages.length > 0 || final || cmp.state.error) && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">4. Perbandingan &amp; final review</h2>
              <ProgressLog stages={cmp.state.stages} links={cmp.state.links} running={cmp.state.running} />
              {cmp.state.error && (
                <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{cmp.state.error}</p>
              )}
              {final && aiResult && (
                <div className="mt-4 space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="py-1 pr-2">Klaim</th>
                          <th className="py-1 pr-2">AI</th>
                          <th className="py-1 pr-2">Manual</th>
                          <th className="py-1 pr-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {final.comparisons.map((c) => {
                          const claim = aiResult.extraction.claims.find((x) => x.id === c.claimId);
                          const ag = AGREEMENT_LABEL[c.agreement];
                          return (
                            <tr key={c.claimId} className="border-t border-slate-100 align-top">
                              <td className="py-2 pr-2">
                                <span className="text-xs font-semibold text-slate-500">{c.claimId}</span>
                                <p className="text-slate-800">{claim?.text}</p>
                                <p className="mt-1 text-xs text-slate-500">{c.analysis}</p>
                              </td>
                              <td className="py-2 pr-2"><LabelBadge label={c.aiVerdict} size="sm" /></td>
                              <td className="py-2 pr-2 text-xs text-slate-700">{c.manualVerdict}</td>
                              <td className="py-2 pr-2">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ag.cls}`}>{ag.text}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-slate-500">Label final</span>
                    <LabelBadge label={final.label} size="lg" />
                    <ConfidenceBadge confidence={final.confidence} />
                  </div>

                  <NarrativeCard title="Final review" narrative={final.narrative} sourcesBlock={final.sourcesBlock} />

                  {final.notesForUser && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <h4 className="mb-1 text-sm font-semibold text-amber-900">Catatan untuk Anda (tidak ikut disalin)</h4>
                      <p className="whitespace-pre-wrap text-sm text-amber-900">{final.notesForUser}</p>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
