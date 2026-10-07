# Fact Check AI — Target Sentence Factuality Reviewer

**Date:** 2026-10-07  
**Status:** Draft · menunggu review user  
**Route:** `/fact-check`  
**Goal:** Halaman bantu rater untuk menilai factuality **Target Sentence** (bukan seluruh response) **per Query Date**, dengan 3 lapis pengecekan: riset AI, riset manual, dan perbandingan + double-check keduanya. Output akhir berupa label + narasi paragraf yang konsisten dan siap disalin, lengkap dengan `Sources:` yang semuanya sudah diverifikasi bisa dibuka.

---

## 1. Problem

- Task factuality menuntut: pecah klaim di Target Sentence, cari bukti terpercaya, pastikan bukti valid **per Query Date**, pilih label, tulis reasoning **dengan link**.
- LLM biasa tidak tahu event terbaru (mis. laga 15 Sep 2026) dan cenderung mengarang link.
- Rater butuh reasoning yang konsisten gaya & strukturnya, dan link yang pasti bisa dibuka reviewer berikutnya (tidak 404).
- Rater juga melakukan riset manual; perlu cara sistematis membandingkan dan meng-cross-check dua riset sebelum memutuskan label final.

## 2. Instruksi task (sumber aturan)

- Input per task: **User Query**, **Full Response**, **Target Sentence**, **Query Date**.
- Label: **Accurate** (didukung bukti terpercaya), **Inaccurate** (minimal satu klaim penting dibantah bukti terpercaya), **Disputed** (sumber kredibel berbeda kesimpulan), **Unsupported** (tidak ada bukti terpercaya), **No Claims present** (tidak ada klaim di Target Sentence).
- Evaluasi **per Query Date**, bukan hari ini. Sumber harus mencerminkan kondisi pada/sebelum Query Date. Bukti yang baru tersedia setelah Query Date **tidak** membuat kalimat Inaccurate.
- Kata subjektif ("the greatest", "unmatched", "the only hurdle") dinilai dari apakah sumber terpercaya mendukung/membantah karakterisasi tersebut.
- Reasoning wajib: klaim yang dicek, apa kata bukti (valid per Query Date), kenapa mendukung label, **link sumber**.

## 3. Keputusan desain (hasil brainstorming)

| Topik | Keputusan |
|-------|-----------|
| Sumber bukti | Sports API resmi (MLB, ESPN, NHL) dulu, lalu **Tavily** Search API |
| LLM | Gemini via Sumopod (konfigurasi yang sudah ada) |
| Input | 4 field terpisah + tombol "Tempel & pecah otomatis" |
| Bahasa output | Narasi **English** (untuk form) + **Bahasa Indonesia** (pemahaman) |
| Penyimpanan | **Tidak ada** — hasil hanya tampil di layar |
| Pipeline | Tetap 3 langkah + 1 putaran pencarian ulang untuk klaim tanpa bukti |
| Verifikasi URL | Live, **satu per satu (berurutan)** |
| Riset manual | Field tambahan; AI memverifikasi URL manual, membandingkan, lalu membuat final review |
| Urutan AI vs manual | Bebas; hasil AI selalu terlihat |

## 4. Arsitektur

### 4.1 Halaman

- `src/app/fact-check/page.tsx` → render `src/components/factcheck/FactCheckApp.tsx` (client).
- Tambah link `{ href: "/fact-check", label: "Fact Check" }` di `src/components/SiteNav.tsx`.

### 4.2 API routes (semua `export const maxDuration = 300`)

| Route | Fungsi | Response |
|-------|--------|----------|
| `POST /api/fact-check/parse` | Pecah teks mentah task → 4 field | JSON |
| `POST /api/fact-check` | Riset AI (pipeline penuh) | NDJSON stream (progress + hasil) |
| `POST /api/fact-check/compare` | Verifikasi riset manual + perbandingan + final review | NDJSON stream (progress + hasil) |

### 4.3 Library `src/lib/factcheck/`

