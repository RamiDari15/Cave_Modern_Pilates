import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { supportedMembershipQuote } from "../server/contract-catalog.mjs";

// Synthetic identity, contracts and provider. Never contact Mindbody or charge.
for (const key of Object.keys(process.env)) {
  if (/^(BOOKING_|MINDBODY_|SESSION_SECRET$|PUBLIC_BASE_URL$|SITE_URL$|VITE_SITE_URL$)/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: "test", SESSION_SECRET: "membership-checkout-test-secret",
  BOOKING_API_KEY: "test-key", BOOKING_SITE_ID: "test-studio", BOOKING_LOCATION_ID: "1",
  BOOKING_STAFF_TOKEN: "test-staff-token", MINDBODY_CONTRACT_PRICES_VERIFIED: "true"
});
const originalExistsSync = fs.existsSync;
const originalReadFileSync = fs.readFileSync;
const isEnvFile = (path) => [".env", ".env.local"].includes(basename(String(path)));
fs.existsSync = (path) => isEnvFile(path) ? false : originalExistsSync(path);
fs.readFileSync = (path, ...options) => isEnvFile(path) ? "" : originalReadFileSync(path, ...options);
syncBuiltinESMExports();
const { handleApiRequest } = await import("../server/api.mjs");
const originalFetch = globalThis.fetch;
const contract = {
  Id: 9001, Name: "Test 3 Month Membership", SoldOnline: true, AgreementTerms: "Exact test terms.\nRenews automatically.",
  AutopayEnabled: true, AutopayTriggerType: "OnSetSchedule",
  AutopaySchedule: { FrequencyType: "SetNumberOfAutopays", FrequencyValue: 1, FrequencyTimeUnit: "Monthly" },
  NumberOfAutopays: 3, ActionUponCompletionOfAutopays: "ContractAutomaticallyRenews", ClientsChargedOn: "OnSaleDate",
  FirstPaymentAmountTotal: 100, RecurringPaymentAmountTotal: 100, TotalContractAmountTotal: 300,
  DepositAmount: 0, DiscountAmount: 0, FirstAutopayFree: false, LastAutopayFree: false,
  NumberOfPromoAutopays: null, PromoPaymentAmountSubtotal: null, PromoPaymentAmountTax: null, PromoPaymentAmountTotal: null
};
const acceptedQuote = supportedMembershipQuote(contract);
let currentContracts = [contract];
let providerUnavailable = false;
let calls = [];
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  const call = { path: url.pathname, method: options.method || "GET", query: Object.fromEntries(url.searchParams), body: options.body ? JSON.parse(options.body) : null };
  calls.push(call);
  if (url.pathname.endsWith("/sale/services")) return Response.json({ Services: [] });
  if (url.pathname.endsWith("/sale/contracts")) {
    if (providerUnavailable) return Response.json({ Error: { Message: "Synthetic unavailable quote" } }, { status: 503 });
    return Response.json({ Contracts: currentContracts });
  }
  if (url.pathname.endsWith("/sale/purchasecontract")) return Response.json({ ContractId: 9001, TestFixture: true });
  throw new Error(`Unexpected mocked provider operation: ${call.method} ${call.path}`);
};

function cookie() {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(process.env.SESSION_SECRET).digest(), iv);
  const payload = { authMode: "created-client", clientId: "42", user: { email: "checkout-test@example.invalid" }, exp: Math.floor(Date.now() / 1000) + 300 };
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return `cave_session=${[iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".")}`;
}

async function request(body, path = "/api/pricing/contracts/purchase", method = "POST") {
  const req = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  Object.assign(req, { url: path, method, headers: { host: "localhost", origin: "http://localhost", cookie: cookie(), "content-type": "application/json" }, socket: { remoteAddress: "membership-checkout-test" } });
  const headers = new Map(); let output = "";
  const res = { statusCode: 200, setHeader(k, v) { headers.set(k.toLowerCase(), v); }, getHeader(k) { return headers.get(k.toLowerCase()); }, end(value = "") { output += value; } };
  await handleApiRequest(req, res);
  return { status: res.statusCode, body: JSON.parse(output) };
}

const appBody = (overrides = {}) => ({ checkoutVersion: 2, contractId: "9001", quote: { ...acceptedQuote }, acceptTerms: true, acceptWaiver: true, storedCardLastFour: "1234", ...overrides });
function reset() { calls = []; currentContracts = [contract]; providerUnavailable = false; process.env.MINDBODY_CONTRACT_PRICES_VERIFIED = "true"; }
function noCharge() { assert.equal(calls.filter((call) => call.method === "POST").length, 0); }

