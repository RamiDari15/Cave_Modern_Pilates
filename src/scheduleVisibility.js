const studioClock = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
});
export function isClassVisible(item, now = Date.now()) {
  const start = String(item.startDateTime || item.startTime || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(start)) return false;
  // Mindbody's offset-free timestamps are studio-local, not visitor-local.
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(start);
  const current = hasOffset ? Number(now) : Date.parse(studioClock.format(new Date(now)).replace(" ", "T") + "Z");
  const begins = Date.parse(hasOffset ? start : start + "Z");
  return Number.isFinite(begins) && current < begins + 15 * 60_000;
}
