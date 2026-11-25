import test from 'node:test';
import assert from 'node:assert/strict';
import { introPrice, quoteIntroCart } from '../server/introPricing.mjs';
const now = Date.parse('2026-11-30T23:59:59-06:00');
const services = [{ Id: 100066, OnlinePrice: 65, SellOnline: true }];
const items = [{ id: '100066', kind: 'service', quantity: 1, price: 1 }];
test('intro switches at midnight Central Dec 1 and rejects old99', () => {
  assert.equal(introPrice(services[0], now), 59);
  assert.equal(introPrice(services[0], now + 1000), 65);
  assert.throws(() => introPrice({ ...services[0], OnlinePrice: 99 }, now));
});
test('native discount is not doubled', async () => {
  let calls = 0;
  const r = await quoteIntroCart({ items, services, now, quote: async cart => {
    calls++; assert.equal(cart[0].DiscountAmount, 0);
    return { ShoppingCart: { GrandTotal: 59 } };
  }});
  assert.equal(calls, 1); assert.equal(r.cartItems[0].DiscountAmount, 0);
});
test('adds6 only after provider quotes65; ignores browser price', async () => {
  let calls = 0;
  const r = await quoteIntroCart({ items, services, now, quote: async cart => {
    calls++; return { ShoppingCart: { GrandTotal: 65 - cart[0].DiscountAmount } };
  }});
  assert.equal(calls, 2); assert.equal(r.cartItems[0].DiscountAmount, 6);
});
test('fails closed on unavailable quote and incorrect totals', async () => {
  await assert.rejects(quoteIntroCart({ items, services, now, quote: async () => { throw new Error('offline'); } }));
  await assert.rejects(quoteIntroCart({ items, services, now, quote: async () => ({ ShoppingCart: { GrandTotal: 53 } }) }));
});
test('no discount after November30', async () => {
  const r = await quoteIntroCart({ items, services, now: now + 1000, quote: async cart => {
    assert.equal(cart[0].DiscountAmount, 0); return { ShoppingCart: { GrandTotal: 65 } };
  }});
  assert.equal(r.result.ShoppingCart.GrandTotal, 65);
});
test('rejects invalid quantities, offline items and stacked codes', async () => {
  const quote = async () => { throw new Error('should not quote'); };
  await assert.rejects(quoteIntroCart({ items: [{...items[0], quantity: 2}], services, now, quote }), /not available/);
  await assert.rejects(quoteIntroCart({ items, services: [{...services[0], SellOnline: false}], now, quote }), /not available/);
  await assert.rejects(quoteIntroCart({ items, services, now, quote, promoCode: 'SAVE30' }), /combined/);
});
