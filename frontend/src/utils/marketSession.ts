/** A-share calendar session (Asia/Shanghai, Mon–Fri). Pre/post not included. */
export function isAShareSessionOpen(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  if (["Sat", "Sun"].includes(weekday)) return false;

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const mins = hour * 60 + minute;

  const am = mins >= 9 * 60 + 30 && mins < 11 * 60 + 30;
  const pm = mins >= 13 * 60 && mins < 15 * 60;
  return am || pm;
}