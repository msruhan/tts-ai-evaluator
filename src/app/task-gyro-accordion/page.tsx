import type { Metadata } from "next";
import GyroApp from "@/components/gyro/GyroApp";

export const metadata: Metadata = {
  title: "Task Gyro · Review Helper",
  description:
    "Alat bantu review Expected vs Actual untuk Avalanch / Gyro Accordion — saran otomatis hanya untuk yang pasti dari Task Variables.",
};

export default function TaskGyroAccordionPage() {
  return <GyroApp />;
}
