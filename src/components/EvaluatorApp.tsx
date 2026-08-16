"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  EvalLanguage,
  EvaluationRecord,
  EvaluationSummary,
  LanguageErrorNotes,
} from "@/lib/types";
import { EVAL_LANGUAGES, LANGUAGE_ERROR_OPTIONS, languageErrorLabel, languageMeta } from "@/lib/types";
import ResultPanel from "./ResultPanel";
import ReviewerPanel from "./ReviewerPanel";

type AudioSlot = {
  key: "reference" | "audioA" | "audioB";
  label: string;
  hint: string;
  accent: string;
};

const SLOTS: AudioSlot[] = [
  {
    key: "reference",
    label: "Reference Voice",
    hint: "Suara asli target speaker",
    accent: "border-slate-300",
  },
  {
    key: "audioA",
    label: "Audio A",
    hint: "Sampel TTS model A",
    accent: "border-sky-400",
  },
  {
    key: "audioB",
    label: "Audio B",
    hint: "Sampel TTS model B",
    accent: "border-orange-400",
  },
];

function preferenceLabel(value: string) {
  if (value === "A_BETTER") return "A";
  if (value === "B_BETTER") return "B";
  return "—";
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EvaluatorApp() {
  const [history, setHistory] = useState<EvaluationSummary[]>([]);
  const [memoryCount, setMemoryCount] = useState(0);
  const [avalanchSkillsCount, setAvalanchSkillsCount] = useState(0);
  const [storageMode, setStorageMode] = useState<"local" | "supabase">(
    "local",
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeRecord, setActiveRecord] = useState<EvaluationRecord | null>(
    null,
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [files, setFiles] = useState<
    Partial<Record<AudioSlot["key"], File | null>>
  >({});
  const [previews, setPreviews] = useState<
    Partial<Record<AudioSlot["key"], string>>
  >({});
  const [textPrompt, setTextPrompt] = useState("");
  const [language, setLanguage] = useState<EvalLanguage>("id");
  const [listenerNote, setListenerNote] = useState("");
  const [languageErrors, setLanguageErrors] = useState<LanguageErrorNotes>({
    reference: "none",
    audioA: "none",
    audioB: "none",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNew = activeId === null;
  const canSubmit = useMemo(() => {
    return Boolean(
      files.reference && files.audioA && files.audioB && textPrompt.trim(),
    );
  }, [files, textPrompt]);

  async function refreshHistory() {
    const res = await fetch("/api/history");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal memuat history.");
    setHistory(data.items as EvaluationSummary[]);
    setMemoryCount(Number(data.memoryCount || 0));
    setAvalanchSkillsCount(Number(data.avalanchSkillsCount || 0));
    if (data.storage === "supabase" || data.storage === "local") {
      setStorageMode(data.storage);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshHistory();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Gagal memuat history.");
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function openHistory(id: string) {
    setError(null);
    setActiveId(id);
    setSidebarOpen(false);
    try {
      const res = await fetch(`/api/history/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuka evaluasi.");
      setActiveRecord(data.record as EvaluationRecord);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
      setActiveRecord(null);
    }
  }

  function startNew() {
    setActiveId(null);
    setActiveRecord(null);
    setError(null);
    setSidebarOpen(false);
  }

  function onPick(key: AudioSlot["key"], file: File | null) {
    setFiles((prev) => ({ ...prev, [key]: file }));
    setPreviews((prev) => {
      const next = { ...prev };
      if (prev[key]) URL.revokeObjectURL(prev[key]!);
      if (file) next[key] = URL.createObjectURL(file);
      else delete next[key];
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !files.reference || !files.audioA || !files.audioB) return;

    setLoading(true);
    setError(null);

    try {
      const form = new FormData();
      form.set("textPrompt", textPrompt.trim());
      form.set("language", language);
      if (listenerNote.trim()) {
        form.set("listenerNote", listenerNote.trim());
      }
      if (languageErrors.reference && languageErrors.reference !== "none") {
        form.set("languageErrorReference", languageErrors.reference);
      }
      if (languageErrors.audioA && languageErrors.audioA !== "none") {
        form.set("languageErrorAudioA", languageErrors.audioA);
      }
      if (languageErrors.audioB && languageErrors.audioB !== "none") {
        form.set("languageErrorAudioB", languageErrors.audioB);
      }
      form.set("reference", files.reference);
      form.set("audioA", files.audioA);
      form.set("audioB", files.audioB);

      const res = await fetch("/api/evaluate", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal mengevaluasi.");
      }

      const record = data.record as EvaluationRecord;
      setActiveId(record.id);
      setActiveRecord(record);
      await refreshHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Hapus evaluasi ini dari history?")) return;
    const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Gagal menghapus.");
      return;
    }
    if (activeId === id) startNew();
    await refreshHistory();
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Tutup sidebar"
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-slate-800 bg-slate-950 text-slate-100 transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-slate-800 p-3">
          <button
            type="button"
            onClick={startNew}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-left text-sm font-medium text-white transition hover:bg-slate-800"
          >
            + Evaluasi baru
          </button>
          <p className="mt-2 px-1 text-[11px] text-slate-400">
            Storage: {storageMode} · Avalanch: {avalanchSkillsCount} · Memory:{" "}
            {memoryCount}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            History
          </p>
          {historyLoading && (
            <p className="px-2 py-3 text-xs text-slate-500">Memuat...</p>
          )}
          {!historyLoading && history.length === 0 && (
            <p className="px-2 py-3 text-xs text-slate-500">
              Belum ada penilaian tersimpan.
            </p>
          )}
          <ul className="space-y-1">
            {history.map((item) => {
              const active = item.id === activeId;
              return (
                <li key={item.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => openHistory(item.id)}
                    className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
                      active
                        ? "bg-slate-800 text-white"
                        : "text-slate-300 hover:bg-slate-900"
                    }`}
                  >
                    <span className="line-clamp-2 text-sm leading-snug">
                      {item.title}
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                      <span>{formatWhen(item.createdAt)}</span>
                      <span>· {languageMeta(item.language).value.toUpperCase()}</span>
                      <span>· Pref {preferenceLabel(item.preference)}</span>
                      {item.reviewCount > 0 && (
                        <span>· {item.reviewCount} review</span>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    title="Hapus"
                    onClick={() => onDelete(item.id)}
                    className="absolute right-2 top-2 hidden rounded-md px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-700 hover:text-rose-300 group-hover:inline-block"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            History
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-wide text-teal-700">
              TTS AI Evaluator
            </p>
            <h1 className="truncate text-lg font-semibold text-slate-900">
              {isNew
                ? "Evaluasi baru"
                : activeRecord?.title || "Memuat evaluasi..."}
            </h1>
          </div>
          <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 sm:inline">
            Avalanch {avalanchSkillsCount} · memory {memoryCount}
          </span>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </div>
          )}

          {isNew && (
            <>
              <section className="mb-6 rounded-2xl border border-teal-100 bg-teal-50/70 p-4 text-sm leading-relaxed text-teal-950">
                Evaluasi mengikuti Avalanch TTS guideline: reference hanya untuk
                Persona Likeness. Catatan pendengar opsional digabung dengan AI.
                Rationale/justification bilingual, dengan bukti konkret (waktu +
                kata) bila terdengar jelas. Pilih bahasa evaluasi agar AI fokus
                ke norma bahasa tersebut.
              </section>

              <form onSubmit={onSubmit} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  {SLOTS.map((slot) => (
                    <div
                      key={slot.key}
                      className={`flex flex-col rounded-2xl border-2 border-dashed bg-white p-4 ${slot.accent}`}
                    >
                      <span
                        className={`text-sm font-semibold ${
                          slot.key === "audioA"
                            ? "text-sky-700"
                            : slot.key === "audioB"
                              ? "text-orange-700"
                              : "text-slate-800"
                        }`}
                      >
                        {slot.label}
                      </span>
                      <span className="mt-1 text-xs text-slate-500">
                        {slot.hint}
                      </span>
                      <input
                        type="file"
                        accept="audio/*"
                        className="mt-3 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
                        onChange={(e) =>
                          onPick(slot.key, e.target.files?.[0] || null)
                        }
                      />
                      {files[slot.key] && (
                        <span className="mt-2 truncate text-xs text-slate-500">
                          {files[slot.key]!.name}
                        </span>
                      )}
                      {previews[slot.key] && (
                        <audio
                          controls
                          src={previews[slot.key]}
                          className="mt-3 w-full"
                        />
                      )}
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <label
                    htmlFor="eval-language"
                    className="block text-sm font-semibold text-slate-800"
                  >
                    Bahasa evaluasi
                  </label>
                  <p className="mt-1 text-xs text-slate-500">
                    AI fokus ke norma pronunciation & nativeness bahasa ini.
                    Rationale kedua mengikuti bahasa lokal terkait.
                  </p>
                  <select
                    id="eval-language"
                    value={language}
                    onChange={(e) =>
                      setLanguage(e.target.value as EvalLanguage)
                    }
                    className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none ring-teal-600/30 focus:bg-white focus:ring-2"
                  >
                    {EVAL_LANGUAGES.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <label className="block text-sm font-semibold text-slate-800">
                    Text Prompt
                  </label>
                  <p className="mt-1 text-xs text-slate-500">
                    Teks yang seharusnya diucapkan Audio A dan Audio B.
                  </p>
                  <textarea
                    value={textPrompt}
                    onChange={(e) => setTextPrompt(e.target.value)}
                    rows={5}
                    placeholder="Tempel teks prompt di sini..."
                    className="mt-3 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none ring-teal-600/30 focus:bg-white focus:ring-2"
                  />
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                  <label className="block text-sm font-semibold text-slate-800">
                    Catatan pendengar{" "}
                    <span className="font-normal text-slate-500">(opsional)</span>
                  </label>
                  <p className="mt-1 text-xs text-slate-500">
                    Observasi umum + kesalahan bahasa per clip digabung dengan
                    penilaian AI untuk kesimpulan akhir.
                  </p>
                  <textarea
                    value={listenerNote}
                    onChange={(e) => setListenerNote(e.target.value)}
                    rows={3}
                    placeholder="Contoh: Pertanyaan di A terdengar datar; B lebih natural tapi kurang mirip reference..."
                    className="mt-3 w-full resize-y rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-amber-500/30 focus:ring-2"
                  />

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {(
                      [
                        ["reference", "Reference"],
                        ["audioA", "Audio A"],
                        ["audioB", "Audio B"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="block">
                        <span className="text-xs font-semibold text-slate-700">
                          Kesalahan bahasa · {label}
                        </span>
                        <select
                          value={languageErrors[key] || "none"}
                          onChange={(e) =>
                            setLanguageErrors((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                          className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none ring-amber-500/30 focus:ring-2"
                        >
                          {LANGUAGE_ERROR_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={!canSubmit || loading}
                    className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {loading ? "Menganalisis audio..." : "Evaluasi dengan AI"}
                  </button>
                  {loading && (
                    <span className="text-xs text-slate-500">
                      Biasanya 15–60 detik · Avalanch {avalanchSkillsCount} +
                      reviewer memory {memoryCount}
                    </span>
                  )}
                </div>
              </form>
            </>
          )}

          {!isNew && activeRecord && (
            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Detail evaluasi
                </h2>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-slate-500">Waktu</dt>
                    <dd className="text-slate-800">
                      {formatWhen(activeRecord.createdAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Model</dt>
                    <dd className="truncate text-slate-800">
                      {activeRecord.model}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Bahasa</dt>
                    <dd className="text-slate-800">
                      {languageMeta(activeRecord.language).label}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-500">Text prompt</dt>
                    <dd className="mt-1 rounded-xl bg-slate-50 p-3 text-slate-700">
                      {activeRecord.textPrompt}
                    </dd>
                  </div>
                  {activeRecord.listenerNote ? (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-slate-500">
                        Catatan pendengar
                      </dt>
                      <dd className="mt-1 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-slate-700">
                        {activeRecord.listenerNote}
                      </dd>
                    </div>
                  ) : null}
                  {(activeRecord.languageErrors?.reference ||
                    activeRecord.languageErrors?.audioA ||
                    activeRecord.languageErrors?.audioB) && (
                    <div className="sm:col-span-2">
                      <dt className="text-xs text-slate-500">
                        Kesalahan bahasa
                      </dt>
                      <dd className="mt-1 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                        {(
                          [
                            ["reference", "Reference"],
                            ["audioA", "Audio A"],
                            ["audioB", "Audio B"],
                          ] as const
                        ).map(([key, label]) =>
                          activeRecord.languageErrors?.[key] ? (
                            <div
                              key={key}
                              className="rounded-xl border border-rose-200 bg-rose-50/70 p-3"
                            >
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                                {label}
                              </p>
                              <p className="mt-1 text-xs leading-relaxed">
                                {languageErrorLabel(
                                  activeRecord.languageErrors[key],
                                ) || activeRecord.languageErrors[key]}
                              </p>
                            </div>
                          ) : null,
                        )}
                      </dd>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-500">File</dt>
                    <dd className="mt-1 text-xs text-slate-600">
                      Ref: {activeRecord.fileNames.reference} · A:{" "}
                      {activeRecord.fileNames.audioA} · B:{" "}
                      {activeRecord.fileNames.audioB}
                    </dd>
                  </div>
                </dl>
              </section>

              <ResultPanel
                result={activeRecord.result}
                model={activeRecord.model}
                language={activeRecord.language}
              />

              <ReviewerPanel
                record={activeRecord}
                onUpdated={(next) => {
                  setActiveRecord(next);
                  void refreshHistory();
                }}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
