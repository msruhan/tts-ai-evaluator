import type { Metadata } from "next";
import GyroApp from "@/components/gyro/GyroApp";

export const metadata: Metadata = {
  title: "Task Gyro Accordion",
  description:
    "Avalanch Deep Research review workstation — isolated from TTS evaluation memory.",
};

export default function TaskGyroAccordionPage() {
  return <GyroApp />;
}
