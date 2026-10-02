import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
// Synthetic identity, contracts and provider. Never contact Mindbody or charge.
for (const key of Object.keys(process.env)) {
  if (/^(BOOKING_|MINDBODY_|META_|SESSION_SECRET$|PUBLIC_BASE_URL$|SITE_URL$|VITE_SITE_URL$)/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: "test", SESSION_SECRET: "tracking-checkout-test-secret",
  BOOKING_API_KEY: "test-key", BOOKING_SITE_ID: "test-studio", BOOKING_LOCATION_ID: "1",
  BOOKING_STAFF_TOKEN: "test-staff-token", MINDBODY_CONTRACT_PRICES_VERIFIED: "true", META_PIXEL_ID: "test-pixel", META_CAPI_ACCESS_TOKEN: "test-token"
});
const originalExistsSync = fs.existsSync;
const originalReadFileSync = fs.readFileSync;
const isEnvFile = (path) => [".env", ".env.local"].includes(basename(String(path)));
fs.existsSync = (path) => isEnvFile(path) ? false : originalExistsSync(path);
fs.readFileSync = (path, ...options) => isEnvFile(path) ? "" : originalReadFileSync(path, ...options);
syncBuiltinESMExports();
const { handleApiRequest } = await import("../server/api.mjs");
const originalFetch = globalThis.fetch;

let decline = false, metaUnavailable = false, metaEvents = [], charges = 0;
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  const body = options.body ? JSON.parse(options.body) : {};
  if (url.hostname === "graph.facebook.com") {
    metaEvents.push(...body.data);
    if (metaUnavailable) throw new Error("Synthetic Meta outage");
    return Response.json({ events_received: body.data.length });
  }
  if (url.pathname.endsWith("/sale/checkoutshoppingcart")) {
    if (body.Test) return Response.json({ ShoppingCart: { GrandTotal: 55.25 } });
    charges++;
    return Response.json(decline ? { PaymentProcessingFailures: [{ Message: "Card declined" }] } : { ShoppingCart: { GrandTotal: 55.25, Id: "sale-42" } });
  }
  if (url.pathname.endsWith("/sale/giftcards")) return Response.json({ GiftCards: [{ Id: 1, CardValue: 100, SalePrice: 90, Layouts: [{ Id: 1 }] }] });
  if (url.pathname.endsWith("/sale/purchasegiftcard")) {
    charges++;
    return Response.json(decline ? { PaymentProcessingFailures: [{ Message: "Card declined" }] } : { GiftCardId: 1 });
  }
  if (url.pathname.endsWith("/sale/purchasecontract")) {
    charges++;
    return Response.json(decline ? { PaymentProcessingFailures: [{ Message: "Card declined" }] } : { ContractId: 1, GrandTotal: 100 });
  }
  throw new Error(`Unexpected mock request ${url.pathname}`);
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
  Object.assign(req, { url: path, method, headers: { host: "localhost", origin: "http://localhost", cookie: cookie(), "content-type": "application/json" }, socket: { remoteAddress: "tracking-checkout-test" } });
  const headers = new Map(); let output = "";
  const res = { statusCode: 200, setHeader(k, v) { headers.set(k.toLowerCase(), v); }, getHeader(k) { return headers.get(k.toLowerCase()); }, end(value = "") { output += value; } };
  await handleApiRequest(req, res);
  return { status: res.statusCode, body: JSON.parse(output) };
}


const cartBody = { items: [{ id: "100007", kind: "service", name: "untrusted client name", price: "$65", quantity: 1 }], storedCardLastFour: "1234", trackingEventId: "checkout-123" };
function reset() { decline = false; metaUnavailable = false; metaEvents = []; charges = 0; }

test("checkout integration with fake payment provider only", async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; fs.existsSync = originalExistsSync; fs.readFileSync = originalReadFileSync; syncBuiltinESMExports(); });
  await t.test("successful cart reports actual total, trusted item name, and matching receipt IDs", async () => {
    reset(); const result = await request(cartBody, "/api/cart/checkout");
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(charges, 1);
    assert.equal(result.body.chargedTotal, 55.25);
    assert.deepEqual(metaEvents.map(e => [e.event_name, e.custom_data.value]), [["Purchase", 55.25], ["NewClientPurchase", 55.25]]);
    assert.deepEqual(result.body.tracking.events.map(e => e.id), metaEvents.map(e => e.event_id));
    assert.doesNotMatch(JSON.stringify(metaEvents), /untrusted client name/);
  });
  await t.test("declined checkout sends no purchase events", async () => {
    reset(); decline = true;
    const result = await request(cartBody, "/api/cart/checkout");
    assert.equal(result.status, 402);
    assert.equal(metaEvents.length, 0);
    assert.equal(result.body.tracking, undefined);
  });
  await t.test("Meta outage leaves one completed charge and a usable browser receipt", async () => {
    reset(); metaUnavailable = true;
    const result = await request(cartBody, "/api/cart/checkout");
    assert.equal(result.status, 200);
    assert.equal(charges, 1);
    assert.equal(result.body.tracking.events[0].data.value, 55.25);
  });
  await t.test("legacy store checkout tracks only a successful provider charge", async () => {
    reset();
    const body = { itemId: "100007", kind: "service", acceptWaiver: true, storedCardLastFour: "1234", trackingEventId: "store-123" };
    const result = await request(body, "/api/store/purchase");
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(metaEvents[0].custom_data.value, 55.25);
    assert.equal(metaEvents[1].event_name, "NewClientPurchase");
    reset(); decline = true;
    assert.equal((await request(body, "/api/store/purchase")).status, 402);
    assert.equal(metaEvents.length, 0);
  });
  await t.test("gift-card revenue uses sale price and never sends recipient details", async () => {
    reset();
    const body = { giftCardId: 1, layoutId: 1, storedCardLastFour: "1234", recipientName: "Gift Recipient", recipientEmail: "recipient@example.invalid", deliveryDate: "2099-01-01", trackingEventId: "giftcard-123" };
    const result = await request(body, "/api/gift-cards/purchase");
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(metaEvents.length, 1);
    assert.equal(metaEvents[0].custom_data.value, 90);
    assert.doesNotMatch(JSON.stringify(metaEvents), /recipient@example|Gift Recipient/);
    reset(); decline = true;
    const rejected = await request(body, "/api/gift-cards/purchase");
    assert.notEqual(rejected.status, 200);
    assert.equal(metaEvents.length, 0);
  });
  await t.test("membership records purchase and subscription only after success", async () => {
    reset(); const result = await request({ contractId: 1, acceptTerms: true, storedCardLastFour: "1234", trackingEventId: "membership-123" });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.deepEqual(metaEvents.map(e => e.event_name), ["Purchase", "Subscribe"]);
    assert.equal(metaEvents[0].custom_data.value, 100);
    reset(); decline = true;
    const rejected = await request({ contractId: 1, acceptTerms: true, storedCardLastFour: "1234" });
    assert.equal(rejected.status, 402);
    assert.equal(metaEvents.length, 0);
  });
});
