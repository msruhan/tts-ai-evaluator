"use client";

import { downloadHistory, type HistoryEntry } from "./history";
import { LabelBadge } from "./parts";

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function HistoryPanel({
  entries,
  activeId,
  onLoad,
  onDelete,
  onClear,
}: {
  entries: HistoryEntry[];
  activeId: string | null;
  onLoad: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">
          Riwayat <span className="font-normal text-slate-500">({entries.length})</span>
        </span>
        <span className="text-xs text-slate-400 group-open:hidden">tampilkan</span>
        <span className="hidden text-xs text-slate-400 group-open:inline">sembunyikan</span>
      </summary>

      <p className="mt-2 text-xs text-slate-500">
        Disimpan di browser ini saja (maks. 50 cek terakhir). Ekspor bila ingin backup.
      </p>

      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Belum ada riwayat.</p>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => downloadHistory(entries)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              Ekspor JSON
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Hapus semua riwayat di browser ini?")) onClear();
              }}
              className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-50"
            >
              Hapus semua
            </button>
          </div>
          <ul className="mt-3 max-h-80 space-y-2 overflow-auto pr-1">
            {entries.map((e) => (
              <li
                key={e.id}
                className={`rounded-lg border p-2.5 ${e.id === activeId ? "border-teal-300 bg-teal-50/50" : "border-slate-200"}`}
              >
                <button type="button" onClick={() => onLoad(e)} className="block w-full text-left">
                  <p className="line-clamp-2 text-sm text-slate-800">{e.input.targetSentence}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <span>Query {e.input.queryDate}</span>
                    <span>·</span>
                    <span>{formatTime(e.updatedAt)}</span>
                    {e.aiResult && (
                      <>
                        <span>· AI</span>
                        <LabelBadge label={e.aiResult.label} size="sm" />
                      </>
                    )}
                    {e.finalReview && (
                      <>
                        <span>· Final</span>
                        <LabelBadge label={e.finalReview.label} size="sm" />
                      </>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(e.id)}
                  className="mt-1 text-[11px] text-rose-600 hover:underline"
                >
                  Hapus
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
