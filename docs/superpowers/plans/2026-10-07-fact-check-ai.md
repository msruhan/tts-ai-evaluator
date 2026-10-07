# Fact Check AI — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-10-07-fact-check-ai-design.md`  
**Date:** 2026-10-07  
**Runtime:** lokal (`npm run dev`), LLM = Codex CLI, search = Tavily

Setiap task diakhiri: `npx tsc --noEmit` bersih, `npm run lint` bersih untuk file baru, test terkait hijau, lalu commit kecil.

---

## Task 0 — Fondasi

- `src/lib/factcheck/types.ts`:
  - `FactLabel = "Accurate" | "Inaccurate" | "Disputed" | "Unsupported" | "No Claims present"`
  - `FactCheckInput { userQuery; fullResponse; targetSentence; queryDate /* YYYY-MM-DD */ }`
  - `EntityHints { sport?; league?; teams: string[]; players: string[]; eventDate? }`
  - `Claim { id; text; keyValues: string[]; isSubjective; searchQueries: string[] }`
  - `ClaimExtraction { noClaims; noClaimsReason?; claims: Claim[]; entityHints: EntityHints }`
  - `DateStatus = "before_query_date" | "after_query_date" | "unknown_date"`
  - `SourceCandidate { url; title; origin: "sports_api" | "tavily" | "manual"; publishedDate?; dateStatus; claimIds: string[]; snippet?; apiExcerpt? }`
  - `LinkCheck { url; status: "ok" | "http_error" | "timeout" | "empty" | "blocked"; httpStatus?; keyMatch: "match" | "partial" | "no_match"; matchedValues: string[]; excerpt; detail }`
  - `VerifiedSource = SourceCandidate & { check: LinkCheck }`
  - `ClaimVerdict { claimId; verdict: FactLabel; supportingUrls: string[]; contradictingUrls: string[]; note }`
  - `Narrative { en; id }`
  - `AiResearchResult { input; extraction; verdicts; label; narrative; sources: VerifiedSource[]; rejected: LinkCheck[] }`
  - `ManualResearch { label?: FactLabel; notes; urls: string[] }`
  - `ClaimComparison { claimId; aiVerdict; manualVerdict?; agreement: "agree" | "disagree" | "ai_only" | "manual_only"; analysis }`
  - `FinalReview { label; confidence: "tinggi" | "sedang" | "rendah"; narrative: Narrative; sources: VerifiedSource[]; comparisons: ClaimComparison[]; notesForUser }`
  - `ProgressEvent` union: `stage` | `link` | `result` | `error` (spec §11).
- `package.json`: script `"test:factcheck": "node --experimental-strip-types --test src/lib/factcheck/__tests__/*.test.ts"`.
- `.env.example`: tambah blok `TAVILY_API_KEY=`, `CODEX_BIN=`, `CODEX_MODEL=`, `CODEX_REASONING_EFFORT=low` dengan komentar "Fact Check — lokal saja".
- Aturan: modul yang di-unit-test (`parse-task`, `dates`, `trim`, `link-text`, `sources-block`) hanya `import type` dari modul lain.

## Task 1 — Codex wrapper (`codex.ts`)

- `resolveCodexBin()`: `CODEX_BIN` → `codex` di PATH (`which`) → `/Applications/ChatGPT.app/Contents/Resources/codex`; error jelas bila tidak ada.
- `assertLocalRuntime()`: bila `process.env.VERCEL` → throw "Fact Check hanya jalan lokal".
- `runCodexJson<T>(prompt: string, schema: object, opts?: { timeoutMs?: number; label?: string }): Promise<T>`:
  - `mkdtemp` → tulis `schema.json`; spawn args spec §4.5; tulis prompt ke stdin; tunggu exit; baca `out.json`; `JSON.parse`.
  - Timeout default 120 dtk → `kill("SIGKILL")`.
  - Retry 1x bila exit ≠ 0 / file kosong / JSON rusak; error akhir menyertakan 500 char terakhir stderr.
  - Selalu hapus tmpdir (`finally`).
  - Prompt prefix tetap: "Do not run any commands or tools. Answer only with JSON matching the schema."
  - Schema: semua object `additionalProperties: false` + semua properti `required` (syarat strict schema).
