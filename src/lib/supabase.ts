import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

function sanitizeEnv(value?: string | null): string {
  return (value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\r?\n/g, "");
}

function getSupabaseUrl() {
  return sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
}

function getSupabaseKey() {
  return sanitizeEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  );
}

export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  return Boolean(url && key);
}

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = getSupabaseUrl();
  const key = getSupabaseKey();

  if (!url || !key) {
    throw new Error(
      "Supabase belum dikonfigurasi. Set NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY, atau kosongkan keduanya untuk mode lokal (folder data/).",
    );
  }

  // Prefer legacy service_role JWT (eyJ...) on Vercel if you see "JWT issued at future"
  // with the new sb_secret_ keys. Find it under Supabase → Settings → API Keys → Legacy keys.
  cached = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cached;
}

export function explainSupabaseError(message: string): string {
  if (/JWT issued at future/i.test(message)) {
    return `${message}. Di Vercel, ganti SUPABASE_SERVICE_ROLE_KEY ke Legacy API Key "service_role" (biasanya diawali eyJ...), bukan sb_secret_. Lalu Redeploy.`;
  }
  return message;
}
