export const GUEST_PASS_TIME_ZONE = "America/Detroit";

export function getGuestPassPeriod(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: GUEST_PASS_TIME_ZONE,
    year: "numeric",
    month: "2-digit"
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return {
    benefitMonth: `${year}-${String(month).padStart(2, "0")}-01`,
    renewsOn: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`
  };
}
