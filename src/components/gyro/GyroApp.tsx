"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  GYRO_ISSUE_OPTIONS,
  GYRO_P1_OPTIONS,
  GYRO_P2_OPTIONS,
  GYRO_P3_OPTIONS,
  GYRO_SCENE_KIND_OPTIONS,
  type GyroAnswer,
  type GyroIssueKey,
  type GyroReviewResult,
  type GyroReviewerNotes,
  type GyroTaskContext,
  type MultimodalState,
  type P1Tag,
  type P2Tag,
  type P3Tag,
  type RubricVersion,
  type SceneKind,
  type TriState,
} from "@/lib/gyro/types";

type OutputTab = "summary" | "answers" | "json";

type ChatMsg = { role: "user" | "assistant"; content: string };

const TRI_OPTIONS: { value: TriState; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Unknown" },
];

const emptyContext = (): GyroTaskContext => ({
  rubricVersion: "v1",
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
  taskText: "",
  transcript: "",
});

const emptyNotes = (): GyroReviewerNotes => ({
  deepResearchRequested: "unknown",
  deepResearchTriggered: "unknown",
  deepResearchPhraseSpoken: "unknown",
  captionsVisible: "unknown",
  visualOverlayUsed: "unknown",
  personalizationObserved: "unknown",
  recordingComplete: "unknown",
  commentsMatchRecording: "unknown",
  issues: [],
  comments: "",
  corrections: "",
});

function demoPayload(): { context: GyroTaskContext; notes: GyroReviewerNotes } {
  return {
    context: {
      rubricVersion: "v1",
      taskLanguage: "id",
      multimodal: "yes",
      requiresScene: "yes",
      sceneKind: "screen_share",
      scene: "Halaman perbandingan mesin espresso di tab belanja terbuka.",
      p1: "P1:DIRECT",
      p2: "P2:IMPATIENT",
      p3: "P3:SUMMARIZE",
      userGoal:
        "Membandingkan mesin espresso yang lebih senyap di bawah budget dan mendapat rekomendasi singkat.",
      initialPrompt:
        "Tolong riset mesin espresso yang lebih senyap di bawah 6 juta pakai Deep Research.",
      beforeInstructions:
        "Langsung sampaikan goal lengkap dan minta Deep Research di turn pertama.",
      whileInstructions:
        "Sambil menunggu, tanyakan ETA / progress beberapa kali (impatient).",
      afterInstructions:
        "Setelah report muncul, minta ringkasan verbal top 2 rekomendasi.",
      taskText: "Tag path contoh: P1:DIRECT | P2:IMPATIENT | P3:SUMMARIZE",
      transcript:
        "User: Tolong riset mesin espresso yang lebih senyap… pakai Deep Research.\nAssistant: Saya mulai Deep Research.\n[Deep Research berjalan]\nUser: Sudah berapa lama ya? Estimasi selesai kapan?\nAssistant: Masih mengumpulkan sumber…\n[Report muncul]\nUser: Bisakah diringkas secara lisan dua pilihan terbaik?\nAssistant: Ringkasannya…",
    },
    notes: {
      deepResearchRequested: "yes",
      deepResearchTriggered: "yes",
      deepResearchPhraseSpoken: "yes",
      captionsVisible: "yes",
      visualOverlayUsed: "no",
      personalizationObserved: "unknown",
      recordingComplete: "yes",
      commentsMatchRecording: "yes",
      issues: ["interruptions"],
      comments:
        "P1:DIRECT terpenuhi (DR diminta di turn 1). P2 impatient terlihat dari pertanyaan ETA. P3 summarize diminta setelah report. Ada interupsi ringan saat menunggu.",
      corrections: "ASR menulis 'expresso' → dikoreksi menjadi 'espresso'.",
    },
  };
}

function fieldClass() {
  return "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/60 focus:outline-none";
}

