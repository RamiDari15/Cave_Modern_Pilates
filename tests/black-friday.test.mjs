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
import { BLACK_FRIDAY_WINDOW, isBlackFridaySaleActive, isBlackFridayVisible, isBlackFridayServiceReady } from '../src/promotionWindows.js';
import { supportedMembershipQuote } from '../server/contract-catalog.mjs';
test('Sale uses Central midnight and includes all of November 30', () => {
 assert.equal(isBlackFridaySaleActive(BLACK_FRIDAY_WINDOW.startsAt-1),false);
 assert.equal(isBlackFridaySaleActive(BLACK_FRIDAY_WINDOW.startsAt),true);
 assert.equal(isBlackFridaySaleActive(Date.parse('2026-11-23T12:00:00-06:00')),true);
 assert.equal(isBlackFridaySaleActive(Date.parse('2026-11-30T23:59:59-06:00')),true);
 assert.equal(isBlackFridaySaleActive(BLACK_FRIDAY_WINDOW.endsAt),false);
 assert.equal(isBlackFridayVisible(BLACK_FRIDAY_WINDOW.endsAt),false);
});
test('Class pack must have advertised credits, price and online availability', () => {
 const pack = {id:100068, name:'Black Friday 10 Pack',price:279,sessions:12,sellOnline:true};
 assert.equal(isBlackFridayServiceReady(pack),true);
 for(const change of [{sessions:10},{price:300},{sellOnline:false}]) assert.equal(isBlackFridayServiceReady({...pack,...change}),false);
});
const base = {Id:120, Name:'4 Class Black Friday', SoldOnline:true, AgreementTerms:'Test terms', AutopayEnabled:true,AutopayTriggerType:'OnSetSchedule',AutopaySchedule:{FrequencyType:'SetNumberOfAutopays',FrequencyValue:1,FrequencyTimeUnit:'Monthly'},NumberOfAutopays:3,ActionUponCompletionOfAutopays:'ContractExpires',ClientsChargedOn:'OnSaleDate',FirstPaymentAmountTotal:89,RecurringPaymentAmountTotal:119,TotalContractAmountTotal:327,DepositAmount:0,DiscountAmount:0,FirstAutopayFree:false,LastAutopayFree:false};
test('Discounted membership requires exact first payment and full commitment totals', () => {
 assert.ok(supportedMembershipQuote(base));
 assert.equal(supportedMembershipQuote({...base,FirstPaymentAmountTotal:119,TotalContractAmountTotal:357}),null);
 const annual={...base,Id:117,NumberOfAutopays:12,FirstAutopayFree:true,FirstPaymentAmountTotal:0,RecurringPaymentAmountTotal:109,TotalContractAmountTotal:1199};
 assert.ok(supportedMembershipQuote(annual));
 assert.equal(supportedMembershipQuote({...annual,TotalContractAmountTotal:1308}),null);
});

test('Live first-free gross amounts become zero due now only with exact discount and net totals', () => {
 for (const [Id, monthly] of [[117,109],[118,189],[119,259]]) {
  const annual = {...base,Id,NumberOfAutopays:12,FirstAutopayFree:true,FirstPaymentAmountTotal:monthly,RecurringPaymentAmountTotal:monthly,DiscountAmount:monthly,TotalContractAmountTotal:monthly*11};
  const quote = supportedMembershipQuote(annual);
  assert.equal(quote?.firstPaymentAmountTotal,0);
  assert.equal(quote?.recurringPaymentAmountTotal,monthly);
  for (const change of [{DiscountAmount:30},{FirstAutopayFree:false},{DepositAmount:10},{TotalContractAmountTotal:monthly*12},{FirstPaymentAmountTotal:monthly+1}]) assert.equal(supportedMembershipQuote({...annual,...change}),null);
 }
});

test('SAVE30 quotes apply to exactly the first autopay for all three memberships', () => {
 for (const [Id, monthly] of [[120,119],[104,199],[122,279]]) {
  const first = monthly - 30;
  const contract = {...base, Id, FirstPaymentAmountTotal:first, RecurringPaymentAmountTotal:monthly, TotalContractAmountTotal:first+2*monthly, NumberOfPromoAutopays:1, PromoPaymentAmountSubtotal:first, PromoPaymentAmountTax:0, PromoPaymentAmountTotal:first};
  assert.equal(supportedMembershipQuote(contract)?.firstPaymentAmountTotal,first);
  assert.equal(supportedMembershipQuote({...contract,NumberOfPromoAutopays:2}),null);
  assert.equal(supportedMembershipQuote({...contract,PromoPaymentAmountTotal:monthly}),null);
 }
});

test('Intro is ready by ID and $59 price even when its Mindbody name omits "unlimited"', () => {
 assert.equal(isBlackFridayServiceReady({id:100066,name:'THE CAVE INTRO | BLACK FRIDAY',price:'$59.00',sessions:null,sellOnline:true}),true);
 assert.equal(isBlackFridayServiceReady({id:100066,name:'THE CAVE INTRO | BLACK FRIDAY',price:'$99.00',sessions:null,sellOnline:true}),false);
 assert.equal(isBlackFridayServiceReady({id:100066,name:'THE CAVE INTRO',price:59,sellOnline:false}),false);
});
