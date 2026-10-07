import type { Metadata } from "next";
import { safeNextPath } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Login · Pusdatik",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Pusdatik</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-slate-900">Masuk</h1>
        <p className="mt-1 text-sm text-slate-500">
          Satu kali login untuk semua modul: TTS Evaluator, Task Gyro, Buku Panduan, dan Fact Check.
        </p>
        <LoginForm nextPath={nextPath} />
      </div>
    </main>
  );
}
