import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { detectInAppBrowser, externalBrowserUrl, mindbodyPricingOptionUrl } from "../src/inAppBrowser.js";

// Synthetic credentials and mocked Mindbody only. No real client is created.
for (const key of Object.keys(process.env)) {
  if (/^(BOOKING_|MINDBODY_|META_|SESSION_SECRET$|PUBLIC_BASE_URL$|SITE_URL$|VITE_SITE_URL$)/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: "test",
  SESSION_SECRET: "new-client-test-session-secret",
  BOOKING_API_KEY: "new-client-test-api-key",
  BOOKING_SITE_ID: "new-client-test-studio",
  BOOKING_STAFF_TOKEN: "new-client-test-staff-token"
});

const { handleApiRequest } = await import("../server/api.mjs");
const originalFetch = globalThis.fetch;
let calls = [];
let existingClients = [];
let searchFails = false;
let createError = null;

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  const body = options.body && String(options.body).startsWith("{") ? JSON.parse(options.body) : null;
  calls.push({ path: url.pathname, method: options.method || "GET", body, params: Object.fromEntries(url.searchParams) });
  if (url.pathname.endsWith("/usertoken/issue")) return Response.json({ AccessToken: "new-client-test-user-token", Expires: new Date(Date.now() + 3600_000).toISOString() });
  if (url.pathname.endsWith("/client/clients")) {
    if (searchFails) return Response.json({ Error: { Message: "Search unavailable." } }, { status: 503 });
    return Response.json({ Clients: existingClients });
  }
  if (/\/client\/(addorupdateclient|addclient)$/.test(url.pathname)) {
    if (createError) return Response.json({ Error: { Message: createError } }, { status: 400 });
    return Response.json({ Client: { ...(body.Client || body), Id: "100777" } });
  }
  if (url.pathname.endsWith("/client/updateclient")) {
    return Response.json({ Client: { ...body.Client, LiabilityRelease: true, Liability: { IsReleased: true } } });
  }
  if (url.pathname.endsWith("/client/clientcompleteinfo")) {
    return Response.json({ Client: { Id: "100777", Email: "new.client@example.invalid", FirstName: "New", LastName: "Client", Active: true, ClientCreditCard: null } });
  }
  throw new Error(`Unexpected mocked upstream request: ${options.method || "GET"} ${url.pathname}`);
};

let ipCounter = 0;
async function request(path, { method = "POST", body, cookie = "", origin = "http://localhost" } = {}) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  req.url = path;
  req.method = method;
  req.headers = { host: "localhost", origin, cookie, "content-type": "application/json" };
  req.socket = { remoteAddress: `new-client-test-${ipCounter++}` };
  const headers = new Map();
  let output = "";
  const res = {
    statusCode: 200,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    end(value = "") { output += value; }
  };
  await handleApiRequest(req, res);
  return { status: res.statusCode, headers, body: output ? JSON.parse(output) : null };
}

function sessionCookie(result) {
  const raw = result.headers.get("set-cookie") || [];
  return (Array.isArray(raw) ? raw : [raw])
    .map((cookie) => cookie.split(";")[0])
    .filter((cookie) => /^cave_session(?:_\d+)?=.+/.test(cookie))
    .join("; ");
}

const valid = { firstName: "New", lastName: "Client", email: "New.Client@Example.invalid", phone: "(708) 555-0123", acceptWaiver: true, returnTo: "/black-friday?buy=service-100066" };

