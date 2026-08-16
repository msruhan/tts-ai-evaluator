import type { EvalLanguage, EvaluationResult } from "@/lib/types";
import { DIMENSIONS, RATING_LABELS, RATIONALE_LOCAL_LABEL } from "@/lib/types";

function choiceClass(value: string) {
  if (value === "A_BETTER") return "bg-sky-100 text-sky-800 border-sky-300";
  if (value === "B_BETTER")
    return "bg-orange-100 text-orange-800 border-orange-300";
  if (value === "BOTH_GOOD")
    return "bg-emerald-100 text-emerald-800 border-emerald-300";
  return "bg-rose-100 text-rose-800 border-rose-300";
}

function BilingualBlock({
  title,
  titleClass,
  en,
  local,
  localLabel,
}: {
  title: string;
  titleClass: string;
  en: string;
  local?: string;
  localLabel: string;
}) {
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide ${titleClass}`}>
        {title}
      </p>
      <div className="mt-2 space-y-2">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            English
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{en}</p>
        </div>
        {local ? (
          <div className="rounded-xl bg-teal-50/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-700/70">
              {localLabel}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{local}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ResultPanel({
  result,
  model,
}: {
  result: EvaluationResult;
  model?: string | null;
  language?: EvalLanguage | string;
}) {
  const localLabel = RATIONALE_LOCAL_LABEL;

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-900">Ratings</h2>
        {model && <span className="text-xs text-slate-500">Model: {model}</span>}
      </div>

      {DIMENSIONS.map((dim) => {
        if (dim.kind === "text") return null;
        const value = String(result[dim.key]);
        return (
          <article
            key={dim.key}
            className="rounded-2xl border border-slate-200 bg-white p-4"
          >
            <h3 className="text-sm font-semibold text-slate-900">{dim.title}</h3>
            <p className="mt-1 text-xs text-slate-500">{dim.description}</p>
            <div className="mt-3">
              <span
                className={`inline-flex rounded-lg border px-3 py-1.5 text-xs font-medium ${choiceClass(value)}`}
              >
                {RATING_LABELS[value] || value}
              </span>
            </div>
          </article>
        );
      })}

      <article className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Rationales</h3>
        <p className="mt-1 text-xs text-slate-500">
          Penjelasan independen per audio (EN + {localLabel}). Idealnya menyebut
          bukti konkret: waktu dan kata/frasa spesifik.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <BilingualBlock
            title="Rationale for A"
            titleClass="text-sky-700"
            en={result.rationale_a}
            local={result.rationale_a_id}
            localLabel={localLabel}
          />
          <BilingualBlock
            title="Rationale for B"
            titleClass="text-orange-700"
            en={result.rationale_b}
            local={result.rationale_b_id}
            localLabel={localLabel}
          />
        </div>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Justification</h3>
        <p className="mt-1 text-xs text-slate-500">
          Alasan preferensi naturalness — English & {localLabel}.
        </p>
        <div className="mt-3">
          <BilingualBlock
            title="Overall preference"
            titleClass="text-slate-600"
            en={result.justification}
            local={result.justification_id}
            localLabel={localLabel}
          />
        </div>
      </article>
    </section>
  );
}
