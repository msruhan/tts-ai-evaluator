"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { buildContextFromPaste } from "@/lib/gyro/parse-task-paste";
import {
  GYRO_ISSUE_OPTIONS,
  type GyroAnswer,
  type GyroIssueKey,
  type GyroReviewResult,
  type GyroReviewerNotes,
  type RubricVersion,
  type TriState,
} from "@/lib/gyro/types";

type OutputTab = "summary" | "answers" | "json";
type ChatMsg = { role: "user" | "assistant"; content: string };

const DEMO_TASK_PASTE = `📌 Your Task Variables
Review and internalize the following task-specific variables before starting your session.

your language is Indonesian

🔧 General Setup
Variable	Value
Is this task multimodal?	YES 🎥
Category	Consumer Research
Subcategory	Unfiltered product sentiment research
Scene	A screen share showing an Amazon product listing, an online store product page, or an app listing. The evaluator should navigate to a specific product they're genuinely considering buying.

💬 Initial Prompt
Aku lagi mau checkout TWS Baseus ini di Tokopedia, tapi aku butuh banget kesimpulan ulasan jujur dari pelanggan asli yang udah pernah pakai barang ini—bukan cuma ulasan bintang lima settingan yang ada di aplikasinya. Bisa tolong lihat produk ini bareng aku dan bantu cari tau apa pendapat netizen di luar sana, mungkin dari thread X (Twitter), TikTok, atau forum Kaskus, biar aku bisa dapet rangkuman yang bener-bener unfiltered dan no endorse?

🎯 User Goal
The user wants to receive an unbiased, aggregated summary of real customer sentiment and experiences for a specific product they are considering buying online, to inform their purchase decision.

🏷️ Phase Tags
Phase	Tag
P1 (Before Deep Research)	P1:CONVO
P2 (While Waiting)	P2:IMPATIENT
P3 (After Completion)	P3:SUMMARIZE

📋 Phase Instructions
Before Instructions (Phase 1)
Have a 2-4 turn conversation based on some of the suggestions below THEN ask to Deep Research the topics you just discussed. You must use the word "Deep Research."

While Instructions (Phase 2)
The user might ask if the research is still underway.
The user might wonder if this process typically takes this long.
The user might ask for a quick status update on the progress of the research.

After Instructions (Phase 3)
You MUST ask for a quick overview of the Deep Research report on Unfiltered product sentiment research

⚠️ Make sure you have read and understood ALL variables above before proceeding.`;

const DEMO_TRANSCRIPT = `User: Aku mau checkout TWS Baseus ini, bisa bantu lihat ulasan jujur di luar app?
Assistant: Bisa. Mau fokus fokus ke kualitas suara dulu atau daya tahan baterai?
User: Keduanya, terus bandingkan sama ulasan di Tokopedia.
Assistant: Oke. Mau aku pakai Deep Research biar rangkumannya lebih lengkap?
User: Iya, pakai Deep Research.
[Deep Research berjalan]
User: Masih lama ya? Estimasi selesai kapan?
Assistant: Masih mengumpulkan sumber, sebentar lagi.
[Report muncul]
User: Tolong kasih overview singkat report-nya.
Assistant: Ringkasannya…`;

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

function fieldClass() {
  return "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500/60 focus:outline-none";
}

function labelClass() {
  return "mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400";
}