test("new client express checkout", async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; });
  t.beforeEach(() => { calls = []; existingClients = []; searchFails = false; createError = null; });

  await t.test("creates the Mindbody client, signs the waiver and starts a session that can pay", async () => {
    const result = await request("/api/auth/new-client", { body: valid });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.session.signedIn, true);
    assert.equal(result.body.session.clientId, "100777");
    assert.equal(result.body.session.authMode, "created-client");

    const created = calls.find((call) => /addorupdateclient|addclient/.test(call.path));
    assert.equal(created.body.Client.Email, "new.client@example.invalid");
    assert.equal(created.body.Client.MobilePhone, "7085550123");
    assert.equal(created.body.Client.FirstName, "New");
    const waiver = calls.find((call) => call.path.endsWith("/client/updateclient"));
    assert.equal(waiver.body.Client.Id, "100777");
    assert.equal(waiver.body.Client.LiabilityRelease, true);

    const cookie = sessionCookie(result);
    assert.ok(cookie, "session cookie set");
    const session = await request("/api/auth/session", { method: "GET", cookie });
    assert.equal(session.body.session.clientId, "100777");

    const cardCheck = await request("/api/account/payment-card", { method: "GET", cookie });
    assert.equal(cardCheck.status, 200, JSON.stringify(cardCheck.body));
    assert.equal(cardCheck.body.ready, true);

    const cards = await request("/api/client/saved-cards", { method: "GET", cookie });
    assert.equal(cards.status, 200);
    assert.deepEqual(cards.body.cards, []);
  });

  await t.test("an email that already has a studio client never gets a session", async () => {
    existingClients = [{ Id: "55", Email: "new.client@example.invalid" }];
    const result = await request("/api/auth/new-client", { body: valid });
    assert.equal(result.status, 409);
    assert.equal(result.body.clientExists, true);
    assert.match(result.body.loginUrl, /^\/api\/auth\/start\?returnTo=/);
    assert.equal(sessionCookie(result), "");
    assert.equal(calls.some((call) => /addorupdateclient|addclient/.test(call.path)), false);
  });

  await t.test("a failed account search stops before creating a duplicate", async () => {
    searchFails = true;
    const result = await request("/api/auth/new-client", { body: valid });
    assert.ok(result.status >= 500, `status ${result.status}`);
    assert.equal(calls.some((call) => /addorupdateclient|addclient/.test(call.path)), false);
    assert.equal(sessionCookie(result), "");
  });

  await t.test("Mindbody duplicate errors send the buyer to sign in", async () => {
    createError = "Client creation cannot result in duplicate client records.";
    const result = await request("/api/auth/new-client", { body: valid });
    assert.equal(result.status, 409);
    assert.equal(result.body.clientExists, true);
    assert.equal(sessionCookie(result), "");
  });

  await t.test("missing fields and waiver are rejected without calling Mindbody", async () => {
    for (const body of [{ ...valid, firstName: "" }, { ...valid, email: "nope" }, { ...valid, phone: "123" }, { ...valid, acceptWaiver: false }]) {
      const result = await request("/api/auth/new-client", { body });
      assert.equal(result.status, 400);
    }
    assert.equal(calls.length, 0);
  });

  await t.test("cross-site posts are refused", async () => {
    const result = await request("/api/auth/new-client", { body: valid, origin: "https://evil.example" });
    assert.equal(result.status, 403);
    assert.equal(calls.length, 0);
  });
});

test("in-app browser detection", () => {
  assert.deepEqual(detectInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0"), { app: "Instagram", platform: "ios" });
  assert.deepEqual(detectInAppBrowser("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.0;]"), { app: "Facebook", platform: "android" });
  assert.equal(detectInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"), null);
  assert.equal(externalBrowserUrl("https://www.cavemodernpilates.com/black-friday#newbie", "ios"), "x-safari-https://www.cavemodernpilates.com/black-friday#newbie");
  assert.match(externalBrowserUrl("https://www.cavemodernpilates.com/black-friday", "android"), /^intent:\/\/www\.cavemodernpilates\.com\/black-friday#Intent;scheme=https;package=com\.android\.chrome;/);
  assert.equal(mindbodyPricingOptionUrl("100066"), "https://clients.mindbodyonline.com/classic/ws?studioid=5753835&stype=40&prodid=100066");
});
