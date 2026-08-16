import type { Metadata } from "next";
import { Source_Sans_3, Fraunces } from "next/font/google";
import "./globals.css";

const sans = Source_Sans_3({
  variable: "--font-sans-body",
  subsets: ["latin"],
});

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TTS AI Evaluator",
  description:
    "Evaluasi Text-to-Speech Bahasa Indonesia via SumoPod: bandingkan Audio A vs B, simpan history, dan perbaiki penilaian lewat reviewer memory.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${sans.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans text-slate-900">{children}</body>
    </html>
  );
}
