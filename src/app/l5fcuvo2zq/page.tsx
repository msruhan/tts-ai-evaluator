import type { Metadata } from "next";
import FactCheckApp from "@/components/factcheck/FactCheckApp";

export const metadata: Metadata = {
  title: "Fact Check AI",
  description:
    "Cek fakta Target Sentence per Query Date: riset AI dengan sumber terverifikasi, riset manual, dan final review hasil perbandingan.",
  robots: { index: false, follow: false },
};

export default function FactCheckPage() {
  return <FactCheckApp />;
}