function labelClass() {
  return "mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400";
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-100">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function TriSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TriState;
  onChange: (v: TriState) => void;
}) {
  return (
    <div>
      <label className={labelClass()}>{label}</label>
      <select
        className={fieldClass()}
        value={value}
        onChange={(e) => onChange(e.target.value as TriState)}
      >
        {TRI_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function GyroApp() {
  const [context, setContext] = useState<GyroTaskContext>(emptyContext);
  const [notes, setNotes] = useState<GyroReviewerNotes>(emptyNotes);
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>();
  const [tab, setTab] = useState<OutputTab>("answers");
  const [result, setResult] = useState<GyroReviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [memoryInfo, setMemoryInfo] = useState({ foundation: 0, skills: 0 });
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<{
    summary: string;
    answers: GyroAnswer[];
  } | null>(null);

  useEffect(() => {
    fetch("/api/gyro/memory")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setMemoryInfo({
            foundation: Number(d.foundationSkillCount || 0),
            skills: Number(d.memory?.skills?.length || 0),
          });
        }
      })
      .catch(() => {});
  }, []);

  const patchContext = useCallback(
    (patch: Partial<GyroTaskContext>) =>
      setContext((c) => ({ ...c, ...patch })),
    [],
  );
  const patchNotes = useCallback(
    (patch: Partial<GyroReviewerNotes>) =>
      setNotes((n) => ({ ...n, ...patch })),
    [],
  );

  const p1Hint = GYRO_P1_OPTIONS.find((o) => o.value === context.p1)?.hint;
  const p2Hint = GYRO_P2_OPTIONS.find((o) => o.value === context.p2)?.hint;
  const p3Hint = GYRO_P3_OPTIONS.find((o) => o.value === context.p3)?.hint;
  const tagPath = [context.p1, context.p2, context.p3].filter(Boolean).join(" | ");

  function toggleIssue(key: GyroIssueKey) {
    setNotes((n) => ({
      ...n,
      issues: n.issues.includes(key)
        ? n.issues.filter((k) => k !== key)
        : [...n.issues, key],
    }));
  }

  function loadDemo() {
    const demo = demoPayload();
    setContext(demo.context);
    setNotes(demo.notes);
    setImageDataUrl(undefined);
    setResult(null);
    setError(null);
  }

  async function onImage(file: File | null) {
    if (!file) {
      patchContext({ imageName: undefined });
      setImageDataUrl(undefined);
      return;
    }
    patchContext({ imageName: file.name });
    const buf = await file.arrayBuffer();
    const b64 = btoa(
      Array.from(new Uint8Array(buf), (b) => String.fromCharCode(b)).join(""),
    );
    setImageDataUrl(`data:${file.type || "image/jpeg"};base64,${b64}`);
  }

  async function onTranscriptFile(file: File | null) {
    if (!file) {
      patchContext({ transcriptFileName: undefined });
      return;
    }
    const text = await file.text();
    patchContext({
      transcriptFileName: file.name,
      transcript: text.slice(0, 100_000),
    });
  }

  async function onGenerate() {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/gyro/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: { ...context, taskLanguage: "id" },
          notes,
          imageDataUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generate gagal.");
      setResult(data.result as GyroReviewResult);
      setTab("answers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate gagal.");
    } finally {
      setLoading(false);
    }
  }

  const outputText = useMemo(() => {
    if (!result) return "";
    if (tab === "summary") return result.summary;
    if (tab === "json") return JSON.stringify(result.json, null, 2);
    return result.answers
      .map((a) => `${a.id}. ${a.label}\n${a.value}`)
      .join("\n\n");
  }, [result, tab]);

  async function onCopy() {
    if (!outputText) return;
    await navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function onSendChat() {
    const message = chatInput.trim();
    if (!message || chatLoading) return;
    setChatError(null);
    setChatLoading(true);
    setChatInput("");
    const nextHistory = [...chatMessages, { role: "user" as const, content: message }];
    setChatMessages(nextHistory);
    try {
      const res = await fetch("/api/gyro/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: chatMessages,
          context: { ...context, taskLanguage: "id" },
          notes,
          result,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat gagal.");
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: String(data.reply || "") },
      ]);
      if (data.proposeUpdate && Array.isArray(data.answers) && data.answers.length) {
        setPendingUpdate({
          summary: String(data.summary || result?.summary || ""),
          answers: data.answers as GyroAnswer[],
        });
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Chat gagal.");
    } finally {
      setChatLoading(false);
    }
  }

  function applyPendingUpdate() {
    if (!pendingUpdate) return;
    const answers = pendingUpdate.answers;
    const summary = pendingUpdate.summary;
    const json: Record<string, unknown> = {
      rubricVersion: context.rubricVersion,
      tagPath: [context.p1, context.p2, context.p3].filter(Boolean).join(" | "),
      summary,
      answers,
      updatedViaChat: true,
    };
    for (const a of answers) json[a.id] = a.value;
    setResult({ summary, answers, json });
    setPendingUpdate(null);
    setTab("answers");
    setChatMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "Perubahan sudah diterapkan ke Answers / Summary.",
      },
    ]);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-cyan-400/90">
              Gyro Accordion · Deep Research Evaluation
            </p>
            <h1 className="text-xl font-semibold text-white sm:text-2xl">
              Task Gyro Accordion
            </h1>
            <p className="mt-0.5 max-w-2xl text-sm text-zinc-400">
              Reviewer Indonesia — nilai P1 Before / P2 While / P3 After sesuai
              guidelines resmi, lalu generate jawaban siap submit.
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Foundation skills: {memoryInfo.foundation} · Gyro memory:{" "}
              {memoryInfo.skills} (terpisah dari TTS)
              {tagPath ? ` · Tags: ${tagPath}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/"
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              ← Evaluasi TTS
            </Link>
            <button
              type="button"
              onClick={loadDemo}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
            >
              Demo data
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-2">
        <Panel title="Task Context">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass()}>Rubric version</label>
              <select
                className={fieldClass()}
                value={context.rubricVersion}
                onChange={(e) =>
                  patchContext({
                    rubricVersion: e.target.value as RubricVersion,
                  })
                }
              >
                <option value="v1">Version 1 — Q1–Q22 workflow</option>
                <option value="v2">Version 2 — Product quality</option>
              </select>
            </div>
            <div>
              <label className={labelClass()}>Task language</label>
              <div className={`${fieldClass()} flex items-center text-zinc-300`}>
                Bahasa Indonesia
              </div>
            </div>
            <TriSelect
              label="Multimodal?"
              value={context.multimodal}
              onChange={(v) => patchContext({ multimodal: v as MultimodalState })}
            />
            <TriSelect
              label="Requires scene?"
              value={context.requiresScene}
              onChange={(v) => patchContext({ requiresScene: v })}
            />
          </div>

          {(context.requiresScene === "yes" || context.multimodal === "yes") && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass()}>Scene kind</label>
                <select
                  className={fieldClass()}
                  value={context.sceneKind}
                  onChange={(e) =>
                    patchContext({ sceneKind: e.target.value as SceneKind })
                  }
                >
                  {GYRO_SCENE_KIND_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass()}>Scene detail</label>
                <input
                  className={fieldClass()}
                  value={context.scene}
                  onChange={(e) => patchContext({ scene: e.target.value })}
                  placeholder="App/website/objek yang harus di-share"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass()}>P1 tag (Before / pre-DR)</label>
              <select
                className={fieldClass()}
                value={context.p1}
                onChange={(e) =>
                  patchContext({ p1: e.target.value as P1Tag })
                }
              >
                {GYRO_P1_OPTIONS.map((o) => (
                  <option key={o.value || "empty"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {p1Hint && (
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                  {p1Hint}
                </p>
              )}
            </div>
            <div>
              <label className={labelClass()}>P2 tag (While / during-DR)</label>
              <select
                className={fieldClass()}
                value={context.p2}
                onChange={(e) =>
                  patchContext({ p2: e.target.value as P2Tag })
                }
              >
                {GYRO_P2_OPTIONS.map((o) => (
                  <option key={o.value || "empty"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {p2Hint && (
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                  {p2Hint}
                </p>
              )}
            </div>
            <div>
              <label className={labelClass()}>P3 tag (After / post-DR)</label>
              <select
                className={fieldClass()}
                value={context.p3}
                onChange={(e) =>
                  patchContext({ p3: e.target.value as P3Tag })
                }
              >
                {GYRO_P3_OPTIONS.map((o) => (
                  <option key={o.value || "empty"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {p3Hint && (
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                  {p3Hint}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className={labelClass()}>User goal</label>
            <textarea
              className={`${fieldClass()} min-h-[72px]`}
              value={context.userGoal}
              onChange={(e) => patchContext({ userGoal: e.target.value })}
              placeholder="Objektif persona evaluator"
            />
          </div>
          <div>
            <label className={labelClass()}>Initial prompt (Bahasa lokal)</label>
            <textarea
              className={`${fieldClass()} min-h-[72px]`}
              value={context.initialPrompt}
              onChange={(e) => patchContext({ initialPrompt: e.target.value })}
              placeholder="Kalimat Turn 1 yang diucapkan"
            />
          </div>
          <div>
            <label className={labelClass()}>Before instructions (P1)</label>
            <textarea
              className={`${fieldClass()} min-h-[72px]`}
              value={context.beforeInstructions}
              onChange={(e) =>
                patchContext({ beforeInstructions: e.target.value })
              }
            />
          </div>
          <div>
            <label className={labelClass()}>While instructions (P2)</label>
            <textarea
              className={`${fieldClass()} min-h-[72px]`}
              value={context.whileInstructions}
              onChange={(e) =>
                patchContext({ whileInstructions: e.target.value })
              }
            />
          </div>
          <div>
            <label className={labelClass()}>After instructions (P3)</label>
            <textarea
              className={`${fieldClass()} min-h-[72px]`}
              value={context.afterInstructions}
              onChange={(e) =>
                patchContext({ afterInstructions: e.target.value })
              }
            />
          </div>
          <div>
            <label className={labelClass()}>Catatan task tambahan (opsional)</label>
            <textarea
              className={`${fieldClass()} min-h-[64px]`}
              value={context.taskText}
              onChange={(e) => patchContext({ taskText: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass()}>Transcript</label>
            <textarea
              className={`${fieldClass()} min-h-[140px] font-mono text-[13px]`}
              value={context.transcript}
              onChange={(e) => patchContext({ transcript: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass()}>Task image / screenshot</label>
              <input
                type="file"
                accept="image/*"
                className="block w-full text-xs text-zinc-400 file:mr-2 file:rounded-md file:border-0 file:bg-zinc-800 file:px-2 file:py-1.5 file:text-zinc-200"
                onChange={(e) => onImage(e.target.files?.[0] || null)}
              />
              {context.imageName && (
                <p className="mt-1 truncate text-xs text-cyan-400/90">
                  {context.imageName}
                </p>
              )}
            </div>
            <div>
              <label className={labelClass()}>Transcript .txt</label>
              <input
                type="file"
                accept=".txt,text/plain"
                className="block w-full text-xs text-zinc-400 file:mr-2 file:rounded-md file:border-0 file:bg-zinc-800 file:px-2 file:py-1.5 file:text-zinc-200"
                onChange={(e) => onTranscriptFile(e.target.files?.[0] || null)}
              />
              {context.transcriptFileName && (
                <p className="mt-1 truncate text-xs text-cyan-400/90">
                  {context.transcriptFileName}
                </p>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="Reviewer Notes">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TriSelect
              label="Deep Research requested?"
              value={notes.deepResearchRequested}
              onChange={(v) => patchNotes({ deepResearchRequested: v })}
            />
            <TriSelect
              label="DR phrase spoken / regex met?"
              value={notes.deepResearchPhraseSpoken}
              onChange={(v) => patchNotes({ deepResearchPhraseSpoken: v })}
            />
            <TriSelect
              label="Deep Research triggered?"
              value={notes.deepResearchTriggered}
              onChange={(v) => patchNotes({ deepResearchTriggered: v })}
            />
            <TriSelect
              label="Captions / transcription on?"
              value={notes.captionsVisible}
              onChange={(v) => patchNotes({ captionsVisible: v })}
            />
            <TriSelect
              label="Visual overlay used?"
              value={notes.visualOverlayUsed}
              onChange={(v) => patchNotes({ visualOverlayUsed: v })}
            />
            <TriSelect
              label="Personalization observed?"
              value={notes.personalizationObserved}
              onChange={(v) => patchNotes({ personalizationObserved: v })}
            />
            <TriSelect
              label="Recording complete?"
              value={notes.recordingComplete}
              onChange={(v) => patchNotes({ recordingComplete: v })}
            />
            <TriSelect
              label="Comments match recording? (Golden Rule)"
              value={notes.commentsMatchRecording}
              onChange={(v) => patchNotes({ commentsMatchRecording: v })}
            />
          </div>

          <div>
            <p className={labelClass()}>Quick issues</p>
            <div className="flex flex-wrap gap-2">
              {GYRO_ISSUE_OPTIONS.map((opt) => {
                const on = notes.issues.includes(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleIssue(opt.key)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition ${
                      on
                        ? "border-cyan-500/70 bg-cyan-500/15 text-cyan-200"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={labelClass()}>
              Reviewer comments (wajib deskriptif)
            </label>
            <textarea
              className={`${fieldClass()} min-h-[110px]`}
              value={notes.comments}
              onChange={(e) => patchNotes({ comments: e.target.value })}
              placeholder="Jelaskan bukti dari recording — jangan jawaban satu kata"
            />
          </div>
          <div>
            <label className={labelClass()}>
              Corrections made to submitted turns
            </label>
            <textarea
              className={`${fieldClass()} min-h-[90px]`}
              value={notes.corrections}
              onChange={(e) => patchNotes({ corrections: e.target.value })}
            />
          </div>
        </Panel>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-100">
              Output Workspace
            </h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onGenerate}
                disabled={loading}
                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-400 disabled:opacity-50"
              >
                {loading ? "Generating…" : "Generate"}
              </button>
              <button
                type="button"
                onClick={onCopy}
                disabled={!outputText}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
              >
                {copied ? "Copied" : "Copy Output"}
              </button>
            </div>
          </div>

          <div className="mb-3 flex gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
            {(
              [
                ["summary", "Summary"],
                ["answers", "Answers"],
                ["json", "JSON"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm transition ${
                  tab === id
                    ? "bg-zinc-800 text-cyan-300"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {error && (
            <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}

          <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-[13px] leading-relaxed text-zinc-200">
            {outputText ||
              "Belum ada output. Isi konteks + notes, lalu klik Generate."}
          </pre>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold tracking-wide text-zinc-100">
                Chat dengan AI (task ini)
              </h2>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Tanya / koreksi jawaban. Jika AI mengusulkan revisi, klik Terapkan
                ke Answers.
              </p>
            </div>
            {pendingUpdate && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applyPendingUpdate}
                  className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-400"
                >
                  Terapkan ke Answers
                </button>
                <button
                  type="button"
                  onClick={() => setPendingUpdate(null)}
                  className="rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  Buang usulan
                </button>
              </div>
            )}
          </div>

          {pendingUpdate && (
            <p className="mb-3 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
              AI mengusulkan update {pendingUpdate.answers.length} jawaban.
              Review dulu, lalu Terapkan ke Answers.
            </p>
          )}

          <div className="mb-3 max-h-[280px] space-y-2 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            {chatMessages.length === 0 && (
              <p className="text-sm text-zinc-500">
                Contoh: &quot;Q11 harus No karena Deep Research tidak triggered di
                transcript&quot; atau &quot;Jelaskan apakah P1:DIRECT sudah
                terpenuhi&quot;.
              </p>
            )}
            {chatMessages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "ml-8 bg-zinc-800 text-zinc-100"
                    : "mr-8 border border-zinc-800 bg-zinc-900 text-zinc-200"
                }`}
              >
                <p className="mb-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                  {m.role === "user" ? "Anda" : "AI"}
                </p>
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            ))}
            {chatLoading && (
              <p className="text-sm text-zinc-500">AI sedang membalas…</p>
            )}
          </div>

          {chatError && (
            <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {chatError}
            </p>
          )}

          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void onSendChat();
            }}
          >
            <textarea
              className={`${fieldClass()} min-h-[72px] flex-1`}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Tulis pertanyaan atau koreksi untuk AI tentang task ini…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSendChat();
                }
              }}
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white disabled:opacity-40 sm:self-end"
            >
              Kirim
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
