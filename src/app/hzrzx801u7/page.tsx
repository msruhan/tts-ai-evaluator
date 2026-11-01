import type { Metadata } from "next";
import OdinApp from "@/components/odin/OdinApp";

export const metadata: Metadata = {
  title: "Generalist Review",
  description:
    "Helper review: idea writer, catatan reviewer, Metadata.rtf, dan deliverables.zip jadi feedback writer + internal notes QC.",
  robots: { index: false, follow: false },
};

export default function GeneralistReviewPage() {
  return <OdinApp />;
}
