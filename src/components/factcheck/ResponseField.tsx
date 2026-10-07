"use client";

import { useMemo, useState } from "react";
import { parseResponseBlocks } from "@/lib/factcheck/response-format";
import { FACT_CHECK_API } from "./routes";

type View = "edit" | "preview";

const BULLET_RE = /^\s*(?:[•●▪◦*-]|\d+[.)])\s+/;

function highlightTokens(targetSentence: string): string[] {
  return [...new Set(targetSentence.match(/\d+(?:[.,:–-]\d+)*%?/g) || [])];
}

function Cell({ text, tokens, header }: { text: string; tokens: string[]; header: boolean }) {
  const hit = tokens.some((t) => text === t || text.replace(/\s+/g, "") === t);
  const Tag = header ? "th" : "td";
  return (
    <Tag
      className={`border border-slate-200 px-2 py-1 text-left ${header ? "bg-slate-100 font-semibold text-slate-800" : "text-slate-700"} ${hit ? "bg-amber-100 font-semibold text-amber-900" : ""}`}
    >
      {text}
    </Tag>
  );
}

export default function ResponseField({
  value,
  onChange,
  targetSentence,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  targetSentence: string;
  className: string;
}) {
  const [userView, setUserView] = useState<View | null>(null);
  const [processing, setProcessing] = useState(false);
  const [note, setNote] = useState("");
  const [undoText, setUndoText] = useState<string | null>(null);

  const blocks = useMemo(() => parseResponseBlocks(value), [value]);
  const tableCount = blocks.filter((b) => b.type === "table").length;
  const tokens = useMemo(() => highlightTokens(targetSentence), [targetSentence]);
  const view: View = userView ?? (tableCount > 0 ? "preview" : "edit");

  async function handleProcess() {
    if (!value.trim()) return;
    setProcessing(true);
    setNote("");
    try {
      const res = await fetch(`${FACT_CHECK_API}/format-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengolah response.");
      setUndoText(value);
      onChange(data.text);
      setUserView("preview");
      setNote("Response sudah diolah. Periksa pratinjau; klik Batalkan bila ada isi yang berubah.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessing(false);
    }
  }

  const tabCls = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs ${active ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`;

  return (
    <div className="text-sm">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-slate-700">
          Full Response
          {tableCount > 0 && (
            <span className="ml-2 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-800">
              {tableCount} tabel terdeteksi
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            <button type="button" className={tabCls(view === "edit")} onClick={() => setUserView("edit")}>
              Teks
            </button>
            <button type="button" className={tabCls(view === "preview")} onClick={() => setUserView("preview")}>
              Pratinjau
            </button>
          </div>
          <button
            type="button"
            onClick={handleProcess}
            disabled={processing || !value.trim()}
            className="rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800 hover:bg-teal-100 disabled:opacity-50"
          >
            {processing ? "Mengolah…" : "Olah dengan AI"}
          </button>
        </div>
      </div>

      {view === "edit" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={() => setUserView(null)}
          rows={8}
          placeholder="Tempel full response di sini — tabel akan otomatis ditampilkan di Pratinjau."
          className={`${className} text-xs`}
        />
      ) : (
        <div className="max-h-[28rem] space-y-3 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed">
          {!value.trim() && <p className="text-slate-400">Belum ada isi.</p>}
          {blocks.map((block, i) =>
            block.type === "table" ? (
              <div key={i} className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {block.rows[0].map((c, j) => (
                        <Cell key={j} text={c} tokens={tokens} header />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.slice(1).map((row, r) => (
                      <tr key={r}>
                        {row.map((c, j) => (
                          <Cell key={j} text={c} tokens={tokens} header={false} />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div key={i} className="space-y-1">
                {block.lines.map((line, j) =>
                  !line.trim() ? (
                    <div key={j} className="h-1" />
                  ) : BULLET_RE.test(line) ? (
                    <p key={j} className="pl-4 text-slate-700 before:-ml-3 before:mr-1.5 before:content-['•']">
                      {line.replace(BULLET_RE, "")}
                    </p>
                  ) : (
                    <p key={j} className="text-slate-700">
                      {line}
                    </p>
                  ),
                )}
              </div>
            ),
          )}
        </div>
      )}

      {(note || undoText !== null) && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {note && <span>{note}</span>}
          {undoText !== null && (
            <button
              type="button"
              onClick={() => {
                onChange(undoText);
                setUndoText(null);
                setNote("");
              }}
              className="font-medium text-teal-700 hover:underline"
            >
              Batalkan
            </button>
          )}
        </div>
      )}
      {view === "preview" && tokens.length > 0 && tableCount > 0 && (
        <p className="mt-1 text-[11px] text-slate-500">
          Sel kuning = angka yang juga ada di Target Sentence ({tokens.join(", ")}).
        </p>
      )}
    </div>
  );
}
