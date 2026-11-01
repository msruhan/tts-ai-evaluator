import type { Metadata } from "next";
import HandbookApp from "@/components/handbook/HandbookApp";

export const metadata: Metadata = {
  title: "Buku Panduan Rater — Live E2E Eval",
  description:
    "Versi Indonesia dari Live E2E Eval Template v3.6 — referensi cepat untuk 29 dimensi penilaian.",
};

export default function LiveEvalHandbookPage() {
  return <HandbookApp />;
}
