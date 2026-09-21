import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { normalizeMindbodyContract } from "../server/contract-catalog.mjs";

// Synthetic test-only record with the documented Mindbody Public API v6 shape.
const monthlyContract = {
  Id: 9001,
  Name: "Test membership — six monthly payments",
  Description: "Test fixture only",
  SoldOnline: true,
  ContractItems: [{ Name: "Test classes", Price: 999 }],
  AgreementTerms: "<p>Test agreement &amp; conditions.</p>\n<p>Six monthly payments.</p>",
  RequiresElectronicConfirmation: true,
  AutopayEnabled: true,
  AutopayTriggerType: "OnSetSchedule",
  AutopaySchedule: { FrequencyType: "SetNumberOfAutopays", FrequencyValue: 1, FrequencyTimeUnit: "Monthly" },
  NumberOfAutopays: 6,
  ActionUponCompletionOfAutopays: "ContractAutomaticallyRenews",
  ClientsChargedOn: "OnSaleDate",
  FirstPaymentAmountSubtotal: 100,
  FirstPaymentAmountTax: 5,
  FirstPaymentAmountTotal: 105,
  RecurringPaymentAmountSubtotal: 100,
  RecurringPaymentAmountTax: 5,
  RecurringPaymentAmountTotal: 105,
  TotalContractAmountSubtotal: 600,
  TotalContractAmountTax: 30,
  TotalContractAmountTotal: 630,
  PromoPaymentAmountSubtotal: 0,
  PromoPaymentAmountTax: 0,
  PromoPaymentAmountTotal: 0,
  NumberOfPromoAutopays: 0,
  DepositAmount: 0,
  DiscountAmount: 0,
  FirstAutopayFree: false,
  LastAutopayFree: false
};

test("a monthly contract retains the exact terms, recurrence, tax, renewal and initial-term amounts", () => {
  const result = normalizeMindbodyContract(monthlyContract);
  assert.equal(result.agreementTerms, monthlyContract.AgreementTerms);
  assert.equal(result.contractDetailsSource, "mindbody");
  assert.equal(result.price, "$105.00");
  assert.equal(result.firstPaymentAmountTotal, 105);
  assert.equal(result.recurringPaymentAmountSubtotal, 100);
  assert.equal(result.recurringPaymentAmountTax, 5);
  assert.equal(result.recurringPaymentAmountTotal, 105);
  assert.equal(result.totalContractAmountTotal, 630);
  assert.equal(result.numberOfAutopays, 6);
  assert.equal(result.commitmentMonths, 6);
  assert.equal(result.billingPeriod, "month");
  assert.equal(result.billingInterval, 1);
  assert.equal(result.actionUponCompletionOfAutopays, "ContractAutomaticallyRenews");
  assert.equal(result.requiresElectronicConfirmation, true);
  assert.equal(result.depositAmount, 0);
  assert.equal(result.numberOfPromoAutopays, 0);
  assert.equal(result.firstAutopayFree, false);
});

test("weekly, annual, usage-triggered, disabled and unknown schedules never become monthly commitments", () => {
  const variants = [
    { AutopaySchedule: { ...monthlyContract.AutopaySchedule, FrequencyTimeUnit: "Weekly" } },
    { AutopaySchedule: { ...monthlyContract.AutopaySchedule, FrequencyTimeUnit: "Yearly" } },
    { AutopaySchedule: { ...monthlyContract.AutopaySchedule, FrequencyTimeUnit: null } },
    { AutopaySchedule: { ...monthlyContract.AutopaySchedule, FrequencyValue: null } },
    { AutopaySchedule: null },
    { AutopayTriggerType: "PricingOptionRunsOutOrExpires" },
    { AutopayTriggerType: undefined },
    { AutopayEnabled: false },
    { AutopayEnabled: undefined },
    { AutopayEnabled: "true" }
  ];
  for (const override of variants) {
    assert.equal(normalizeMindbodyContract({ ...monthlyContract, ...override }).commitmentMonths, null, JSON.stringify(override));
  }
  const quarterly = normalizeMindbodyContract({ ...monthlyContract, AutopaySchedule: { ...monthlyContract.AutopaySchedule, FrequencyValue: 3 } });
  assert.equal(quarterly.billingInterval, 3);
  assert.equal(quarterly.commitmentMonths, 18);
});

test("month-to-month explicitly has monthly billing but no invented finite term", () => {
  const result = normalizeMindbodyContract({
    ...monthlyContract,
    NumberOfAutopays: null,
    AutopaySchedule: { FrequencyType: "MonthToMonth", FrequencyValue: null, FrequencyTimeUnit: null }
  });
  assert.equal(result.billingPeriod, "month");
  assert.equal(result.billingInterval, 1);
  assert.equal(result.numberOfAutopays, null);
  assert.equal(result.commitmentMonths, null);
});