| File | Tanggung jawab |
|------|----------------|
| `types.ts` | `FactCheckInput`, `Claim`, `ClaimVerdict`, `Source`, `LinkCheck`, `AiResearchResult`, `ManualResearch`, `ComparisonResult`, `FinalReview`, `ProgressEvent` |
| `llm.ts` | Client OpenAI→Sumopod (pakai `getSumopodModel`, base URL, API key yang sama) + helper JSON-schema call dengan 1x retry bila JSON rusak |
| `parse-task.ts` | Regex berbasis heading ("User Query", "Response", "Target Sentence", "Query Date"); fallback ke LLM bila gagal |
| `extract-claims.ts` | Langkah 1: pecah Target Sentence jadi klaim atomik (dilengkapi konteks dari Full Response/User Query), flag subjektif, flag no-claims, query Tavily per klaim, dan **entity hints** untuk sports API (sport, league, tim, pemain, tanggal event) |
| `sports-apis.ts` | Adapter MLB / ESPN / NHL: susun URL dari entity hints, cari event by tanggal+tim, ambil boxscore/summary, **pangkas JSON** ke bagian relevan |
| `tavily.ts` | `search(query, { endDate?, maxResults })` + normalisasi `published_date` |
| `gather-evidence.ts` | Langkah 2: sports API → Tavily (dengan `end_date` = Query Date, plus 1 pencarian tanpa filter tanggal) → dedupe → klasifikasi tanggal → antrean kandidat URL → putaran ulang untuk klaim tanpa bukti |
| `verify-links.ts` | Kunjungi URL **satu per satu**: status, konten, kecocokan nilai kunci; emit progress per URL |
| `judge.ts` | Langkah 3: verdict per klaim + label + narasi EN/ID dari sumber yang lolos verifikasi saja |
| `compare.ts` | Verifikasi riset manual + perbandingan per klaim + final review |
| `narrative.ts` | Aturan template narasi (prompt fragment) + perakit blok `Sources:` dari URL terverifikasi |
| `pipeline.ts` | Orkestrasi riset AI; menerima callback `emit(ProgressEvent)` |

### 4.4 Konfigurasi

- Env baru: `TAVILY_API_KEY` (lokal `.env.local` + Vercel).
- Env lama dipakai ulang: `SUMOPOD_API_KEY`, `SUMOPOD_MODEL`, `SUMOPOD_BASE_URL`.

## 5. Alur riset AI

1. **Bedah Target Sentence** (`extract-claims`)
   - Output: daftar klaim (teks lengkap + nilai kunci, mis. `"1.33"`, `"Rayo Vallecano"`), `isSubjective`, `noClaims`, query pencarian (1–2 per klaim), entity hints.
   - Jika `noClaims` → langsung ke judge dengan label **No Claims present** (tanpa pencarian).
2. **Sports API** (`sports-apis`)
   - AI tidak pernah menulis URL API. Server menyusun URL dari pola tetap:
     - **MLB:** `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=YYYY-MM-DD` → cari gamePk by tim → `https://statsapi.mlb.com/api/v1/game/{gamePk}/boxscore`
     - **ESPN:** `https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard?dates=YYYYMMDD` → cari event by tim/nama event → `.../summary?event={id}` (soccer, basketball, football, golf, tennis, dll.)
     - **NHL:** `https://api-web.nhle.com/v1/score/YYYY-MM-DD` → `.../gamecenter/{id}/boxscore`; game log pemain `.../player/{id}/game-log/{season}/{gameType}`
   - Event dengan tanggal **setelah Query Date** dibuang.
   - JSON dipangkas (skor, status, statistik tim, baris pemain yang disebut) sebelum masuk ke LLM; URL API yang dipakai menjadi kandidat sumber.
   - Tidak ketemu → lanjut tanpa error.
3. **Tavily** (`tavily`, `gather-evidence`)
   - Per query: 1 pencarian dengan `end_date` = Query Date, 1 tanpa filter tanggal (untuk halaman statistik yang tak bertanggal).
   - Setiap sumber diklasifikasi: `before_query_date` | `after_query_date` | `unknown_date`.
4. **Antrean kandidat URL**
   - Prioritas: sports API resmi → hasil Tavily berdasarkan skor relevansi; maksimal **8** kandidat per task.
