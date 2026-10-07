import type {
  AiResearchResult,
  FactCheckInput,
  FactLabel,
  FinalReview,
} from "@/lib/factcheck/types";

export type HistoryEntry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  input: FactCheckInput;
  manual: { label: FactLabel | ""; notes: string; urls: string };
  aiResult: AiResearchResult | null;
  finalReview: FinalReview | null;
};

const KEY = "factcheck-history-v1";
const CHANGE_EVENT = "factcheck-history-change";
const MAX_ENTRIES = 50;
const EMPTY: HistoryEntry[] = [];

let cacheRaw: string | null = null;
let cache: HistoryEntry[] = EMPTY;

export function getHistorySnapshot(): HistoryEntry[] {
  const raw = window.localStorage.getItem(KEY);
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      cache = Array.isArray(parsed) ? parsed : EMPTY;
    } catch {
      cache = EMPTY;
    }
  }
  return cache;
}

export function getHistoryServerSnapshot(): HistoryEntry[] {
  return EMPTY;
}

export function subscribeHistory(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function write(list: HistoryEntry[]) {
  let entries = list.slice(0, MAX_ENTRIES);
  for (;;) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(entries));
      break;
    } catch {
      if (entries.length <= 1) {
        window.localStorage.removeItem(KEY);
        break;
      }
      entries = entries.slice(0, -1);
    }
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function findHistoryEntry(id: string | null): HistoryEntry | undefined {
  return id ? getHistorySnapshot().find((e) => e.id === id) : undefined;
}

export function upsertHistoryEntry(entry: HistoryEntry) {
  write([entry, ...getHistorySnapshot().filter((e) => e.id !== entry.id)]);
}

export function removeHistoryEntry(id: string) {
  write(getHistorySnapshot().filter((e) => e.id !== id));
}

export function clearHistory() {
  write([]);
}

export function newHistoryId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function downloadHistory(entries: HistoryEntry[]) {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fact-check-history-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
