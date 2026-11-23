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

export function withoutOctoberBuyThreeGetOnePackage(items) {
  return (Array.isArray(items) ? items : []).filter(
    (item) => !isOctoberBuyThreeGetOnePackage(item)
  );
}

export function isPricingItemCurrentlyVisible(item, now = Date.now()) {
  if (isBlackFridayOffer(item)) return false;
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

// This was a 2026 promotion, not a recurring annual discount.
export function isBackToSchoolPromotionActive(now = Date.now()) {
  const timestamp = Number(now instanceof Date ? now.getTime() : now);
  return timestamp >= Date.parse("2026-09-01T00:00:00-05:00") && timestamp < Date.parse("2026-10-01T00:00:00-05:00");
}

// Keep seasonal offers separate from the regular pricing catalog.
export function isBlackFridayOffer(item) {
  const name = [item?.name, item?.sourceName, item?.Name].filter(Boolean).join(" ");
  const id = String(item?.id ?? item?.Id ?? item?.contractId ?? "");
  const contract = item?.kind === "contract" || item?.contractId != null;
  return /black[\s-]*friday/i.test(name) ||
    ["100066", "100067", "100068"].includes(id) ||
    (contract && ["104", "117", "118", "119", "120", "122"].includes(id));
}

export const BLACK_FRIDAY_WINDOW = Object.freeze({
  startsAt: Date.parse("2026-11-23T00:00:00-06:00"),
  endsAt: Date.parse("2026-12-01T00:00:00-06:00")
});
export function isBlackFridaySaleActive(now = Date.now()) {
  return Number(now) >= BLACK_FRIDAY_WINDOW.startsAt && Number(now) < BLACK_FRIDAY_WINDOW.endsAt;
}
export function isBlackFridayVisible(now = Date.now()) {
  return Number(now) < BLACK_FRIDAY_WINDOW.endsAt;
}
export function isBlackFridayServiceReady(item) {
  const expected = { "100066": [59, null], "100067": [159, 6], "100068": [279, 12] }[String(item?.id)];
  return Boolean(expected && Number(String(item.price).replace(/[^0-9.]/g, "")) === expected[0] &&
    (expected[1] === null ? /unlimited/i.test(item.name || "") : Number(item.sessions) === expected[1]) && item.sellOnline !== false);
}