- Script `scripts/factcheck-codex-smoke.mjs` tidak dibuat; verifikasi lewat Task 8 route.
- Verifikasi: panggilan sederhana dari `node` REPL (atau route sementara) → JSON valid.

## Task 2 — Parse task (`parse-task.ts` + route)

- `parseTaskText(raw: string): Partial<FactCheckInput> & { missing: (keyof FactCheckInput)[] }`
  - Heading case-insensitive, toleran baris deskripsi di bawah heading: `User Query|Query|Prompt`, `Response|Full Response`, `Target Sentence`, `Query Date`.
  - Buang baris deskripsi bawaan form ("the specific claim to be evaluated…", "the full response to the user's query", "The date of the query…").
  - Normalisasi tanggal ke `YYYY-MM-DD` (terima `2026-09-23`, `23/09/2026`, `September 23, 2026`).
- Route `src/app/api/fact-check/parse/route.ts` (`runtime = "nodejs"`): regex dulu; bila ada field `missing` → `runCodexJson` dengan schema 4 field untuk mengisi yang kosong saja.
- Test `__tests__/parse-task.test.ts`: teks gaya screenshot (Target Sentence/Response/Query Date), variasi urutan, tanggal format lain, field hilang.

## Task 3 — Tanggal (`dates.ts`)

- `classifyDate(published: string | undefined, queryDate: string): DateStatus` (tanggal sama = before).
- `isOnOrBefore(eventDate, queryDate)`, `toEspnDate(d) → YYYYMMDD`.
- Test: before / same day / after / undefined / format ISO dengan jam & timezone.

## Task 4 — Tavily (`tavily.ts`)

- `tavilySearch(query, { endDate?, maxResults = 5 })` → `POST https://api.tavily.com/search` header `Authorization: Bearer ${TAVILY_API_KEY}`, body `{ query, search_depth: "advanced", max_results, include_raw_content: false, end_date? }`.
- Map hasil → `SourceCandidate` (origin `tavily`, `publishedDate` dari `published_date`, `snippet` dari `content`, skor disimpan untuk urutan).
- Error HTTP → throw dengan status; key kosong → throw pesan spec §12.

## Task 5 — Sports API (`sports-apis.ts` + `trim.ts`)

- `trim.ts` (pure, di-test):
  - `trimMlbBoxscore(json, { players })` → tim, skor (runs), hits, HR, pitcher/batter yang disebut.
  - `trimEspnScoreboard(json, { teams, eventName })` → event cocok: id, nama, tanggal, status, kompetitor + skor; golf: leaderboard top-10 + pemain yang disebut.
  - `trimEspnSummary(json, { teams, players })` → header skor, `boxscore.teams` statistics, leaders, pemain disebut.
  - `trimNhl…(json, …)` → skor & stat pemain yang disebut.
  - Batas output ±4.000 char per sumber.
- `sports-apis.ts`:
  - `fetchSportsEvidence(hints: EntityHints, queryDate): Promise<SourceCandidate[]>` — dispatch berdasarkan `sport/league`:
    - MLB → schedule by date → gamePk cocok tim → boxscore.
    - ESPN map `{ soccer: { "la liga": "esp.1", "premier league": "eng.1", … }, basketball: { nba }, football: { nfl, "college-football" }, golf: { pga }, hockey: { nhl }, baseball: { mlb } }` → scoreboard by date → summary by event id.
    - NHL → `api-web.nhle.com/v1/score/{date}` → `gamecenter/{id}/boxscore`.
  - Buang event dengan tanggal > Query Date; tidak ketemu → `[]` (tanpa throw).
  - Kandidat: `origin: "sports_api"`, `apiExcerpt` = hasil trim, `dateStatus` dari tanggal event.
