import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMetaEvent,
  cartPurchaseEvents,
  cleanEventId,
  hashForMeta,
  isNewClientItemName,
  sendMetaEvents,
  recordConversion
} from "../server/adConversions.mjs";

const request = {
  headers: {
    cookie: "_fbp=fb.1.123.456; other=1",
    "x-forwarded-for": "203.0.113.9, 10.0.0.1",
    "user-agent": "TestAgent",
    referer: "https://www.cavemodernpilates.com/newbie"
  }
};

test("hashes email the way Meta expects", () => {
  assert.equal(hashForMeta("  Client@Example.com "), hashForMeta("client@example.com"));
  assert.match(hashForMeta("client@example.com"), /^[a-f0-9]{64}$/);
  assert.equal(hashForMeta(""), undefined);
});

test("keeps a valid browser event ID and replaces a bad one", () => {
  assert.equal(cleanEventId("3f1c9a2e-0000-4000-8000-000000000000"), "3f1c9a2e-0000-4000-8000-000000000000");
  assert.notEqual(cleanEventId("<script>"), "<script>");
});

test("recognizes new client items", () => {
  assert.equal(isNewClientItemName("New Client 3 Class Package"), true);
  assert.equal(isNewClientItemName("10 Class Pack"), false);
});

test("builds a purchase event with hashed email and request context", () => {
  const event = buildMetaEvent({ eventName: "Purchase", eventId: "abcdef12-3456", value: 65, contentName: "New Client 3 Class Package", email: "a@b.com", externalId: "100123", request, now: 1_700_000_000_000 });
  assert.equal(event.event_name, "Purchase");
  assert.equal(event.event_id, "abcdef12-3456");
  assert.equal(event.event_time, 1_700_000_000);
  assert.equal(event.action_source, "website");
  assert.equal(event.event_source_url, "https://www.cavemodernpilates.com/newbie");
  assert.deepEqual(event.user_data.em, [hashForMeta("a@b.com")]);
  assert.equal(event.user_data.client_ip_address, "203.0.113.9");
  assert.equal(event.user_data.fbp, "fb.1.123.456");
  assert.equal(event.user_data.ph, undefined);
  assert.deepEqual(event.custom_data, { currency: "USD", value: 65, content_name: "New Client 3 Class Package" });
});

test("a new client item adds a NewClientPurchase event with a matching ID", () => {
  const events = cartPurchaseEvents({
    items: [{ name: "New Client 3 Class Package", price: "$65.00", quantity: 1 }],
    total: 65,
    eventId: "abcdef12-3456",
    email: "a@b.com",
    request
  });
  assert.deepEqual(events.map((event) => event.event_name), ["Purchase", "NewClientPurchase"]);
  assert.equal(events[1].event_id, "abcdef12-3456-intro");
  assert.equal(events[1].custom_data.value, 65);
});

test("regular purchases send only Purchase", () => {
  const events = cartPurchaseEvents({ items: [{ name: "10 Class Pack", price: "$289.00", quantity: 1 }], total: 289, eventId: "abcdef12-3456", request });
  assert.deepEqual(events.map((event) => event.event_name), ["Purchase"]);
});

test("does nothing without Meta credentials", async () => {
  let called = false;
  const result = await sendMetaEvents([{}], { env: {}, fetchImpl: async () => { called = true; } });
  assert.equal(result.sent, false);
  assert.equal(called, false);
});

test("posts events to the Meta dataset when configured", async () => {
  let captured;
  const result = await sendMetaEvents([{ event_name: "Purchase" }], {
    env: { META_PIXEL_ID: "123", META_CAPI_ACCESS_TOKEN: "tok", META_CAPI_TEST_EVENT_CODE: "TEST1" },
    fetchImpl: async (url, options) => { captured = { url, body: JSON.parse(options.body) }; return { ok: true }; }
  });
  assert.equal(result.sent, true);
  assert.match(captured.url, /graph\.facebook\.com\/v21\.0\/123\/events\?access_token=tok$/);
  assert.equal(captured.body.test_event_code, "TEST1");
  assert.equal(captured.body.data[0].event_name, "Purchase");
});

test("a Meta outage never throws into checkout", async () => {
  const result = await sendMetaEvents([{ event_name: "Purchase" }], {
    env: { META_PIXEL_ID: "123", META_CAPI_ACCESS_TOKEN: "tok" },
    fetchImpl: async () => { throw new Error("network down"); }
  });
  assert.equal(result.sent, false);
});


test("malformed cookies cannot break conversion construction and query data is excluded", () => {
  const event = buildMetaEvent({ eventName: "Purchase", eventId: "receipt-123", value: 0,
    request: { headers: { cookie: "bad=%E0%A4%A; _fbp=fb.1.2.3", referer: "https://www.cavemodernpilates.com/newbie?email=private@example.test#private" } } });
  assert.equal(event.custom_data.value, 0);
  assert.equal(event.event_source_url, "https://www.cavemodernpilates.com/newbie");
  assert.equal(event.user_data.fbp, "fb.1.2.3");
});

test("discounted intro value follows the completed charge, not display prices", () => {
  const events = cartPurchaseEvents({ items: [{ name: "New Client 3 Class Package", price: "$65", quantity: 1 }], total: 55.25, eventId: "discount-123", request });
  assert.equal(events[0].custom_data.value, 55.25);
  assert.equal(events[1].custom_data.value, 55.25);
});

test("payload construction failure does not escape into checkout", async () => {
  assert.equal(await recordConversion(() => { throw new Error("malformed input"); }, { env: {} }), null);
});

test("receipt shares server event IDs/values without exposing hashed customer data", async () => {
  let serverEvents;
  const receipt = await recordConversion(() => cartPurchaseEvents({ items: [{ name: "New Client 3 Class Package", price: "$65", quantity: 1 }], total: 55.25, eventId: "receipt-123", email: "private@example.test", request }), {
    env: { META_PIXEL_ID: "123", META_CAPI_ACCESS_TOKEN: "test" },
    fetchImpl: async (url, options) => { serverEvents = JSON.parse(options.body).data; return { ok: true }; }
  });
  assert.deepEqual(receipt.events.map(e => e.id), serverEvents.map(e => e.event_id));
  assert.deepEqual(receipt.events.map(e => e.data.value), [55.25, 55.25]);
  assert.doesNotMatch(JSON.stringify(receipt), /user_data|private|client_ip|fbp/);
});

test("Mindbody sandbox purchases never produce ad conversions", async () => {
  let built = false;
  assert.equal(await recordConversion(() => { built = true; return []; }, { env: { BOOKING_TEST_MODE: "true" } }), null);
  assert.equal(built, false);
});
