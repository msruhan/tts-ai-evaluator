"use client";

import { useState } from "react";
import { composeCopyText } from "@/lib/factcheck/sources-block";
import type {
  ClaimExtraction,
  ClaimVerdict,
  Confidence,
  DateStatus,
  FactLabel,
  Narrative,
  VerifiedSource,
} from "@/lib/factcheck/types";

export type LinkRow = { url: string; status: "checking" | "ok" | "failed"; detail: string };
export type StageRow = { stage: string; message: string };

const LABEL_STYLE: Record<FactLabel, string> = {
  Accurate: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Inaccurate: "bg-rose-50 text-rose-800 ring-rose-200",
  Disputed: "bg-amber-50 text-amber-900 ring-amber-200",
  Unsupported: "bg-slate-100 text-slate-700 ring-slate-300",
  "No Claims present": "bg-sky-50 text-sky-800 ring-sky-200",
};

export function LabelBadge({ label, size = "md" }: { label: FactLabel; size?: "sm" | "md" | "lg" }) {
  const sizing =
    size === "lg" ? "px-4 py-1.5 text-lg" : size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ring-1 ${sizing} ${LABEL_STYLE[label] || LABEL_STYLE.Unsupported}`}>
      {label}
    </span>
  );
}

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  tinggi: "bg-emerald-50 text-emerald-800",
  sedang: "bg-amber-50 text-amber-900",
  rendah: "bg-rose-50 text-rose-800",
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${CONFIDENCE_STYLE[confidence]}`}>
      Keyakinan {confidence}
    </span>
  );
}

const DATE_LABEL: Record<DateStatus, { text: string; cls: string }> = {
  before_query_date: { text: "≤ Query Date", cls: "bg-emerald-50 text-emerald-800" },
  after_query_date: { text: "Setelah Query Date", cls: "bg-rose-50 text-rose-800" },
  unknown_date: { text: "Tanggal tidak diketahui", cls: "bg-slate-100 text-slate-600" },
};

export function DateBadge({ status }: { status: DateStatus }) {
  const d = DATE_LABEL[status];
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${d.cls}`}>{d.text}</span>;
}

export function ProgressLog({ stages, links, running }: { stages: StageRow[]; links: LinkRow[]; running: boolean }) {
  if (!stages.length && !links.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
      <ol className="space-y-1">
        {stages.map((s, i) => (
          <li key={i} className="flex gap-2 text-slate-700">
            <span className="text-slate-400">{i + 1}.</span>
            <span>{s.message}</span>
          </li>
        ))}
        {running && <li className="animate-pulse text-teal-700">Sedang berjalan…</li>}
      </ol>
      {links.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-slate-200 pt-2">
          {links.map((l) => (
            <li key={l.url} className="flex items-start gap-2 text-xs">
              <span className="w-4 shrink-0">
                {l.status === "checking" ? "⏳" : l.status === "ok" ? "✓" : "✗"}
              </span>
              <span className="min-w-0 flex-1">
                <a href={l.url} target="_blank" rel="noreferrer" className="break-all text-slate-800 hover:underline">
                  {l.url}
                </a>
                <span className={`ml-2 ${l.status === "failed" ? "text-rose-700" : l.status === "ok" ? "text-emerald-700" : "text-slate-500"}`}>
                  {l.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
    >
      {copied ? "Tersalin ✓" : "Salin"}
    </button>
  );
}

export function NarrativeCard({ title, narrative, sourcesBlock }: { title: string; narrative: Narrative; sourcesBlock: string }) {
  const copyText = composeCopyText(narrative.en, sourcesBlock);
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-900">{title} · English</h4>
          <CopyButton text={copyText} />
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{narrative.en}</p>
        {sourcesBlock ? (
          <pre className="mt-3 whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-2 font-mono text-xs text-slate-700">{sourcesBlock}</pre>
        ) : (
          <p className="mt-3 text-xs text-amber-800">Tidak ada sumber terverifikasi untuk dicantumkan.</p>
        )}
      </div>
      <details className="rounded-xl border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">{title} · Bahasa Indonesia</summary>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{narrative.id}</p>
      </details>
    </div>
  );
}

export function ClaimBreakdown({
  extraction,
  verdicts,
  sources,
}: {
  extraction: ClaimExtraction;
  verdicts: ClaimVerdict[];
  sources: VerifiedSource[];
}) {
  const byUrl = new Map(sources.map((s) => [s.url, s]));
  if (extraction.noClaims) {
    return <p className="text-sm text-slate-600">Tidak ada klaim faktual: {extraction.noClaimsReason}</p>;
  }
  const sourceLine = (url: string, kind: "dukung" | "bantah") => {
    const s = byUrl.get(url);
    return (
      <li key={`${kind}-${url}`} className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className={kind === "dukung" ? "text-emerald-700" : "text-rose-700"}>{kind === "dukung" ? "＋" : "−"}</span>
        <a href={url} target="_blank" rel="noreferrer" className="break-all text-slate-700 hover:underline">
          {s?.title || url}
        </a>
        {s && <DateBadge status={s.dateStatus} />}
        {s?.publishedDate && <span className="text-slate-400">{s.publishedDate.slice(0, 10)}</span>}
      </li>
    );
  };
  return (
    <ul className="space-y-3">
      {extraction.claims.map((c) => {
        const v = verdicts.find((x) => x.claimId === c.id);
        return (
          <li key={c.id} className="rounded-lg border border-slate-200 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">{c.id}</span>
              {v && <LabelBadge label={v.verdict} size="sm" />}
              {c.isSubjective && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-800">subjektif</span>}
            </div>
            <p className="mt-1 text-sm text-slate-800">{c.text}</p>
            {v?.note && <p className="mt-1 text-xs text-slate-500">{v.note}</p>}
            {v && (v.supportingUrls.length > 0 || v.contradictingUrls.length > 0) && (
              <ul className="mt-2 space-y-1">
                {v.supportingUrls.map((u) => sourceLine(u, "dukung"))}
                {v.contradictingUrls.map((u) => sourceLine(u, "bantah"))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
