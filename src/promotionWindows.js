// Studio time is Central (Orland Park, IL). October is still daylight time (-05:00).
const OCTOBER_PACKAGE_START_MS = Date.parse("2026-10-01T00:00:00-05:00");
const OCTOBER_PACKAGE_END_MS = Date.parse("2026-11-01T00:00:00-05:00");

function normalizePricingName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isOctoberBuyThreeGetOnePackage(item) {
  const name = normalizePricingName(item?.name || item?.sourceName);
  return /\bbuy 3 class(?:es)? get 1 free\b/.test(name);
}

export function isPricingItemCurrentlyVisible(item, now = Date.now()) {
  if (!isOctoberBuyThreeGetOnePackage(item)) {
    return true;
  }

  const timestamp = Number(now);
  return timestamp >= OCTOBER_PACKAGE_START_MS && timestamp < OCTOBER_PACKAGE_END_MS;
}

export const OCTOBER_PACKAGE_WINDOW = Object.freeze({
  startsAt: OCTOBER_PACKAGE_START_MS,
  endsAt: OCTOBER_PACKAGE_END_MS
});

// BACKTOSCHOOL15 runs every September, midnight Sept 1 to midnight Oct 1 Central
// (daylight time, -05:00). Shared by the site and the checkout API.
export function isBackToSchoolPromotionActive(now = Date.now()) {
  const timestamp = Number(now instanceof Date ? now.getTime() : now);
  const year = new Date(timestamp - 5 * 60 * 60 * 1000).getUTCFullYear();
  const startsAt = Date.UTC(year, 8, 1, 5);
  const endsAt = Date.UTC(year, 9, 1, 5);
  return timestamp >= startsAt && timestamp < endsAt;
}
