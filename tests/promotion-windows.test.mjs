import test from "node:test";
import assert from "node:assert/strict";

import {
  isBackToSchoolPromotionActive,
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

test("shows the October package only from October 1 through October 31 in Chicago (studio) time", () => {
  assert.equal(isPricingItemCurrentlyVisible(promotion, OCTOBER_PACKAGE_WINDOW.startsAt - 1), false);
  assert.equal(isPricingItemCurrentlyVisible(promotion, OCTOBER_PACKAGE_WINDOW.startsAt), true);
  assert.equal(isPricingItemCurrentlyVisible(promotion, OCTOBER_PACKAGE_WINDOW.endsAt - 1), true);
  assert.equal(isPricingItemCurrentlyVisible(promotion, OCTOBER_PACKAGE_WINDOW.endsAt), false);
});

test("does not date-limit normal pricing items", () => {
  assert.equal(isPricingItemCurrentlyVisible({ name: "10 Class Pack" }, 0), true);
});

test("October package starts at midnight Central, not Eastern", () => {
  assert.equal(OCTOBER_PACKAGE_WINDOW.startsAt, Date.parse("2026-10-01T05:00:00Z"));
  assert.equal(isPricingItemCurrentlyVisible(promotion, Date.parse("2026-10-01T04:30:00Z")), false);
});

test("BACKTOSCHOOL15 runs Sept 1 through Sept 30 Central time only", () => {
  assert.equal(isBackToSchoolPromotionActive(Date.parse("2026-08-31T23:59:00-05:00")), false);
  assert.equal(isBackToSchoolPromotionActive(Date.parse("2026-09-01T00:00:00-05:00")), true);
  assert.equal(isBackToSchoolPromotionActive(Date.parse("2026-09-30T23:59:00-05:00")), true);
  assert.equal(isBackToSchoolPromotionActive(Date.parse("2026-10-01T00:00:00-05:00")), false);
  assert.equal(isBackToSchoolPromotionActive(new Date("2026-12-15T12:00:00Z")), false);
});
