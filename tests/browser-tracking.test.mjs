import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cartPurchaseEvents, recordConversion } from "../server/adConversions.mjs";

const source = await readFile(new URL("../src/tracking.js", import.meta.url), "utf8");
const config = { VITE_META_PIXEL_ID: "123", VITE_GOOGLE_ADS_ID: "AW-123", VITE_GOOGLE_ADS_INTRO_PURCHASE_LABEL: "intro", VITE_GOOGLE_ADS_PURCHASE_LABEL: "any", VITE_GOOGLE_ADS_SIGNUP_LABEL: "signup" };
const tracking = await import(`data:text/javascript;base64,${Buffer.from(source.replace("import.meta.env", JSON.stringify(config))).toString("base64")}`);

test("browser and server deduplicate the same discounted purchase and intro", async () => {
  const meta = [], google = [];
  globalThis.window = { fbq: (...args) => meta.push(args), gtag: (...args) => google.push(args) };
  const receipt = await recordConversion(() => cartPurchaseEvents({ items: [{ name: "New Client 3 Class Package", price: "$65", quantity: 1 }], total: 55.25, eventId: "receipt-123", email: "a@example.test" }), { env: {} });
  tracking.trackConversionReceipt(receipt, " A@Example.test ");
  assert.deepEqual(meta.map(e => [e[1], e[2].value, e[3].eventID]), [["Purchase", 55.25, "receipt-123"], ["NewClientPurchase", 55.25, "receipt-123-intro"]]);
  const conversions = google.filter(e => e[1] === "conversion");
  assert.deepEqual(conversions.map(e => [e[2].send_to, e[2].value]), [["AW-123/any", 55.25], ["AW-123/intro", 55.25]]);
  assert.deepEqual(google.at(-1), ["set", "user_data", null]);
  const gaPurchase = google.find(e => e[1] === "purchase");
  assert.equal(gaPurchase[2].transaction_id, "receipt-123");
  assert.doesNotMatch(JSON.stringify(gaPurchase), /a@example/);
  delete globalThis.window;
});

test("missing receipt produces no purchase and blocked tags cannot fail checkout", () => {
  let calls = 0;
  globalThis.window = { fbq: () => { calls++; throw new Error("blocked"); }, gtag: () => { calls++; throw new Error("blocked"); } };
  tracking.trackConversionReceipt(null);
  assert.equal(calls, 0);
  assert.doesNotThrow(() => tracking.trackConversionReceipt({ events: [{ name: "Purchase", id: "receipt-123", data: { value: 65 } }] }));
  delete globalThis.window;
});