5. **Verifikasi live** (`verify-links`) — lihat §7.
6. **Putaran ulang**: klaim yang belum punya sumber lolos → LLM merevisi query → 1 putaran Tavily + verifikasi lagi.
7. **Judge** (`judge`)
   - Input: klaim + konten ringkas dari sumber **yang lolos verifikasi saja** + tanggal sumber + Query Date.
   - Output: verdict per klaim, label final, narasi EN + ID.
   - Server membuang URL di narasi yang tidak ada di daftar terverifikasi; blok `Sources:` dirakit oleh server, bukan oleh LLM.

## 6. Aturan Query Date

- Event sports API setelah Query Date tidak dipakai.
- Sumber `after_query_date` ditandai dan tidak boleh jadi dasar label.
- Sumber `unknown_date` boleh dipakai bila isinya merujuk event yang terjadi sebelum Query Date (mis. halaman statistik laga 15 Sep untuk query 23 Sep).
- Jika bukti hanya ada setelah Query Date → **Unsupported**, bukan Inaccurate.
- Narasi selalu menyebut bahwa bukti valid per Query Date.

## 7. Verifikasi URL (berurutan)

Untuk setiap URL, satu per satu:

- `fetch` dengan User-Agent browser, ikuti redirect, **timeout 10 detik**.
- Lolos bila: HTTP **200**, body tidak kosong (teks bersih ≥ ~200 karakter, atau JSON valid), bukan halaman error/paywall/captcha yang terdeteksi.
- **Kecocokan nilai kunci**: cek apakah teks/JSON memuat nilai kunci klaim (mis. `1.33`, nama tim). Hasil: `match` | `partial` | `no_match` — informatif, bukan syarat lolos.
- Status yang dicatat: `ok` | `http_error (404, 403, …)` | `timeout` | `empty` | `blocked`.
- **Berhenti lebih awal**: bila setiap klaim sudah punya ≥ 2 sumber lolos, sisa antrean dilewati.
- Setiap URL emit progress: `checking` → `ok` / `failed` (+ alasan).

## 8. Template narasi

Paragraf mengalir, tanpa bullet, ±80–180 kata, urutan tetap:

1. **Pembukaan** — klaim apa yang dicek dan berapa jumlahnya.
2. **Bukti** — sumber apa yang dilihat, apa isinya, valid per Query Date.
3. **Penalaran** — kenapa bukti itu mengarah ke label tersebut (termasuk bagian subjektif bila ada).
4. **Kesimpulan** — label final.

Lalu:

```
Sources:
https://...
https://...
```

- EN: dibuka dengan pola "I fact-checked the claim(s) that …". ID: "Saya telah melakukan pengecekan terhadap klaim …".
- Variasi kesimpulan: **Disputed** sebut sumber mana menyatakan apa; **Unsupported** sebut ke mana saja dicari & kenapa tidak ada bukti; **No Claims present** jelaskan kenapa kalimat tidak memuat klaim faktual (blok `Sources:` boleh kosong/dihilangkan).
- Tombol **Salin** menyalin narasi EN + blok `Sources:`.

## 9. Riset manual & perbandingan

### 9.1 Input manual

- **Label versi user** (opsional): dropdown 5 label.
- **Catatan / reasoning manual**: textarea bebas (ID/EN).
- **URL sumber manual**: satu per baris; URL di dalam catatan juga diekstrak otomatis (dedupe).
- Bisa diisi kapan saja, sebelum atau sesudah riset AI. Hasil AI selalu terlihat.

### 9.2 Tombol "Bandingkan & Buat Final Review"

Aktif bila riset AI sudah selesai **dan** riset manual punya minimal catatan atau URL.

1. **Verifikasi riset manual** — URL manual dikunjungi satu per satu dengan aturan §7, termasuk cek tanggal terhadap Query Date; progress live.
2. **Perbandingan per klaim** (`compare`) — untuk setiap klaim (pakai daftar klaim hasil riset AI):
   - Sepakat / berbeda / hanya ada di salah satu riset.
   - Bila berbeda: jelaskan sumber mana lebih kuat dan kenapa (resmi vs tidak, tanggal vs Query Date, nilai kunci benar-benar ada di halaman).
   - Sumber bermasalah: URL manual yang gagal, terbit setelah Query Date, atau tidak memuat klaim.
