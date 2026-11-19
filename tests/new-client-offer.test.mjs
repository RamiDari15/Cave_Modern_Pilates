import test from 'node:test';
import assert from 'node:assert/strict';
import { selectNewClientIntro, isTwoWeekUnlimitedIntro } from '../src/newClientOffer.js';
const dropIn = { id: '100006', name: 'New Client Drop in', price: '$20.00', sellOnline: true };
const oldIntro = { id: 'old', name: 'New Client 3 Class Pack', price: '$65.00', sellOnline: true };
const intro = { id: '100055', name: 'THE CAVE INTRO | 14 DAYS UNLIMITED', price: '$99.00', sellOnline: true };
test('promoted CTA selects live 14-day offer over drop-in and old intro, preserving checkout identity and price', () => {
  assert.equal(selectNewClientIntro([dropIn, oldIntro, intro]), intro);
});
test('does not sell a withdrawn intro or substitute a drop-in', () => {
  assert.equal(selectNewClientIntro([dropIn, { ...intro, sellOnline: false }]), null);
});
test('supports equivalent two-week naming without treating annual unlimited as intro', () => {
  assert.equal(isTwoWeekUnlimitedIntro({ name: '2 Weeks Unlimited' }), true);
  assert.equal(isTwoWeekUnlimitedIntro({ name: '12 Month Unlimited' }), false);
});
