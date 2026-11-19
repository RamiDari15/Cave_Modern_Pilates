export function isTwoWeekUnlimitedIntro(item) {
  const name = String(item?.name || "");
  return /unlimited/i.test(name) && /\b(?:14\s*days?|2\s*weeks?|two\s*weeks?)\b/i.test(name);
}

export function selectNewClientIntro(items = []) {
  const available = items.filter((item) => item.sellOnline !== false && item.id && item.price);
  return available.find(isTwoWeekUnlimitedIntro)
    || available.find((item) => /\b3\s*class/i.test(String(item.name || "")))
    || null;
}