- Fixture: `fixtures/factcheck/mlb-boxscore-823576.json`, `fixtures/factcheck/espn-pga-scoreboard-20260830.json` (dari file upload user, isi JSON tanpa header markdown).
- Test `trim.test.ts` memakai kedua fixture.

## Task 6 — Verifikasi link (`verify-links.ts` + `link-text.ts`)

- `link-text.ts` (pure, di-test):
  - `htmlToText(html)` → buang script/style/nav, decode entity, rapikan spasi.
  - `detectBlockedOrError(text, title)` → captcha / "access denied" / "page not found" / "404" / paywall.
  - `matchKeyValues(text, keyValues)` → `{ keyMatch, matchedValues }` (case-insensitive, angka exact token: `1.33` tidak cocok dengan `11.33`).
  - `excerptAround(text, matchedValues, max = 1500)`.
- `verify-links.ts`:
  - `verifyLinksSequential(candidates, keyValuesByClaim, { emit, stopWhen })` — **loop `for…of` dengan `await`**, satu URL per waktu; `AbortController` 10 dtk; UA browser; `redirect: "follow"`.
  - JSON response → valid JSON + non-empty; HTML → teks ≥ 200 char + tidak terdeteksi error.
  - Emit `link` `checking` lalu `ok`/`failed` per URL.
  - `stopWhen`: setiap klaim punya ≥ 2 sumber `ok`.
  - Return `{ verified: VerifiedSource[], rejected: LinkCheck[] }`.
- Test `link-text.test.ts`.

## Task 7 — Claim extraction, judge, narrative

- `narrative.ts`:
  - `NARRATIVE_RULES` (fragment prompt spec §8, termasuk pembuka EN "I fact-checked the claim(s) that …" & ID "Saya telah melakukan pengecekan terhadap klaim …", 80–180 kata, paragraf tanpa bullet, sebut jumlah klaim, sebut Query Date, variasi label).
  - `sources-block.ts` (pure, di-test): `buildSourcesBlock(urls, verifiedUrls)` → hanya URL terverifikasi, dedupe, urutan dipertahankan; `stripUnverifiedUrls(text, verifiedUrls)`; `composeCopyText(narrativeEn, urls)`.
- `extract-claims.ts`: `extractClaims(input): Promise<ClaimExtraction>` via `runCodexJson` (schema ketat; `keyValues` wajib minimal 1 untuk klaim objektif; 1–2 `searchQueries` yang menyertakan konteks tanggal/kompetisi dari Full Response).
- `judge.ts`: `judgeClaims(input, extraction, verified): Promise<{ verdicts; label; narrative }>`
  - Prompt memuat: Query Date, aturan label (spec §2), aturan Query Date (spec §6), kata subjektif, daftar sumber terverifikasi bernomor `[S1] url · origin · dateStatus · keyMatch · excerpt/apiExcerpt`.
  - Output narasi **tanpa** blok Sources (server yang menyusun); `supportingUrls`/`contradictingUrls` difilter ke URL terverifikasi.
  - `noClaims` → label `No Claims present` tanpa sumber.
- Test `sources-block.test.ts`.

## Task 8 — Pipeline + route riset AI

- `gather-evidence.ts`: `gatherEvidence(input, extraction, emit)` → sports API → Tavily (per query: dengan `endDate` + tanpa) → dedupe URL (normalisasi trailing slash/utm) → `classifyDate` → urut (sports_api dulu, lalu skor Tavily; `after_query_date` paling akhir) → potong 8 → `verifyLinksSequential`.
  - Putaran ulang: klaim tanpa sumber `ok` → `runCodexJson` revisi query → 1 putaran Tavily + verifikasi (kandidat baru saja, maks 4).
