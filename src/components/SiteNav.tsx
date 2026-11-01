"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "TTS Evaluator" },
  { href: "/task-gyro-accordion", label: "Task Gyro" },
  { href: "/hzrzx801u7", label: "Generalist Review" },
  { href: "/live-eval-handbook", label: "Buku Panduan Rater" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteNav() {
  const pathname = usePathname() || "/";
  if (pathname === "/login") return null;

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 sm:px-4">
        <Link
          href="/"
          className="shrink-0 text-sm font-semibold tracking-tight text-slate-900"
        >
          Pusdatik
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`shrink-0 rounded-md px-2.5 py-1.5 text-sm transition ${
                  active
                    ? "bg-teal-50 font-medium text-teal-800"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
        <form action="/api/auth/logout" method="post" className="shrink-0">
          <button
            type="submit"
            className="rounded-md px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Keluar
          </button>
        </form>
      </div>
    </nav>
  );
}