export default function GyroApp() {
  const [taskPaste, setTaskPaste] = useState("");
  const [transcript, setTranscript] = useState("");
  const [rubricVersion, setRubricVersion] = useState<RubricVersion>("v1");
  const [notes, setNotes] = useState<GyroReviewerNotes>(emptyNotes);
  const [notesOpen, setNotesOpen] = useState(false);
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

  const context = useMemo(
    () => buildContextFromPaste(taskPaste, transcript, rubricVersion),
    [taskPaste, transcript, rubricVersion],
  );

  const tagPath = [context.p1, context.p2, context.p3].filter(Boolean).join(" | ");

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

  function loadDemo() {
    setTaskPaste(DEMO_TASK_PASTE);
    setTranscript(DEMO_TRANSCRIPT);
    setNotes(emptyNotes());
    setResult(null);
    setError(null);
    setPendingUpdate(null);
  }

  function toggleIssue(key: GyroIssueKey) {
    setNotes((n) => ({
      ...n,
      issues: n.issues.includes(key)
        ? n.issues.filter((k) => k !== key)
        : [...n.issues, key],
    }));
  }

  async function onGenerate() {
    if (!taskPaste.trim() || !transcript.trim()) {
      setError("Isi Task Variables paste dan Transcript dulu.");
      return;
    }
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/gyro/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, notes }),
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
    setChatMessages((prev) => [...prev, { role: "user", content: message }]);
    try {
      const res = await fetch("/api/gyro/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: chatMessages,
          context,
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
    const { answers, summary } = pendingUpdate;
    const json: Record<string, unknown> = {
      rubricVersion,
      tagPath,
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
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-cyan-400/90">
              Gyro Accordion · Deep Research
            </p>
            <h1 className="text-xl font-semibold text-white sm:text-2xl">
              Task Gyro Accordion
            </h1>
            <p className="mt-0.5 max-w-xl text-sm text-zinc-400">
              Paste Task Variables + transcript → Generate. Observasi manual
              opsional.
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Skills {memoryInfo.foundation} · Memory {memoryInfo.skills}
              {tagPath ? ` · ${tagPath}` : ""}
              {context.multimodal !== "unknown"
                ? ` · Multimodal ${context.multimodal}`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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

      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-100">Input task</h2>
            <div>
              <label className={labelClass()}>Rubric</label>
              <select
                className={fieldClass()}
                value={rubricVersion}
                onChange={(e) =>
                  setRubricVersion(e.target.value as RubricVersion)
                }
              >
                <option value="v1">V1 — Q1–Q22</option>
                <option value="v2">V2 — Product quality</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className={labelClass()}>
                Task Variables (paste dari Outlier)
              </label>
              <textarea
                className={`${fieldClass()} min-h-[220px] font-mono text-[13px]`}
                value={taskPaste}
                onChange={(e) => setTaskPaste(e.target.value)}
                placeholder="Paste seluruh blok Task Variables di sini (multimodal, scene, prompt, goal, P1/P2/P3, instructions)…"
              />
              <p className="mt-1 text-[11px] text-zinc-500">
                AI membaca blok ini utuh. Tag P1/P2/P3 terdeteksi otomatis jika
                ada di teks.
              </p>
            </div>
            <div>
              <label className={labelClass()}>Transcript video</label>
              <textarea
                className={`${fieldClass()} min-h-[180px] font-mono text-[13px]`}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Paste transcript sesi Gemini Live…"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <button
            type="button"
            onClick={() => setNotesOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Catatan reviewer (opsional)
              </h2>
              <p className="text-[11px] text-zinc-500">
                Untuk hal yang hanya Anda lihat di recording — sisanya AI dari
                paste + transcript.
              </p>
            </div>
            <span className="text-xs text-zinc-500">
              {notesOpen ? "Sembunyikan" : "Tampilkan"}
            </span>
          </button>

          {notesOpen && (
            <div className="mt-3 space-y-3 border-t border-zinc-800 pt-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["deepResearchTriggered", "DR triggered?"],
                    ["recordingComplete", "Recording complete?"],
                    ["commentsMatchRecording", "Comments match recording?"],
                    ["captionsVisible", "Captions on?"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className={labelClass()}>{label}</label>
                    <select
                      className={fieldClass()}
                      value={notes[key]}
                      onChange={(e) =>
                        setNotes((n) => ({
                          ...n,
                          [key]: e.target.value as TriState,
                        }))
                      }
                    >
                      <option value="unknown">Unknown</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                ))}
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
                        className={`rounded-full border px-2.5 py-1 text-xs ${
                          on
                            ? "border-cyan-500/70 bg-cyan-500/15 text-cyan-200"
                            : "border-zinc-700 text-zinc-400"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className={labelClass()}>Komentar manual</label>
                <textarea
                  className={`${fieldClass()} min-h-[80px]`}
                  value={notes.comments}
                  onChange={(e) =>
                    setNotes((n) => ({ ...n, comments: e.target.value }))
                  }
                />
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-100">Output</h2>
            <div className="flex gap-2">
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
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm text-zinc-200 disabled:opacity-40"
              >
                {copied ? "Copied" : "Copy"}
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
                className={`flex-1 rounded-md px-3 py-1.5 text-sm ${
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

          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-[13px] text-zinc-200">
            {outputText ||
              "Paste Task Variables + transcript, lalu Generate."}
          </pre>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Chat dengan AI
              </h2>
              <p className="text-[11px] text-zinc-500">
                Koreksi jawaban live — lalu Terapkan ke Answers bila setuju.
              </p>
            </div>
            {pendingUpdate && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={applyPendingUpdate}
                  className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-zinc-950"
                >
                  Terapkan ke Answers
                </button>
                <button
                  type="button"
                  onClick={() => setPendingUpdate(null)}
                  className="rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-300"
                >
                  Buang
                </button>
              </div>
            )}
          </div>

          {pendingUpdate && (
            <p className="mb-3 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
              AI mengusulkan update {pendingUpdate.answers.length} jawaban.
            </p>
          )}

          <div className="mb-3 max-h-[240px] space-y-2 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3">
            {chatMessages.length === 0 && (
              <p className="text-sm text-zinc-500">
                Contoh: &quot;Q11 No karena DR tidak triggered&quot;
              </p>
            )}
            {chatMessages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={`rounded-lg px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "ml-6 bg-zinc-800"
                    : "mr-6 border border-zinc-800 bg-zinc-900"
                }`}
              >
                <p className="mb-0.5 text-[10px] uppercase text-zinc-500">
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
            <p className="mb-3 text-sm text-rose-300">{chatError}</p>
          )}

          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void onSendChat();
            }}
          >
            <textarea
              className={`${fieldClass()} min-h-[64px] flex-1`}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Tanya / koreksi AI tentang task ini…"
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
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40 sm:self-end"
            >
              Kirim
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