- `pipeline.ts`: `runAiResearch(input, emit): Promise<AiResearchResult>` — urutan stage spec §5, emit `stage` di setiap langkah.
- `src/app/api/fact-check/route.ts`: `runtime = "nodejs"`, `maxDuration = 300`; validasi input (targetSentence + queryDate format); `ReadableStream` NDJSON; tangkap error → event `error`; `assertLocalRuntime()` di awal.
- `src/lib/factcheck/ndjson.ts`: `createNdjsonStream(run: (emit) => Promise<void>)` dipakai kedua route.

## Task 9 — Perbandingan + final review

- `compare.ts`:
  - `extractUrls(notes)` + gabung `manual.urls`, dedupe.
  - `runComparison(input, ai: AiResearchResult, manual, emit): Promise<FinalReview>`:
    1. Kandidat manual (`origin: "manual"`, `claimIds` semua klaim) → `verifyLinksSequential` (tanpa `stopWhen`); tanggal dari meta `article:published_time` bila ada, kalau tidak `unknown_date`.
    2. `runCodexJson` perbandingan: input = klaim + verdict AI + sumber AI terverifikasi + catatan & label manual + hasil cek URL manual (termasuk yang gagal) → `comparisons`, `label`, `confidence`, `narrative`, `notesForUser`.
    3. Sources gabungan = AI terverifikasi ∪ manual terverifikasi, difilter `stripUnverifiedUrls`.
- `src/app/api/fact-check/compare/route.ts`: sama pola route Task 8; body `{ input, aiResult, manual }`.

## Task 10 — UI

- `src/app/fact-check/page.tsx`: `metadata` + render `<FactCheckApp />` (pola `task-gyro-accordion/page.tsx`).
- `src/components/SiteNav.tsx`: tambah `{ href: "/fact-check", label: "Fact Check" }`.
- `src/components/factcheck/`:
  - `FactCheckApp.tsx` — state input, AI run, manual, compare; layout dua kolom (lg), satu kolom (mobile).
  - `TaskInputPanel.tsx` — tombol "Tempel & pecah otomatis" (textarea → `/api/fact-check/parse`), 4 field, Query Date `type="date"` latar merah muda, tombol **Cek Fakta**.
  - `ManualResearchPanel.tsx` — dropdown label, textarea catatan, textarea URL, tombol **Bandingkan & Buat Final Review** (aktif bila AI selesai & ada catatan/URL).
  - `ProgressLog.tsx` — stage + daftar URL ⏳/✓/✗ dengan detail.
  - `LabelBadge.tsx` — warna per label (spec §10).
  - `NarrativeCard.tsx` — EN + tombol Salin (`composeCopyText`), ID collapsible, daftar Sources.
  - `ClaimBreakdown.tsx` — per klaim: verdict, sumber + tanggal + penanda vs Query Date.
  - `ComparisonView.tsx` — tabel AI vs manual, badge final + keyakinan, NarrativeCard final, catatan untuk user.
  - `useNdjson.ts` — `fetch` + `body.getReader()` + `TextDecoder` → callback per event; abort saat unmount/run ulang.
- Light mode, Tailwind, gaya mengikuti Gyro/Handbook.

## Task 11 — Verifikasi end-to-end (manual, lokal)

1. `TAVILY_API_KEY` diisi di `.env.local`; `npm run dev`.
2. Kasus Rayo Vallecano xG 1.33 (Query Date 2026-09-23): cek progres URL berurutan, Sources hanya ✓, narasi sesuai template.
3. Kasus MLB game 823576: jalur sports API muncul sebagai sumber pertama.
4. Kalimat subjektif: narasi membahas karakterisasi.
5. Riset manual dengan 1 URL valid + 1 URL 404 + 1 URL terbit setelah Query Date: perbandingan menandai keduanya, final Sources tanpa URL bermasalah.
6. `npm run build` tetap sukses (route tidak dieksekusi saat build).
7. `npm run test:factcheck`, `npx tsc --noEmit`, `npm run lint` hijau.