3. **Final review**:
   - Label final rekomendasi + **tingkat keyakinan** (`tinggi` bila kedua riset sepakat & sumber kuat, `sedang`, `rendah` bila konflik belum terselesaikan).
   - Narasi final EN + ID (template §8); `Sources:` gabungan hanya dari URL **terverifikasi** (AI + manual).
   - **Catatan untuk user** (ID saja, tidak ikut disalin): poin perbedaan dan saran konkret.

## 10. UI

**Panel kiri — input**
- Tombol "Tempel & pecah otomatis" → textarea → isi 4 field.
- Field: User Query, Full Response, Target Sentence (disorot), Query Date (date picker, wajib, latar merah muda).
- Tombol **Cek Fakta** (aktif bila Target Sentence + Query Date terisi).
- Blok **Riset Manual** (§9.1) + tombol **Bandingkan & Buat Final Review**.

**Panel kanan — proses & hasil**
1. Progress live: tahapan + daftar URL dengan status ⏳ / ✓ (mis. "200 · memuat '1.33'") / ✗ (mis. "404", "timeout").
2. Hasil riset AI: badge label (Accurate hijau, Inaccurate merah, Disputed oranye, Unsupported abu-abu, No Claims biru), narasi EN + Salin, narasi ID (collapsible), rincian per klaim (collapsible: verdict, sumber pendukung/pembantah + tanggal + penanda vs Query Date).
3. Hasil perbandingan & final review: tabel per klaim (AI vs manual), badge label final + keyakinan, narasi final EN + Salin, narasi ID, catatan untuk user.

Light mode, Tailwind, gaya konsisten dengan halaman Gyro/Handbook.

## 11. Streaming progress

- Route mengembalikan `ReadableStream` NDJSON; satu baris = satu `ProgressEvent`:
  - `{ type: "stage", stage, message }`
  - `{ type: "link", url, status: "checking" | "ok" | "failed", detail }`
  - `{ type: "result", data }`
  - `{ type: "error", message }`
- Client membaca stream dengan `response.body.getReader()` dan memperbarui state bertahap.

## 12. Error handling

| Situasi | Perilaku |
|---------|----------|
| `TAVILY_API_KEY` / `SUMOPOD_API_KEY` belum diset | Event `error` dengan pesan jelas; proses tidak berjalan |
| Sports API tidak menemukan event / error | Lanjut ke Tavily, tanpa error ke user |
| Tavily error / kuota habis | Event `error` bila tak ada sumber lain; bila ada sumber sports API, lanjut |
| Semua URL gagal verifikasi | Label tetap diberikan (umumnya Unsupported); narasi menyebut sumber tidak bisa dibuka; `Sources:` tanpa link palsu |
| LLM mengembalikan JSON rusak | Retry 1x, lalu event `error` |
| Situs memblokir server (403/captcha) | URL ditandai `blocked`, tidak dipakai |
| Mendekati batas waktu (300 dtk) | Progress yang sudah ada tetap terlihat; event `error` "waktu habis" |

## 13. Testing

- **Unit ringan:** parser tempel-dan-pecah, pemangkas JSON sports API (pakai sampel MLB boxscore & ESPN golf scoreboard), klasifikasi tanggal sumber vs Query Date, perakit blok `Sources:` (membuang URL tak terverifikasi).
- **Manual end-to-end:**
  1. Rayo Vallecano xG 1.33 (laga 15 Sep 2026, Query Date 2026-09-23) — jalur Tavily.
  2. Satu klaim MLB dari boxscore game 823576 — jalur sports API.
  3. Satu kalimat dengan kata subjektif.
  4. Riset manual berisi 1 URL valid + 1 URL 404 + 1 URL terbit setelah Query Date → cek perbandingan & final review.

## 14. Out of scope (v1)

- Penyimpanan riwayat / memory koreksi.
- Agen tool-calling bebas (LLM mencari berulang sendiri).
- Headless browser untuk situs yang memblokir fetch biasa.
- Adapter sports API selain MLB / ESPN / NHL.
