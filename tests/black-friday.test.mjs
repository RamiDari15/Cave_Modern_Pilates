import test from 'node:test';
import assert from 'node:assert/strict';
import { isBlackFridayOffer, isPricingItemCurrentlyVisible } from '../src/promotionWindows.js';
test('Black Friday offers stay out of regular pricing even during sale dates', () => {
 for (const item of [{name:'4 Class Membership | Black Friday'}, {Name:'Black-Friday 10 Pack'}, {id:100066}, {id:100067}, {id:100068}, {kind:'contract',id:104}, {kind:'contract',id:117}, {kind:'contract',id:118}, {kind:'contract',id:119}, {kind:'contract',id:120}, {kind:'contract',id:122}]) {
  assert.equal(isBlackFridayOffer(item),true);
  assert.equal(isPricingItemCurrentlyVisible(item,Date.parse('2026-11-28')),false);
 }
});
test('Regular memberships and packages remain available', () => {
 for (const item of [{kind:'contract',id:101,name:'4 Class Membership'}, {id:100051,name:'Private Sessions'}, {name:'The Cave Intro'}]) assert.equal(isPricingItemCurrentlyVisible(item),true);
});