test("unknown amounts and terms remain unknown; an old contract ID or total is not a monthly price", () => {
  const result = normalizeMindbodyContract({ Id: 101, Name: "4 Class Membership-3 Month Contract", NumberOfAutopays: 3, AutopayEnabled: true, TotalContractAmountTotal: 417 });
  assert.equal(result.price, "");
  assert.equal(result.recurringPaymentAmountTotal, null);
  assert.equal(result.firstPaymentAmountTotal, null);
  assert.equal(result.totalContractAmountTotal, 417);
  assert.equal(result.agreementTerms, "");
  assert.equal(result.depositAmount, null);
  assert.equal(result.numberOfPromoAutopays, null);
  assert.equal(result.firstAutopayFree, null);
  assert.equal(result.commitmentMonths, null);
});

test("zero, promotional payments, deposits and first-payment differences survive without invented totals", () => {
  const result = normalizeMindbodyContract({ ...monthlyContract, RecurringPaymentAmountTotal: 0, FirstPaymentAmountTotal: 20, DepositAmount: 20, PromoPaymentAmountTotal: 50, NumberOfPromoAutopays: 2, FirstAutopayFree: true, TotalContractAmountTotal: null });
  assert.equal(result.price, "$0.00");
  assert.equal(result.recurringPaymentAmountTotal, 0);
  assert.equal(result.firstPaymentAmountTotal, 20);
  assert.equal(result.depositAmount, 20);
  assert.equal(result.promoPaymentAmountTotal, 50);
  assert.equal(result.numberOfPromoAutopays, 2);
  assert.equal(result.firstAutopayFree, true);
  assert.equal(result.totalContractAmountTotal, null);
});

test("malformed, negative, nonfinite and fractional count values do not become billable amounts or terms", () => {
  for (const invalid of [undefined, null, "", " ", false, true, {}, [], "-1", -1, "NaN", NaN, Infinity, "$105.00"]) {
    const result = normalizeMindbodyContract({ ...monthlyContract, RecurringPaymentAmountTotal: invalid });
    assert.equal(result.price, "", String(invalid));
    assert.equal(result.recurringPaymentAmountTotal, null);
  }
  for (const invalid of [0, 1.5, -1, "3 months", Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(normalizeMindbodyContract({ ...monthlyContract, NumberOfAutopays: invalid }).commitmentMonths, null);
  }
  assert.equal(normalizeMindbodyContract({ ...monthlyContract, RecurringPaymentAmountTotal: "105.00" }).price, "$105.00");
});

test("the public pricing route passes live agreement and billing fields through without customer operations", async (t) => {
  const originalExistsSync = fs.existsSync;
  const originalReadFileSync = fs.readFileSync;
  const originalFetch = globalThis.fetch;
  const isEnvFile = (path) => [".env", ".env.local"].includes(basename(String(path)));
  fs.existsSync = (path) => isEnvFile(path) ? false : originalExistsSync(path);
  fs.readFileSync = (path, ...options) => isEnvFile(path) ? "" : originalReadFileSync(path, ...options);
  syncBuiltinESMExports();
  const replacedEnv = new Map();
  for (const key of Object.keys(process.env)) {
    if (/^(BOOKING_|MINDBODY_|SESSION_SECRET$)/.test(key)) {
      replacedEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  }
  Object.assign(process.env, { BOOKING_API_KEY: "test-api-key", BOOKING_STAFF_TOKEN: "test-staff-token", BOOKING_SITE_ID: "test-site" });
  const calls = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ path: url.pathname, method: options.method || "GET" });
    if (url.pathname.endsWith("/sale/services")) return Response.json({ Services: [] });
    if (url.pathname.endsWith("/sale/contracts")) return Response.json({ Contracts: [monthlyContract, { ...monthlyContract, Id: 9002, SoldOnline: false }] });
    throw new Error(`Unexpected upstream request ${url.pathname}`);
  };
  t.after(() => {
    fs.existsSync = originalExistsSync;
    fs.readFileSync = originalReadFileSync;
    syncBuiltinESMExports();
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (/^(BOOKING_|MINDBODY_|SESSION_SECRET$)/.test(key)) delete process.env[key];
    for (const [key, value] of replacedEnv) process.env[key] = value;
  });
  const { handleApiRequest } = await import("../server/api.mjs");
  const req = Readable.from([]);
  Object.assign(req, { url: "/api/pricing/catalog", method: "GET", headers: { host: "localhost" }, socket: { remoteAddress: "contract-catalog-test" } });
  const headers = new Map();
  let output = "";
  const res = { statusCode: 200, setHeader(name, value) { headers.set(name.toLowerCase(), value); }, getHeader(name) { return headers.get(name.toLowerCase()); }, end(value = "") { output += value; } };
  await handleApiRequest(req, res);
  assert.equal(res.statusCode, 200);
  const catalog = JSON.parse(output).catalog;
  assert.equal(catalog.memberships.length, 1);
  assert.equal(catalog.memberships[0].id, "9001");
  assert.equal(catalog.memberships[0].agreementTerms, monthlyContract.AgreementTerms);
  assert.equal(catalog.memberships[0].billingPeriod, "month");
  assert.equal(catalog.memberships[0].recurringPaymentAmountTotal, 105);
  assert.equal(catalog.memberships[0].totalContractAmountTotal, 630);
  assert.deepEqual(calls, [{ path: "/public/v6/sale/services", method: "GET" }, { path: "/public/v6/sale/contracts", method: "GET" }]);
});
