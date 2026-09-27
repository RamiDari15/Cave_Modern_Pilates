import test from "node:test";
import assert from "node:assert/strict";

import {
  isOctoberBuyThreeGetOnePackage,
  isPricingItemCurrentlyVisible,
  OCTOBER_PACKAGE_WINDOW
} from "../src/promotionWindows.js";

const promotion = { name: "Buy 3 Classes, Get 1 Free" };

test("recognizes the October package despite punctuation and spacing", () => {
  assert.equal(isOctoberBuyThreeGetOnePackage(promotion), true);
  assert.equal(isOctoberBuyThreeGetOnePackage({ sourceName: "BUY 3 CLASS GET 1 FREE" }), true);
  assert.equal(isOctoberBuyThreeGetOnePackage({ name: "10 Class Pack" }), false);
});

test("shows the October package only from October 1 through October 31 in Detroit", () => {
  assert.equal(isPricingItemCurrentlyVisible(promotion, OCTOBER_PACKAGE_WINDOW.startsAt - 1), false);
  assert.equal(isPricingItemCurrentlyVisible(promotion, OCTOBER_PACKAGE_WINDOW.startsAt), true);
  assert.equal(isPricingItemCurrentlyVisible(promotion, OCTOBER_PACKAGE_WINDOW.endsAt - 1), true);
  assert.equal(isPricingItemCurrentlyVisible(promotion, OCTOBER_PACKAGE_WINDOW.endsAt), false);
});

test("does not date-limit normal pricing items", () => {
  assert.equal(isPricingItemCurrentlyVisible({ name: "10 Class Pack" }, 0), true);
});
