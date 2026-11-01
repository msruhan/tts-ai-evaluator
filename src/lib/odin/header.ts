const REVIEWER_NAME = "Masruhan K";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Convert current local/WIB time to UTC stamp: MM/DD @HH:mm GMT (UTC+0) */
export function formatGmtStamp(now = new Date()) {
  return `${pad(now.getUTCMonth() + 1)}/${pad(now.getUTCDate())} @${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} GMT (UTC+0)`;
}

export function formatOdinReviewHeader(
  reviewNo: string,
  reviewer = REVIEWER_NAME,
  now = new Date(),
) {
  const num = reviewNo.trim() || "#";
  return `${formatGmtStamp(now)}, Review ${num}, ${reviewer}`;
}

export function attachHeader(header: string, body: string) {
  const text = String(body || "").trim();
  if (!text) return `${header}\n`;
  if (text.startsWith(header)) return text;
  return `${header}\n${text}`;
}