test("versioned membership checkout revalidates consent and provider quote before any charge", async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; fs.existsSync = originalExistsSync; fs.readFileSync = originalReadFileSync; syncBuiltinESMExports(); });

  await t.test("unchanged accepted quote is fetched immediately before the mocked purchase", async () => {
    reset(); const result = await request(appBody());
    assert.equal(result.status, 200);
    assert.deepEqual(calls.map(({ method, path }) => ({ method, path })), [
      { method: "GET", path: "/public/v6/sale/contracts" }, { method: "POST", path: "/public/v6/sale/purchasecontract" }
    ]);
    assert.equal(calls[0].query["request.contractIds"], "9001");
    assert.equal(calls[0].query["request.soldOnline"], "true");
    assert.equal(calls[0].query["request.locationId"], "1");
    assert.equal(calls[1].body.ClientId, "42");
    assert.equal(calls[1].body.ContractId, 9001);
    assert.deepEqual(calls[1].body.StoredCardInfo, { LastFour: "1234" });
    assert.equal(calls[1].body.quote, undefined);
    assert.equal(calls[1].body.Amount, undefined);
  });

  await t.test("both consents must be literal true before provider calls", async () => {
    for (const key of ["acceptTerms", "acceptWaiver"]) for (const value of [undefined, null, false, "true", 1]) {
      reset(); const result = await request(appBody({ [key]: value }));
      assert.equal(result.status, 400); assert.equal(result.body.code, "MEMBERSHIP_CONSENT_REQUIRED");
      assert.equal(calls.length, 0);
    }
  });

  await t.test("missing, changed or mistyped quote fields never produce a charge", async () => {
    for (const quote of [undefined, null, [], {}, ...Object.keys(acceptedQuote).flatMap((key) => [
      { ...acceptedQuote, [key]: undefined },
      { ...acceptedQuote, [key]: typeof acceptedQuote[key] === "number" ? acceptedQuote[key] + 1 : `${acceptedQuote[key]} changed` }
    ])]) {
      reset(); const result = await request(appBody({ quote }));
      assert.equal(result.status, 409); assert.equal(result.body.code, "MEMBERSHIP_QUOTE_CHANGED"); noCharge();
    }
  });

  await t.test("a fresh price, agreement, renewal or schedule change invalidates previously accepted terms", async () => {
    for (const change of [
      { AgreementTerms: contract.AgreementTerms + " Changed." },
      { FirstPaymentAmountTotal: 101, RecurringPaymentAmountTotal: 101, TotalContractAmountTotal: 303 },
      { NumberOfAutopays: 6, TotalContractAmountTotal: 600 },
      { ActionUponCompletionOfAutopays: "ContractExpires" },
      { AutopaySchedule: { ...contract.AutopaySchedule, FrequencyTimeUnit: "Weekly" } },
      { ClientsChargedOn: "FirstOfTheMonth" }, { SoldOnline: false }, { AgreementTerms: "" },
      { FirstPaymentAmountTotal: null }, { DepositAmount: 25 }, { DiscountAmount: 5 },
      { FirstAutopayFree: true }, { LastAutopayFree: true },
      { NumberOfPromoAutopays: 1, PromoPaymentAmountSubtotal: 50, PromoPaymentAmountTax: 0, PromoPaymentAmountTotal: 50 },
      { PromoPaymentAmountSubtotal: 0 }, { NumberOfPromoAutopays: "unknown" }
    ]) {
      reset(); currentContracts = [{ ...contract, ...change }]; const result = await request(appBody());
      assert.equal(result.status, 409, JSON.stringify(change)); noCharge();
    }
  });

  await t.test("missing, ambiguous or unavailable live contract fails closed", async () => {
    for (const contracts of [[], [{ ...contract, Id: 9999 }], [contract, contract]]) {
      reset(); currentContracts = contracts; assert.equal((await request(appBody())).status, 409); noCharge();
    }
    reset(); providerUnavailable = true; assert.equal((await request(appBody())).status, 409); noCharge();
  });

  await t.test("the existing global purchase flag still closes both app and legacy checkout", async () => {
    for (const body of [appBody(), { contractId: "9001", acceptTerms: true, storedCardLastFour: "1234" }]) {
      reset(); process.env.MINDBODY_CONTRACT_PRICES_VERIFIED = "false";
      const result = await request(body); assert.equal(result.status, 409); assert.equal(result.body.code, "MEMBERSHIP_PRICES_NOT_VERIFIED"); assert.equal(calls.length, 0);
    }
  });

  await t.test("catalog capability follows the existing flag even when pricing is cached", async () => {
    reset(); const first = await request(null, "/api/pricing/catalog", "GET");
    assert.equal(first.body.membershipCheckoutEnabled, true); const before = calls.length;
    process.env.MINDBODY_CONTRACT_PRICES_VERIFIED = "false";
    const second = await request(null, "/api/pricing/catalog", "GET");
    assert.equal(second.body.membershipCheckoutEnabled, false); assert.equal(calls.length, before);
    assert.deepEqual(second.body.catalog, first.body.catalog); noCharge();
  });

  await t.test("legacy website payload still follows its previous payment path", async () => {
    reset(); const result = await request({ contractId: "9001", acceptTerms: true, storedCardLastFour: "1234" });
    assert.equal(result.status, 200); assert.deepEqual(calls.map((call) => call.path), ["/public/v6/sale/purchasecontract"]);
  });

  await t.test("unknown checkout versions and raw card fields cannot bypass the app protocol", async () => {
    reset(); assert.equal((await request(appBody({ checkoutVersion: "2" }))).status, 400); assert.equal(calls.length, 0);
    reset(); assert.equal((await request(appBody({ cardNumber: "4111111111111111" }))).status, 400); noCharge();
  });
});
