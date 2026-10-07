import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readAuthConfig, verifySessionToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { secret } = readAuthConfig();
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, secret);
  if (session) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Silakan login terlebih dahulu." }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/|favicon\\.ico|login|api/auth/).*)"],
};
