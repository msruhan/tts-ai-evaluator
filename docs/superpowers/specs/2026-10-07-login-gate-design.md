# Login gate — design

## Goal
Every page and API in the app requires one login. A single login unlocks all modules (TTS Evaluator, Task Gyro, Buku Panduan Rater, Fact Check) and their APIs.

## Decisions
- One account, credentials in `.env.local`: `AUTH_USERNAME`, `AUTH_PASSWORD`, `AUTH_SECRET`.
- Session: HMAC-SHA256 signed token `base64url(payload).base64url(sig)` with payload `{ u, exp }`, stored in `httpOnly`, `SameSite=Lax` cookie `pd_session`, 7 days, `Secure` over HTTPS.
- After login: redirect to `next` (internal paths only), default `/`.

## Components
- `src/lib/auth.ts` — `createSessionToken`, `verifySessionToken`, `safeNextPath`, constants. Web Crypto only, so it runs in Proxy and route handlers.
- `src/proxy.ts` — runs on all paths except `_next/*`, `favicon.ico`, `/login`, `/api/auth/*`. Invalid/missing session: pages redirect to `/login?next=…`, `/api/*` returns 401 JSON.
- `src/app/api/auth/login/route.ts` — validates credentials (constant-time compare), in-memory lockout after 5 failures per IP for 5 minutes, sets cookie.
- `src/app/api/auth/logout/route.ts` — clears cookie, 303 to `/login`.
- `src/app/login/page.tsx` + `LoginForm.tsx` — form; nav hidden on `/login`.
- `SiteNav.tsx` — "Keluar" button (POST to logout).

## Testing
Unit tests for token create/verify (valid, tampered, expired, wrong secret) and `safeNextPath`. Manual: `/` redirects to login, APIs return 401, login opens all modules, logout returns to login.
