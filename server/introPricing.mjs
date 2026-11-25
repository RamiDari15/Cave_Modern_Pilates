import { isBlackFridaySaleActive } from '../src/promotionWindows.js';

export function isCaveIntro(item) {
  return ['100055', '100066'].includes(String(item?.Id ?? item?.id));
}

export function introPrice(service, now = Date.now()) {
  const base = Number(service.OnlinePrice ?? service.Price);
  if (!isCaveIntro(service)) return base;
  if (base !== 65 && !(base === 59 && isBlackFridaySaleActive(now))) {
    throw new Error('The intro price needs to be refreshed. No charge was made.');
  }
  return isBlackFridaySaleActive(now) ? 59 : 65;
}

// Quotes are test-only. A verified provider total is required before any charge.
// Try the native early-bird price first; apply the $6 only if it was not applied.
export async function quoteIntroCart({ items, services, quote, now = Date.now(), promoCode }) {
  if (promoCode) throw new Error('The intro offer cannot be combined with a promo code.');
  let expected = 0;
  let undiscounted = 0;
  const discounts = [];
  const cartItems = items.map(item => {
    const raw = services.find(service => String(service.Id) === String(item.id));
    const quantity = Number(item.quantity ?? 1);
    if (item.kind !== 'service' || !raw || raw.SellOnline === false || !Number.isInteger(quantity) || quantity < 1 || quantity > 100 || (isCaveIntro(raw) && quantity !== 1)) {
      throw new Error('This item is not available for online purchase.');
    }
    const base = Number(raw.OnlinePrice ?? raw.Price);
    const price = introPrice(raw, now);
    if (!Number.isFinite(base) || !Number.isFinite(price)) throw new Error('Unable to verify the price.');
    expected += price * quantity;
    undiscounted += base * quantity;
    discounts.push(base - price);
    return { Item: { Type: 'Service', Metadata: { Id: Number(item.id) } }, Quantity: quantity, DiscountAmount: 0 };
  });
  const cents = n => Math.round(n * 100);
  const net = result => {
    const cart = result?.ShoppingCart || result;
    if (cart?.GrandTotal == null) return NaN;
    return Number(cart.GrandTotal) - Number(cart.TaxTotal ?? 0);
  };
  // Mindbody validates the test payment before returning a quote. Send the
  // expected promotional total, not the pre-discount catalog price.
  let result;
  try {
    result = await quote(cartItems, expected);
  } catch (error) {
    const mismatch = String(error.message || '').match(/input payment total \(([\d.]+)\) does not match the calculated total \(([\d.]+)\)/i);
    if (!mismatch || expected >= undiscounted || cents(Number(mismatch[1])) !== cents(expected) || cents(Number(mismatch[2])) !== cents(undiscounted)) throw error;
    // Only retry when the provider confirms that the native discount is absent.
    cartItems.forEach((item, index) => { item.DiscountAmount = discounts[index]; });
    result = await quote(cartItems, expected);
  }
  if (cartItems.every(item => item.DiscountAmount === 0) && cents(net(result)) !== cents(expected) && cents(net(result)) === cents(undiscounted) && expected < undiscounted) {
    cartItems.forEach((item, index) => { item.DiscountAmount = discounts[index]; });
    result = await quote(cartItems, expected);
  }
  if (cents(net(result)) !== cents(expected)) throw new Error('Mindbody could not confirm the intro price. No charge was made. Please try again shortly.');
  return { result, cartItems };
}
