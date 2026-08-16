# TTS AI Evaluator

Web app untuk evaluasi Text-to-Speech (Indonesia / Malaysia / English) via
SumoPod AI. History + reviewer memory mendukung **local file** dan **Supabase**.

## Fitur

- Upload reference, Audio A, Audio B + text prompt
- Dropdown bahasa evaluasi
- Catatan pendengar + dropdown kesalahan bahasa
- Ratings Avalanch + rationale/justification bilingual (EN + ID)
- History sidebar
- Reviewer comment → memory skills untuk evaluasi berikutnya

## Storage mode

| Mode | Kapan aktif | Data disimpan di |
|---|---|---|
| **local** | Env Supabase kosong | `data/evaluations/`, `data/memory.json` |
| **supabase** | `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` terisi | Tabel Supabase |

Lokal tetap jalan tanpa Supabase. Untuk Vercel, isi env Supabase.

## Setup lokal (tanpa Supabase)

```bash
cp .env.example .env.local
# isi SUMOPOD_API_KEY saja; biarkan Supabase kosong
npm install
npm run dev
```

## Setup dengan Supabase

1. Buat project di [Supabase](https://supabase.com)
2. Jalankan SQL di `supabase/schema.sql`
3. Isi di `.env.local` / Vercel:

| Key | Description |
|---|---|
| `SUMOPOD_API_KEY` | API key SumoPod |
| `SUMOPOD_MODEL` | Default `gemini/gemini-3.5-flash` |
| `SUMOPOD_BASE_URL` | Default `https://ai.sumopod.com/v1` |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server only) |

## Deploy Vercel

1. Push repo ke GitHub
2. Import di Vercel
3. Set env SumoPod + Supabase
4. Pastikan function duration cukup (60–120s) untuk evaluasi audio
5. Deploy

Jangan commit `SUPABASE_SERVICE_ROLE_KEY`. Audio tidak disimpan di DB.

## Stack

- Next.js (App Router)
- TypeScript + Tailwind CSS
- `openai` (SumoPod-compatible)
- `@supabase/supabase-js`
