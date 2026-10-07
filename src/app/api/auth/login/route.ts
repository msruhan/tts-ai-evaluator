import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  readAuthConfig,
  safeNextPath,
  timingSafeEqual,
} from "@/lib/auth";

export const runtime = "nodejs";

const MAX_FAILURES = 5;
const LOCK_MS = 5 * 60 * 1000;
const failures = new Map<string, { count: number; lockedUntil: number }>();

function clientIp(request: NextRequest) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}

export async function POST(request: NextRequest) {
  const { username, password, secret } = readAuthConfig();
  if (!username || !password || secret.length < 32) {
    return NextResponse.json(
      { error: "Login belum dikonfigurasi di server (AUTH_USERNAME, AUTH_PASSWORD, AUTH_SECRET)." },
      { status: 500 },
    );
  }

  const ip = clientIp(request);
  const now = Date.now();
  const record = failures.get(ip);
  if (record && record.lockedUntil > now) {
    const minutes = Math.ceil((record.lockedUntil - now) / 60000);
    return NextResponse.json(
      { error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${minutes} menit.` },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    username?: unknown;
    password?: unknown;
    next?: unknown;
  };
  const inputUser = typeof body.username === "string" ? body.username.trim() : "";
  const inputPass = typeof body.password === "string" ? body.password : "";

  const userOk = timingSafeEqual(inputUser, username);
  const passOk = timingSafeEqual(inputPass, password);
  if (!userOk || !passOk) {
    const previous = record && record.count < MAX_FAILURES ? record.count : 0;
    const count = previous + 1;
    failures.set(ip, { count, lockedUntil: count >= MAX_FAILURES ? now + LOCK_MS : 0 });
    return NextResponse.json({ error: "Username atau password salah." }, { status: 401 });
  }

  failures.delete(ip);
  const token = await createSessionToken(username, secret);
  const res = NextResponse.json({
    ok: true,
    next: safeNextPath(typeof body.next === "string" ? body.next : null),
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.headers.get("x-forwarded-proto") === "https" || request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
