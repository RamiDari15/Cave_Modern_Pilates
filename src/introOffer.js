// Picks the new-client offer the /newbie page (and its ads) should sell.
// Prefers the 14-day unlimited intro; falls back to the older 3-class pack.

function itemName(item) {
  return String(item?.name || item?.sourceName || "");
}

export function isUnlimitedIntroOffer(item) {
  const name = itemName(item);
  return /unlimited/i.test(name) && /\b(14\s*days?|2\s*weeks?|two\s*weeks?)\b/i.test(name);
}

function isThreeClassIntro(item) {
  return /\b3\s*class/i.test(itemName(item));
}

export function findIntroOffer(items = []) {
  const sellable = items.filter((item) => item && item.sellOnline !== false);
  return sellable.find(isUnlimitedIntroOffer) || sellable.find(isThreeClassIntro) || null;
}

export function sortIntroOfferFirst(items = []) {
  const intro = findIntroOffer(items);
  if (!intro) return [...items];
  return [intro, ...items.filter((item) => item !== intro)];
}

export function introHeadline(item) {
  if (!item?.price) return "";
  const price = String(item.price).replace(/\.00\b/, "");
  if (isUnlimitedIntroOffer(item)) return `2 weeks of unlimited reformer Pilates for ${price}`;
  if (isThreeClassIntro(item)) return `3 reformer classes for ${price}`;
  return "";
}

export function introButtonLabel(item) {
  return isUnlimitedIntroOffer(item) ? "Claim my 2 weeks" : "Claim my intro";
}
