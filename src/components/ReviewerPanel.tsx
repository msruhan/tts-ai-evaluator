"use client";

import { useState } from "react";
import type { EvaluationRecord, ReviewVerdict } from "@/lib/types";

const VERDICTS: { value: ReviewVerdict; label: string; hint: string }[] = [
  {
    value: "agree",
    label: "Setuju",
    hint: "Penilaian AI sudah tepat",
  },
  {
    value: "partial",
    label: "Sebagian",
    hint: "Ada yang benar, ada yang perlu diperbaiki",
  },
  {
    value: "disagree",
    label: "Tidak setuju",
    hint: "Penilaian AI perlu dikoreksi",
  },
];

function verdictClass(verdict: ReviewVerdict) {
  if (verdict === "agree") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (verdict === "partial") return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-rose-50 text-rose-800 border-rose-200";
}

export default function ReviewerPanel({
  record,
  onUpdated,
}: {
  record: EvaluationRecord;
  onUpdated: (next: EvaluationRecord) => void;
}) {
  const [verdict, setVerdict] = useState<ReviewVerdict>("partial");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/history/${record.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan review.");
      onUpdated(data.record as EvaluationRecord);
      setComment("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Reviewer Comment</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Komentar reviewer disimpan sebagai skill/memory dan dipakai untuk
          memperbaiki kualitas penilaian berikutnya.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          {VERDICTS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setVerdict(item.value)}
              className={`rounded-xl border px-3 py-2 text-left transition ${
                verdict === item.value
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
              }`}
            >
              <span className="block text-xs font-semibold">{item.label}</span>
              <span
                className={`mt-0.5 block text-[11px] leading-snug ${
                  verdict === item.value ? "text-slate-300" : "text-slate-500"
                }`}
              >
                {item.hint}
              </span>
            </button>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="Contoh: Preferensi naturalness terlalu fokus noise; utamakan intonasi & persona likeness bila kualitas rekaman mirip."
          className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none ring-teal-600/30 focus:bg-white focus:ring-2"
          required
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading || !comment.trim()}
            className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? "Menyimpan..." : "Simpan ke memory"}
          </button>
          {saved && (
            <span className="text-xs text-emerald-700">
              Tersimpan — akan dipakai di evaluasi berikutnya.
            </span>
          )}
        </div>
      </form>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      {record.reviews?.length > 0 && (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Riwayat review ({record.reviews.length})
          </h3>
          {record.reviews
            .slice()
            .reverse()
            .map((review) => (
              <article
                key={review.id}
                className={`rounded-xl border px-3 py-2 ${verdictClass(review.verdict)}`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold uppercase tracking-wide">
                    {review.verdict}
                  </span>
                  <time>
                    {new Date(review.createdAt).toLocaleString("id-ID")}
                  </time>
                </div>
                <p className="mt-1 text-sm leading-relaxed">{review.comment}</p>
              </article>
            ))}
        </div>
      )}
    </section>
  );
}
