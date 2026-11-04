import test from "node:test";
import assert from "node:assert/strict";

import { findIntroOffer, sortIntroOfferFirst, introHeadline, introButtonLabel } from "../src/introOffer.js";

const dropIn = { id: "100006", name: "New Client Drop in", price: "$20.00" };
const intro = { id: "100055", name: "THE CAVE INTRO | 14 DAYS UNLIMITED", price: "$99.00" };
const threePack = { id: "1", name: "New Client 3 Class Package", price: "$65.00" };

test("picks the 14-day unlimited intro from the live new-client list", () => {
  assert.equal(findIntroOffer([dropIn, intro]), intro);
});

test("prefers the unlimited intro over an older 3-class pack", () => {
  assert.equal(findIntroOffer([threePack, dropIn, intro]), intro);
  assert.equal(findIntroOffer([threePack, dropIn]), threePack);
});

test("ignores offers that cannot be sold online", () => {
  assert.equal(findIntroOffer([dropIn, { ...intro, sellOnline: false }]), null);
});

test("lists the intro first", () => {
  assert.deepEqual(sortIntroOfferFirst([dropIn, intro]), [intro, dropIn]);
});

test("writes the headline and button for the offer", () => {
  assert.equal(introHeadline(intro), "2 weeks of unlimited reformer Pilates for $99");
  assert.equal(introHeadline(threePack), "3 reformer classes for $65");
  assert.equal(introButtonLabel(intro), "Claim my 2 weeks");
  assert.equal(introButtonLabel(threePack), "Claim my intro");
});
