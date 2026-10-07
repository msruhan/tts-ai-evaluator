import type { DateStatus } from "./types";

export function toIsoDay(raw: string | undefined | null): string {
  if (!raw) return "";
  const text = String(raw).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toISOString().slice(0, 10);
}

export function isOnOrBefore(day: string, queryDate: string): boolean {
  return toIsoDay(day) <= toIsoDay(queryDate);
}

export function classifyDate(
  published: string | undefined | null,
  queryDate: string,
): DateStatus {
  const day = toIsoDay(published);
  if (!day) return "unknown_date";
  return isOnOrBefore(day, queryDate) ? "before_query_date" : "after_query_date";
}

export function toCompactDate(day: string): string {
  return toIsoDay(day).replace(/-/g, "");
}
