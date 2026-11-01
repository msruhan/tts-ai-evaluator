"use client";

import { useMemo, useState } from "react";
import dataJson from "@/data/live-eval-handbook-id.json";
import type {
  HandbookCard,
  HandbookData,
  HandbookDefGroup,
  HandbookFu,
  HandbookLevel,
  HandbookNote,
} from "./types";
import "./handbook.css";

const DATA = dataJson as HandbookData;

const CAT_ORDER = [
  "Dasar",
  "Antarmuka",
  "Pemahaman",
  "Suara",
  "Percakapan",
  "Konten",
  "Visual",
  "Aksi",
  "Penutup",
] as const;

const CAT_FILTER = [
  "Semua",
  "Antarmuka",
  "Pemahaman",
  "Suara",
  "Percakapan",
  "Konten",
  "Visual",
  "Aksi",
  "Penutup",
  "Definisi",
] as const;

function RichText({ html }: { html: string }) {
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function NoteBlock({ note }: { note?: HandbookNote | string | null }) {
  if (!note) return null;
  if (typeof note === "string") {
    return (
      <div className="hbNote">
        <RichText html={note} />
      </div>
    );
  }
  return (
    <div className="hbNote">
      <strong>{note.t || "Catatan"}</strong>
      <RichText html={note.b || ""} />
    </div>
  );
}

function OptList({ fu }: { fu: HandbookFu }) {
  const opts = fu.opts || [];
  if (!opts.length && !fu.open) return null;
  const wide = opts.some((o) => (typeof o === "string" ? o : JSON.stringify(o)).length > 90);
  return (
    <>
      {opts.length > 0 && (
        <ul className={wide ? "hbOpts hbOptsWide" : "hbOpts"}>
          {opts.map((o, i) => {
            if (typeof o === "string") {
              return (
                <li key={i}>
                  <RichText html={o} />
                </li>
              );
            }
            const t = o.t || o.label || o.n || "";
            const d = o.d || o.desc || o.s || "";
            return (
              <li key={i}>
                <strong>{t}</strong>
                {d ? <s>{d}</s> : null}
              </li>
            );
          })}
        </ul>
      )}
      {fu.open ? <div className="hbOpen">Kolom teks bebas</div> : null}
    </>
  );
}

function FollowUp({ fu }: { fu?: HandbookFu }) {
  if (!fu) return null;
  return (
    <details className="hbFu">
      <summary>{fu.label || "Follow-up"}</summary>
      {fu.q ? <div className="hbFuq">{fu.q}</div> : null}
      <OptList fu={fu} />
    </details>
  );
}

function Ladder({ levels, id }: { levels?: HandbookLevel[]; id: string }) {
  const [selected, setSelected] = useState(0);
  const [compareAll, setCompareAll] = useState(false);
  if (!levels?.length) return null;

  return (
    <div className="hbLadder" data-ladder={id}>
      <div className="hbLadhead">
        <span>Skala penilaian — ketuk level untuk teks lengkap</span>
        <button type="button" onClick={() => setCompareAll(true)}>
          Bandingkan semua
        </button>
      </div>
      <div className="hbSteps">
        {levels.map((l, i) => (
          <button
            key={`${id}-${i}`}
            type="button"
            className="hbStep"
            data-tone={l.tone || "mid"}
            aria-selected={!compareAll && selected === i}
            onClick={() => {
              setCompareAll(false);
              setSelected(i);
            }}
          >
            <b>{l.n}</b>
            <em>{l.s || ""}</em>
          </button>
        ))}
      </div>
      {compareAll
        ? levels.map((l, i) => (
            <div
              key={`${id}-p-${i}`}
              className="hbPanel hbStack"
              data-tone={l.tone || "mid"}
            >
              <span className="hbPanelLab">{l.n}</span>
              <div>{l.t || ""}</div>
            </div>
          ))
        : (
          <div className="hbPanel" data-tone={levels[selected]?.tone || "mid"}>
            <span className="hbPanelLab">{levels[selected]?.n}</span>
            <div>{levels[selected]?.t || ""}</div>
          </div>
        )}
    </div>
  );
}

function CardView({ item }: { item: HandbookCard }) {
  const ask = item.ask || item.lead || "";
  const askClass = item.lead && !item.ask ? "hbAsk hbLead" : "hbAsk";

  return (
    <article className="hbCard" id={item.id} data-cat={item.cat}>
      <div className="hbTop">
        <span className="hbNum">{item.num}</span>
        <h3>{item.title}</h3>
        <span className="hbCat">{item.cat}</span>
      </div>
      {ask ? <p className={askClass}>{ask}</p> : null}
      {item.rule ? (
        <div className="hbRule">
          <RichText html={item.rule} />
        </div>
      ) : null}
      <NoteBlock note={item.note} />
      {item.split ? (
        <>
          <p className="hbSplitIntro">
            <strong>{item.split.title}</strong>
            <br />
            {item.split.intro}
          </p>
          <div className="hbSplit">
            <div className="hbOk">
              <h4>{item.split.a?.h}</h4>
              <ul>
                {(item.split.a?.items || []).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div className="hbNo">
              <h4>{item.split.b?.h}</h4>
              <ul>
                {(item.split.b?.items || []).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
        </>
      ) : null}
      <Ladder levels={item.levels} id={item.id} />
      {item.sxs ? (
        <div className="hbSxs">
          <div className="hbSxsEnds">
            <span>◀ Interaksi A</span>
            <span>Interaksi B ▶</span>
          </div>
          <div className="hbSxsBar">
            {(item.levels || []).map((l) => (
              <div key={l.n}>{l.n}</div>
            ))}
          </div>
          <div className="hbSxsNote">
            {item.sxsNA
              ? "Plus N/A — tidak ada interupsi"
              : "Perbandingan 7 poin · tanpa opsi N/A"}
          </div>
        </div>
      ) : null}
      <FollowUp fu={item.fu} />
      <FollowUp fu={item.fu2} />
    </article>
  );
}

function DefGroup({ group, idx }: { group: HandbookDefGroup; idx: number }) {
  return (
    <section className="hbCard hbDgroup" id={`def${idx}`} data-cat="Definisi">
      <h3>{group.g}</h3>
      {group.for ? <p className="hbFor">{group.for}</p> : null}
      {(group.items || []).map((it) => (
        <div className="hbDef" id={it._id} key={it._id || it.t}>
          <dl>
            <dt>{it.t}</dt>
            <dd>
              {it.d}
              {it.e ? <div className="hbEx">{it.e}</div> : null}
            </dd>
          </dl>
        </div>
      ))}
    </section>
  );
}

function matchesQuery(text: string, q: string) {
  return !q || text.toLowerCase().includes(q);
}

function cardSearchText(item: HandbookCard) {
  return [
    item.title,
    item.ask,
    item.lead,
    item.cat,
    item.rule,
    typeof item.note === "string" ? item.note : `${item.note?.t || ""} ${item.note?.b || ""}`,
    ...(item.levels || []).flatMap((l) => [l.n, l.s, l.t]),
    item.fu?.label,
    item.fu?.q,
    ...(item.fu?.opts || []).map((o) => (typeof o === "string" ? o : `${o.t || ""} ${o.d || ""}`)),
    item.fu2?.label,
    item.fu2?.q,
  ]
    .filter(Boolean)
    .join(" ");
}

export default function HandbookApp() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<(typeof CAT_FILTER)[number]>("Semua");
  const [navOpen, setNavOpen] = useState(false);
  const q = query.trim().toLowerCase();

  const byCat = useMemo(() => {
    const map: Record<string, HandbookCard[]> = {};
    for (const item of DATA.QS) {
      const c = item.cat || "Lainnya";
      (map[c] ||= []).push(item);
    }
    return map;
  }, []);

  const visiblePrimer = DATA.PRIMER.filter(
    (p) => cat === "Semua" && matchesQuery(cardSearchText(p), q),
  );

  const visibleByCat = useMemo(() => {
    const out: Record<string, HandbookCard[]> = {};
    for (const section of CAT_ORDER) {
      if (cat !== "Semua" && cat !== section) continue;
      out[section] = (byCat[section] || []).filter((item) =>
        matchesQuery(cardSearchText(item), q),
      );
    }
    return out;
  }, [byCat, cat, q]);

  const visibleDefs = DATA.DEFS.map((g, idx) => ({
    group: g,
    idx,
    show:
      (cat === "Semua" || cat === "Definisi") &&
      matchesQuery(
        [g.g, g.for, ...(g.items || []).flatMap((it) => [it.t, it.d, it.e])].join(
          " ",
        ),
        q,
      ),
  }));

  const shown =
    visiblePrimer.length +
    Object.values(visibleByCat).reduce((n, items) => n + items.length, 0) +
    visibleDefs.filter((d) => d.show).length;

  return (
    <div className="hb">
      <header className="hbHeader">
        <div className="hbHwrap">
          <div className="hbMark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="hbTitles">
            <h1>Buku Panduan Rater</h1>
            <div className="hbSub">
              Live E2E Eval Template v3.6 · versi Indonesia · referensi, bukan form
            </div>
            <p className="hbSrc">
              Sumber:{" "}
              <a
                href="https://static.remotasks.com/uploads/6a737a64d4a3bae6cd5bd3f8/live-eval-rater-handbook.html"
                target="_blank"
                rel="noopener noreferrer"
              >
                handbook asli (EN)
              </a>
              . Bahasa disederhanakan agar mudah dipahami saat menilai.
            </p>
          </div>
        </div>
      </header>

      <div className="hbToolbar">
        <div className="hbTwrap">
          <button
            type="button"
            className="hbChip hbNavToggle"
            onClick={() => setNavOpen((v) => !v)}
          >
            Daftar isi
          </button>
          <div className="hbSearch">
            <input
              type="search"
              placeholder="Cari pertanyaan, opsi, atau definisi…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="hbHits">
            {q || cat !== "Semua" ? `${shown} hasil` : null}
          </div>
          <div className="hbChips">
            {CAT_FILTER.map((c) => (
              <button
                key={c}
                type="button"
                className="hbChip"
                aria-pressed={cat === c}
                onClick={() => setCat(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hbShell">
        <nav className={navOpen ? "hbNav hbNavOpen" : "hbNav"}>
          <h2>Daftar isi</h2>
          <ul>
            {DATA.PRIMER.map((p) => (
              <li key={p.id}>
                <a href={`#${p.id}`}>
                  <i>{p.num}</i>
                  {p.title}
                </a>
              </li>
            ))}
          </ul>
          {CAT_ORDER.filter((c) => byCat[c]).map((c) => (
            <div key={c}>
              <h2>{c}</h2>
              <ul>
                {byCat[c].map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`}>
                      <i>{item.num}</i>
                      {item.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <h2>Definisi</h2>
          <ul>
            {DATA.DEFS.map((d, i) => (
              <li key={d.g}>
                <a href={`#def${i}`}>
                  <i>{`D${i + 1}`}</i>
                  {d.g}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="hbMain">
          {(cat === "Semua") && (
            <>
              <div className="hbSection">
                <h2>Dasar</h2>
                <p>Baca dulu sebelum menilai</p>
              </div>
              {visiblePrimer.map((p) => (
                <CardView key={p.id} item={p} />
              ))}
            </>
          )}

          {CAT_ORDER.map((section) => {
            const items = visibleByCat[section] || [];
            if (!items.length) return null;
            return (
              <div key={section}>
                <div className="hbSection">
                  <h2>{section}</h2>
                </div>
                {items.map((item) => (
                  <CardView key={item.id} item={item} />
                ))}
              </div>
            );
          })}

          {(cat === "Semua" || cat === "Definisi") &&
            visibleDefs.some((d) => d.show) && (
              <>
                <div className="hbSection">
                  <h2>Definisi</h2>
                  <p>Kategori detail untuk follow-up</p>
                </div>
                {visibleDefs
                  .filter((d) => d.show)
                  .map(({ group, idx }) => (
                    <DefGroup key={group.g} group={group} idx={idx} />
                  ))}
              </>
            )}

          {shown === 0 ? (
            <div className="hbEmpty">
              <b>Tidak ada hasil</b>
              <span>Coba kata yang lebih pendek, atau hapus filter area.</span>
            </div>
          ) : null}
        </main>
      </div>

      <footer className="hbFooter">
        Versi Indonesia · Live E2E Eval Template v3.6 · untuk keperluan rater /
        pelatihan internal
      </footer>
    </div>
  );
}
