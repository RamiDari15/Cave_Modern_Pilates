import assert from "node:assert/strict";
import test from "node:test";
import {
  KLAVIYO_API_REVISION,
  KLAVIYO_EMAIL_LIST_ID,
  KLAVIYO_PUBLIC_KEY,
  KLAVIYO_SMS_LIST_ID,
  CAVE_UPDATES_PROMPT_COOLDOWN_MS,
  createKlaviyoSubscriptionPayload,
  getCaveUpdatesPreferences,
  normalizeKlaviyoPhone,
  rememberCaveUpdatesPrompt,
  rememberCaveUpdatesSubscription,
  shouldShowCaveUpdatesPrompt,
  subscribeToCaveUpdates
} from "../src/klaviyoSignup.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

test("normalizes US and international phone numbers for Klaviyo", () => {
  assert.equal(normalizeKlaviyoPhone("(708) 555-0123"), "+17085550123");
  assert.equal(normalizeKlaviyoPhone("1-708-555-0123"), "+17085550123");
  assert.equal(normalizeKlaviyoPhone("+44 20 7946 0958"), "+442079460958");
  assert.equal(normalizeKlaviyoPhone("123"), "");
});

test("builds email-only consent without silently subscribing SMS", () => {
  const payload = createKlaviyoSubscriptionPayload({ email: " MEMBER@Example.com " });
  const attributes = payload.data.attributes.profile.data.attributes;

  assert.equal(attributes.email, "member@example.com");
  assert.equal(attributes.phone_number, undefined);
  assert.deepEqual(attributes.subscriptions, {
    email: { marketing: { consent: "SUBSCRIBED" } }
  });
  assert.equal(payload.data.relationships.list.data.id, KLAVIYO_EMAIL_LIST_ID);
});

test("adds SMS consent only when the visitor explicitly selects it", () => {
  const payload = createKlaviyoSubscriptionPayload({
    email: "member@example.com",
    phoneNumber: "+17085550123",
    channel: "sms"
  });
  const attributes = payload.data.attributes.profile.data.attributes;

  assert.equal(attributes.phone_number, "+17085550123");
  assert.deepEqual(attributes.subscriptions, {
    sms: { marketing: { consent: "SUBSCRIBED" } }
  });
  assert.equal(payload.data.relationships.list.data.id, KLAVIYO_SMS_LIST_ID);
});

test("posts the subscription through Klaviyo's public client endpoint", async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return { ok: true };
  };

  await subscribeToCaveUpdates({
    email: "member@example.com",
    fetchImpl
  });

  assert.equal(request.url, `https://a.klaviyo.com/client/subscriptions?company_id=${KLAVIYO_PUBLIC_KEY}`);
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.revision, KLAVIYO_API_REVISION);
  assert.equal(request.options.headers["Content-Type"], "application/vnd.api+json");
});

test("subscribes opted-in visitors to both the email and text lists", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true };
  };

  await subscribeToCaveUpdates({
    email: "member@example.com",
    phoneNumber: "+17085550123",
    includeSms: true,
    fetchImpl
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.data.relationships.list.data.id, KLAVIYO_EMAIL_LIST_ID);
  assert.equal(requests[1].body.data.relationships.list.data.id, KLAVIYO_SMS_LIST_ID);
  assert.equal(requests[1].body.data.attributes.profile.data.attributes.phone_number, "+17085550123");
});

test("limits the optional signup reminder to once per cooldown", () => {
  const storage = createMemoryStorage();
  const now = Date.UTC(2026, 8, 20);

  assert.equal(shouldShowCaveUpdatesPrompt({ storage, now }), true);
  rememberCaveUpdatesPrompt(storage, now);
  assert.equal(shouldShowCaveUpdatesPrompt({ storage, now: now + CAVE_UPDATES_PROMPT_COOLDOWN_MS - 1 }), false);
  assert.equal(shouldShowCaveUpdatesPrompt({ storage, now: now + CAVE_UPDATES_PROMPT_COOLDOWN_MS }), true);
});

test("stops prompting after a successful signup without storing contact details", () => {
  const storage = createMemoryStorage();

  rememberCaveUpdatesSubscription({ includeSms: true, storage });

  assert.deepEqual(getCaveUpdatesPreferences(storage), {
    emailSubscribed: true,
    smsSubscribed: true,
    lastPromptedAt: getCaveUpdatesPreferences(storage).lastPromptedAt
  });
  assert.equal(shouldShowCaveUpdatesPrompt({ storage }), false);
});
