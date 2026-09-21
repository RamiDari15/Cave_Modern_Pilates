import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

// Use only synthetic credentials and mocked upstream responses. No Mindbody
// client is created or changed by this suite.
for (const key of Object.keys(process.env)) {
  if (/^(BOOKING_|MINDBODY_|SESSION_SECRET$|PUBLIC_BASE_URL$|SITE_URL$|VITE_SITE_URL$)/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: "test",
  SESSION_SECRET: "signup-phone-test-session-secret",
  BOOKING_API_KEY: "signup-phone-test-api-key",
  BOOKING_SITE_ID: "signup-phone-test-studio",
  BOOKING_STAFF_TOKEN: "signup-phone-test-staff-token",
  BOOKING_OAUTH_CLIENT_ID: "signup-phone-test-oauth-client",
  BOOKING_OAUTH_CLIENT_SECRET: "signup-phone-test-oauth-secret",
  BOOKING_OAUTH_REDIRECT_URI: "http://localhost/api/auth/callback",
  BOOKING_OAUTH_AUTHORIZE_URL: "https://signin.example.invalid/authorize",
  BOOKING_OAUTH_TOKEN_URL: "https://signin.example.invalid/token"
});

// Keep developer .env files out of the test process, even if credentials are
// added locally while the suite runs. The loader test uses synthetic files.
const originalExistsSync = fs.existsSync;
const originalReadFileSync = fs.readFileSync;
const envFiles = new Map();
const isEnvFile = (path) => [".env", ".env.local"].includes(basename(String(path)));
fs.existsSync = (path) => isEnvFile(path) ? envFiles.has(basename(String(path))) : originalExistsSync(path);
fs.readFileSync = (path, ...options) => isEnvFile(path) ? envFiles.get(basename(String(path))) : originalReadFileSync(path, ...options);
syncBuiltinESMExports();
const { handleApiRequest } = await import("../server/api.mjs");
const originalFetch = globalThis.fetch;
let upstreamCalls = [];
let failUpdate = false;
let duplicateUpdate = false;
let duplicateCreate = false;
let searchFailure = false;
let searchResultsSequence = [];
let searchPagination = null;
let searchResults = [{ Id: "42", FirstName: "Signup", LastName: "Test", Email: "signup-test@example.invalid" }];
let profileResult = { Id: "42", FirstName: "Signup", LastName: "Test", Email: "signup-test@example.invalid" };
const defaultOAuthClaims = { mindbody_client_id: "42", email: "signup-test@example.invalid", given_name: "Signup", family_name: "Test" };
let oauthClaims = defaultOAuthClaims;
let platformMe = {};
let platformProfiles = [];
let platformLinkedProfile = {};

function jwt(claims) {
  return `test.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.test`;
}

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  const body = options.body ? JSON.parse(String(options.body).startsWith("{") ? options.body : "{}") : null;
  upstreamCalls.push({ url, method: options.method || "GET", body, headers: options.headers });
  if (url.href === process.env.BOOKING_OAUTH_TOKEN_URL) {
    return Response.json({ access_token: jwt(oauthClaims), expires_in: 3600 });
  }
  if (url.pathname === "/platform/account/v1/me") return Response.json(platformMe);
  if (url.pathname.endsWith("/businessprofiles")) return Response.json({ businessProfiles: platformProfiles });
  if (url.pathname === "/platform/contacts/v1/profiles") return Response.json({ profile: platformLinkedProfile });
  if (url.pathname.endsWith("/client/clientcompleteinfo")) {
    return Response.json({ Client: profileResult });
  }
  if (url.pathname.endsWith("/client/clients")) {
    if (searchFailure) return Response.json({ Error: { Message: "Profile search unavailable." } }, { status: 503 });
    return Response.json({ Clients: searchResultsSequence.length ? searchResultsSequence.shift() : searchResults, ...(searchPagination ? { PaginationResponse: searchPagination } : {}) });
  }
  if (/\/client\/(addorupdateclient|addclient)$/.test(url.pathname)) {
    if (duplicateCreate) return Response.json({ Error: { Message: "Client creation cannot result in duplicate client records." } }, { status: 400 });
    return Response.json({ Client: { ...body.Client, Id: "84" } });
  }
  if (url.pathname.endsWith("/client/updateclient")) {
    if (duplicateUpdate) return Response.json({ Error: { Message: "Client update cannot result in duplicate client records." } }, { status: 400 });
    if (failUpdate) return Response.json({ Error: { Code: "InvalidClientUpdate", Message: "Mindbody rejected the phone update." } }, { status: 400 });
    return Response.json({ Client: body.Client });
  }
  throw new Error(`Unexpected mocked upstream request: ${options.method || "GET"} ${url.pathname}`);
};

async function request(path, { method = "POST", body, cookie = "", origin = "http://localhost" } = {}) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  req.url = path;
  req.method = method;
  req.headers = { host: "localhost", origin, cookie, "content-type": "application/json" };
  req.socket = { remoteAddress: "signup-phone-test" };
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

async function completeSignupOAuth(overrides = {}) {
  const start = await request("/api/auth/start", { body: { phone: "7085550123", returnTo: "/account", ...overrides } });
  assert.equal(start.status, 200);
  const state = new URL(start.body.authorizationUrl).searchParams.get("state");
  const callback = await request(`/api/auth/callback?${new URLSearchParams({ code: "fake-code", state })}`, { method: "GET" });
  assert.equal(callback.status, 303);
  const cookie = sessionCookie(callback);
  const session = await request("/api/auth/session", { method: "GET", cookie });
  return { cookie, session: session.body.session };
}

function sessionCookie(result) {
  return (result.headers.get("set-cookie") || [])
    .map((cookie) => cookie.split(";")[0])
    .filter((cookie) => /^cave_session(?:_\d+)?=.+/.test(cookie))
    .join("; ");
}

function createdClientCookie(clientId = "", overrides = {}) {
  const iv = randomBytes(12);
  const actualCipher = createCipheriv("aes-256-gcm", createHash("sha256").update(process.env.SESSION_SECRET).digest(), iv);
  const payload = { authMode: "created-client", clientId, signupPhone: "7085550123", user: { firstName: "Signup", lastName: "Test", email: "signup-test@example.invalid" }, exp: Math.floor(Date.now() / 1000) + 300, ...overrides };
  const encrypted = Buffer.concat([actualCipher.update(JSON.stringify(payload)), actualCipher.final()]);
  const token = [iv, actualCipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
  return `cave_session=${token}`;
}

test("signup phone survives OAuth and saves only after confirmation", async (t) => {
  t.after(() => {
    globalThis.fetch = originalFetch;
    fs.existsSync = originalExistsSync;
    fs.readFileSync = originalReadFileSync;
    syncBuiltinESMExports();
  });
  let signedInCookie = "";

  await t.test("local environment fills missing values with .env.local precedence", async () => {
    envFiles.set(".env.local", "SIGNUP_TEST_ENV_PRECEDENCE=local\nSIGNUP_TEST_ENV_PRESERVE=local\n");
    envFiles.set(".env", "SIGNUP_TEST_ENV_PRECEDENCE=base\nSIGNUP_TEST_ENV_FALLBACK=base\nSIGNUP_TEST_ENV_PRESERVE=base\n");
    process.env.SIGNUP_TEST_ENV_PRESERVE = "process";
    await request("/api/auth/session", { method: "GET" });
    assert.equal(process.env.SIGNUP_TEST_ENV_PRECEDENCE, "local");
    assert.equal(process.env.SIGNUP_TEST_ENV_FALLBACK, "base");
    assert.equal(process.env.SIGNUP_TEST_ENV_PRESERVE, "process");
    envFiles.clear();
  });

  await t.test("invalid signup phone is rejected before OAuth", async () => {
    const result = await request("/api/auth/start", { body: { phone: "123", returnTo: "/account" } });
    assert.equal(result.status, 400);
    assert.equal(result.body.ok, false);
    assert.equal(upstreamCalls.length, 0);
  });

  await t.test("missing OAuth setup returns JSON 503", async () => {
    const configuredId = process.env.BOOKING_OAUTH_CLIENT_ID;
    process.env.BOOKING_OAUTH_CLIENT_ID = "";
    try {
      const result = await request("/api/auth/start", { body: { phone: "7085550123" } });
      assert.equal(result.status, 503);
      assert.equal(result.body.ok, false);
      assert.match(result.body.message, /try again|contact/i);
    } finally { process.env.BOOKING_OAUTH_CLIENT_ID = configuredId; }
  });

  await t.test("OAuth callback carries the phone in encrypted state without updating Mindbody", async () => {
    const start = await request("/api/auth/start", { body: { phone: "+1 (708) 555-0123", returnTo: "/account" } });
    assert.equal(start.status, 200);
    const authorizationUrl = new URL(start.body.authorizationUrl);
    assert.equal(authorizationUrl.origin, "https://signin.example.invalid");
    assert.ok(authorizationUrl.searchParams.get("state"));
    assert.ok(!start.body.authorizationUrl.includes("7085550123"));
    const callback = await request(`/api/auth/callback?${new URLSearchParams({ code: "fake-code", state: authorizationUrl.searchParams.get("state") })}`, { method: "GET" });
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get("location"), "/account");
    signedInCookie = sessionCookie(callback);
    assert.ok(signedInCookie);
    const session = await request("/api/auth/session", { method: "GET", cookie: signedInCookie });
    assert.equal(session.body.session.signupPhone, "7085550123");
    assert.equal(session.body.session.user.phone, undefined);
    assert.ok(!upstreamCalls.some((call) => call.url.pathname.endsWith("/client/updateclient")));
  });

  await t.test("authentication, phone validation, method, and origin errors prevent writes", async () => {
    const before = upstreamCalls.length;
    assert.equal((await request("/api/account/signup-phone", { body: { phone: "7085550123" } })).status, 401);
    assert.equal((await request("/api/account/signup-phone", { cookie: signedInCookie, body: { phone: "abc" } })).status, 400);
    assert.equal((await request("/api/account/signup-phone", { method: "GET", cookie: signedInCookie })).status, 405);
    assert.equal((await request("/api/account/signup-phone", { origin: "https://attacker.example.invalid", cookie: signedInCookie, body: { phone: "7085550123" } })).status, 403);
    assert.equal(upstreamCalls.length, before);
  });

  await t.test("unlinked and provider-only IDs cannot update another client's phone", async () => {
    const before = upstreamCalls.length;
    for (const clientId of ["", "6a4579b0004309521d915633", "12345678-1234-1234-1234-123456789abc"]) {
      const result = await request("/api/account/signup-phone", { cookie: createdClientCookie(clientId), body: { phone: "7085550123", clientId: "999" } });
      assert.equal(result.status, 409);
    }
    assert.equal(upstreamCalls.length, before);
  });

  await t.test("failed Mindbody update preserves the pending signup phone", async () => {
    failUpdate = true;
    const result = await request("/api/account/signup-phone", { cookie: signedInCookie, body: { phone: "7085550123" } });
    failUpdate = false;
    assert.equal(result.status, 400);
    assert.match(result.body.message, /Mindbody rejected/);
    assert.equal(sessionCookie(result), "");
    const session = await request("/api/auth/session", { method: "GET", cookie: signedInCookie });
    assert.equal(session.body.session.signupPhone, "7085550123");
  });

  await t.test("confirmed phone uses the trusted client ID and MobilePhone, then clears pending data", async () => {
    const result = await request("/api/account/signup-phone", { cookie: signedInCookie, body: { phone: "+1 (708) 555-0123", clientId: "999", email: "another@example.invalid" } });
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.phone, "7085550123");
    assert.equal(result.body.session.user.phone, "7085550123");
    assert.equal(result.body.session.signupPhone, undefined);
    const update = upstreamCalls.at(-1);
    assert.equal(update.method, "POST");
    assert.equal(update.headers.Authorization, "Bearer signup-phone-test-staff-token");
    assert.deepEqual(update.body, { Client: { Id: "42", MobilePhone: "7085550123" }, CrossRegionalUpdate: false });
    const session = await request("/api/auth/session", { method: "GET", cookie: sessionCookie(result) });
    assert.equal(session.body.session.signupPhone, undefined);
    assert.equal(session.body.session.user.phone, "7085550123");
  });

  await t.test("explicit popup consent enables promotional texts only after phone confirmation", async () => {
    oauthClaims = defaultOAuthClaims;
    profileResult = { Id: "42", Email: "signup-test@example.invalid" };
    const { cookie } = await completeSignupOAuth({ promotionalTexts: true });

    const saved = await request("/api/account/signup-phone", { cookie, body: { phone: "7085550123" } });
    assert.equal(saved.status, 200);
    assert.deepEqual(upstreamCalls.at(-1).body, {
      Client: { Id: "42", MobilePhone: "7085550123", SendPromotionalTexts: true },
      CrossRegionalUpdate: false
    });
    assert.equal(saved.body.session.signupPromotionalTexts, undefined);
    assert.equal(saved.body.session.signupPromotionalTextsAt, undefined);
  });

  await t.test("phone confirmation never hydrates or replaces a stale session identity", async () => {
    profileResult = { Id: "999", Email: "stranger@example.invalid" };
    const before = upstreamCalls.length;
    const cookie = createdClientCookie("42", {
      authMode: "oauth",
      accessToken: "synthetic-consumer-token",
      consumerIdentityToken: "synthetic-consumer-token",
      hydratedAt: "2000-01-01T00:00:00.000Z"
    });
    const result = await request("/api/account/signup-phone", { cookie, body: { phone: "7085550123", clientId: "999" } });
    assert.equal(result.status, 200);
    assert.equal(result.body.session.clientId, "42");
    const calls = upstreamCalls.slice(before);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.pathname, "/public/v6/client/updateclient");
    assert.equal(calls[0].body.Client.Id, "42");
    profileResult = { Id: "42", FirstName: "Signup", LastName: "Test", Email: "signup-test@example.invalid" };
  });

  await t.test("phone confirmation does not resolve an unlinked OAuth identity", async () => {
    const before = upstreamCalls.length;
    const cookie = createdClientCookie("", { authMode: "oauth", accessToken: "synthetic-consumer-token", consumerIdentityToken: "synthetic-consumer-token" });
    const result = await request("/api/account/signup-phone", { cookie, body: { phone: "7085550123", clientId: "999" } });
    assert.equal(result.status, 409);
    assert.equal(sessionCookie(result), "");
    assert.equal(upstreamCalls.length, before);
  });

  await t.test("normal profile completion validates phones and preserves pending data on failure", async () => {
    const before = upstreamCalls.length;
    const invalid = await request("/api/account/profile", { cookie: signedInCookie, body: { phone: "123" } });
    assert.equal(invalid.status, 400);
    assert.equal(upstreamCalls.length, before);
    failUpdate = true;
    const failed = await request("/api/account/profile", { cookie: signedInCookie, body: { phone: "7085550123" } });
    failUpdate = false;
    assert.equal(failed.status, 400);
    assert.equal(sessionCookie(failed), "");
    const saved = await request("/api/account/profile", { cookie: signedInCookie, body: { phone: "7085550123" } });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.session.signupPhone, undefined);
    assert.equal(saved.body.session.user.phone, "7085550123");
  });

  await t.test("new studio clients receive a primary HomePhone and MobilePhone", async () => {
    searchResults = [];
    const result = await request("/api/account/profile", { cookie: createdClientCookie(), body: { phone: "7085550123", addressLine1: "123 Test St", city: "Test", state: "IL", postalCode: "60462" } });
    assert.equal(result.status, 200);
    const creation = upstreamCalls.findLast((call) => call.url.pathname.endsWith("/client/addorupdateclient"));
    assert.equal(creation.body.Client.MobilePhone, "7085550123");
    assert.equal(creation.body.Client.HomePhone, "7085550123");
    assert.equal(result.body.session.signupPhone, undefined);
  });

  await t.test("an unlinked signup never links a stranger with the same name or phone", async () => {
    searchResults = [{ Id: "999", FirstName: "Signup", LastName: "Test", Email: "stranger@example.invalid", MobilePhone: "7085550123" }];
    const before = upstreamCalls.length;
    const result = await request("/api/account/profile", { cookie: createdClientCookie(), body: { phone: "7085550123", clientId: "999" } });
    assert.equal(result.status, 200);
    assert.equal(result.body.clientId, "84");
    const calls = upstreamCalls.slice(before);
    const search = calls.filter((call) => call.url.pathname.endsWith("/client/clients"));
    assert.equal(search.length, 1);
    assert.equal(search[0].url.searchParams.get("request.searchText"), "signup-test@example.invalid");
    const creation = calls.find((call) => call.url.pathname.endsWith("/client/addorupdateclient"));
    assert.equal(creation.body.Client.Email, "signup-test@example.invalid");
    assert.equal(calls.at(-1).body.Client.Id, "84");
  });

  await t.test("a known session target cannot be replaced by a supplied ID or search result", async () => {
    searchResults = [{ Id: "999", Email: "signup-test@example.invalid", MobilePhone: "7085550123" }];
    const before = upstreamCalls.length;
    const result = await request("/api/account/profile", { cookie: createdClientCookie("42"), body: { phone: "7085550123", clientId: "999", email: " SIGNUP-TEST@EXAMPLE.INVALID " } });
    assert.equal(result.status, 200);
    assert.equal(result.body.clientId, "42");
    const calls = upstreamCalls.slice(before);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.pathname, "/public/v6/client/updateclient");
    assert.equal(calls[0].body.Client.Id, "42");
  });

  await t.test("a supplied different email is rejected before any lookup or write", async () => {
    const before = upstreamCalls.length;
    for (const clientId of ["", "42"]) {
      const result = await request("/api/account/profile", { cookie: createdClientCookie(clientId), body: { phone: "7085550123", clientId: "999", email: "stranger@example.invalid" } });
      assert.equal(result.status, 400);
      assert.match(result.body.message, /sign-in email/);
      assert.equal(sessionCookie(result), "");
    }
    assert.equal(upstreamCalls.length, before);
  });

  await t.test("an unlinked signup can link only a unique exact authenticated-email match", async () => {
    searchResults = [{ Id: "999", Email: "stranger@example.invalid" }, { Id: "73", Email: "SIGNUP-TEST@EXAMPLE.INVALID" }];
    const before = upstreamCalls.length;
    const result = await request("/api/account/profile", { cookie: createdClientCookie(), body: { phone: "7085550123", clientId: "999" } });
    assert.equal(result.status, 200);
    assert.equal(result.body.clientId, "73");
    const calls = upstreamCalls.slice(before);
    assert.equal(calls.length, 2);
    assert.equal(calls.at(-1).body.Client.Id, "73");
  });

  await t.test("ambiguous authenticated-email matches fail closed without any write", async () => {
    searchResults = [{ Id: "73", Email: "signup-test@example.invalid" }, { Id: "74", Email: "signup-test@example.invalid" }];
    const before = upstreamCalls.length;
    const result = await request("/api/account/profile", { cookie: createdClientCookie(), body: { phone: "7085550123" } });
    assert.equal(result.status, 409);
    assert.equal(sessionCookie(result), "");
    assert.ok(upstreamCalls.slice(before).every((call) => call.method === "GET"));
  });

  await t.test("a failed identity lookup does not fall through to client creation", async () => {
    searchFailure = true;
    const before = upstreamCalls.length;
    const result = await request("/api/account/profile", { cookie: createdClientCookie(), body: { phone: "7085550123" } });
    searchFailure = false;
    assert.equal(result.status, 503);
    assert.equal(sessionCookie(result), "");
    assert.ok(upstreamCalls.slice(before).every((call) => call.method === "GET"));
  });

  await t.test("a duplicate update never searches for or switches to a different client", async () => {
    duplicateUpdate = true;
    const before = upstreamCalls.length;
    const result = await request("/api/account/profile", { cookie: createdClientCookie("42"), body: { phone: "7085550123" } });
    duplicateUpdate = false;
    assert.equal(result.status, 409);
    assert.equal(sessionCookie(result), "");
    const calls = upstreamCalls.slice(before);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.Client.Id, "42");
  });

  await t.test("duplicate creation recovery accepts only one exact authenticated-email identity", async () => {
    duplicateCreate = true;
    searchResultsSequence = [[], [{ Id: "73", Email: "signup-test@example.invalid" }]];
    const result = await request("/api/account/profile", { cookie: createdClientCookie(), body: { phone: "7085550123" } });
    duplicateCreate = false;
    assert.equal(result.status, 200);
    assert.equal(result.body.clientId, "73");
    assert.equal(upstreamCalls.at(-1).body.Client.Id, "73");
  });

  await t.test("duplicate creation cannot recover to a stranger or ambiguous email matches", async () => {
    for (const matches of [
      [{ Id: "999", Email: "stranger@example.invalid", MobilePhone: "7085550123" }],
      [{ Id: "73", Email: "signup-test@example.invalid" }, { Id: "74", Email: "signup-test@example.invalid" }]
    ]) {
      duplicateCreate = true;
      searchResultsSequence = [[], matches];
      const before = upstreamCalls.length;
      const result = await request("/api/account/profile", { cookie: createdClientCookie(), body: { phone: "7085550123" } });
      duplicateCreate = false;
      assert.equal(result.status, 409);
      assert.equal(sessionCookie(result), "");
      assert.ok(!upstreamCalls.slice(before).some((call) => call.url.pathname.endsWith("/client/updateclient")));
    }
  });

  await t.test("OAuth callback cannot replace an authenticated client ID with a wrong staff result", async () => {
    oauthClaims = defaultOAuthClaims;
    profileResult = {};
    searchResults = [{ Id: "999", Email: "stranger@example.invalid", FirstName: "Stranger" }];
    const before = upstreamCalls.length;
    const { cookie, session } = await completeSignupOAuth();
    assert.equal(session.clientId, "42");
    assert.equal(session.user.email, "signup-test@example.invalid");
    assert.equal(session.user.firstName, "Signup");
    const staffLookups = upstreamCalls.slice(before).filter((call) => call.url.pathname.endsWith("/client/clients"));
    assert.equal(staffLookups.length, 1);
    assert.equal(staffLookups[0].url.searchParams.get("request.clientIds"), "42");
    assert.equal(staffLookups[0].url.searchParams.get("SearchText"), null);
    const saved = await request("/api/account/signup-phone", { cookie, body: { phone: "7085550123" } });
    assert.equal(saved.status, 200);
    assert.equal(upstreamCalls.at(-1).body.Client.Id, "42");
  });

  await t.test("a matching studio client can enrich the profile without changing login email", async () => {
    oauthClaims = defaultOAuthClaims;
    profileResult = { Id: "42", Email: "old-studio-email@example.invalid", FirstName: "Updated" };
    const { session } = await completeSignupOAuth();
    assert.equal(session.clientId, "42");
    assert.equal(session.user.firstName, "Updated");
    assert.equal(session.user.email, "signup-test@example.invalid");
    assert.equal(session.user.username, "signup-test@example.invalid");
  });

  await t.test("an unlinked OAuth session never adopts a stranger or ambiguous email results", async () => {
    const { mindbody_client_id, ...unlinkedClaims } = defaultOAuthClaims;
    oauthClaims = unlinkedClaims;
    for (const results of [
      [{ Id: "999", Email: "stranger@example.invalid" }],
      [{ Id: "73", Email: "signup-test@example.invalid" }, { Id: "74", Email: "signup-test@example.invalid" }]
    ]) {
      profileResult = {};
      searchResults = results;
      const before = upstreamCalls.length;
      const { cookie, session } = await completeSignupOAuth();
      assert.equal(session.clientId, "");
      assert.equal(session.user.email, "signup-test@example.invalid");
      const lookups = upstreamCalls.slice(before).filter((call) => call.url.pathname.endsWith("/client/clients"));
      assert.equal(lookups.length, 1);
      assert.equal(lookups[0].url.searchParams.get("request.searchText"), "signup-test@example.invalid");
      const saved = await request("/api/account/signup-phone", { cookie, body: { phone: "7085550123" } });
      assert.equal(saved.status, 409);
      assert.ok(!upstreamCalls.slice(before).some((call) => call.url.pathname.endsWith("/client/updateclient")));
    }
  });

  await t.test("an unlinked OAuth session accepts one exact authenticated-email match", async () => {
    profileResult = {};
    searchResults = [{ Id: "999", Email: "stranger@example.invalid" }, { Id: "73", Email: "signup-test@example.invalid" }];
    const { cookie, session } = await completeSignupOAuth();
    assert.equal(session.clientId, "73");
    assert.equal(session.user.email, "signup-test@example.invalid");
    const saved = await request("/api/account/signup-phone", { cookie, body: { phone: "7085550123" } });
    assert.equal(saved.status, 200);
    assert.equal(upstreamCalls.at(-1).body.Client.Id, "73");
  });

  await t.test("account load cannot retarget a known client using another studio or a conflicting Cave profile", async () => {
    oauthClaims = defaultOAuthClaims;
    platformMe = { userAccount: { id: "platform-test-user" }, email: "different-platform-email@example.invalid" };
    for (const businessId of ["unrelated-other-studio", process.env.BOOKING_SITE_ID]) {
      profileResult = {};
      searchResults = [];
      platformProfiles = [{ businessId, clientId: "999", id: "unrelated-profile" }];
      const { cookie } = await completeSignupOAuth();
      profileResult = { Id: "999", Email: "stranger@example.invalid", MobilePhone: "3125550199" };
      const account = await request("/api/account/me", { method: "GET", cookie });
      assert.equal(account.status, 200);
      assert.equal(account.body.data.clientId, "42");
      assert.equal(account.body.data.email, "signup-test@example.invalid");
      assert.equal(account.body.data.phone, undefined);
      assert.notEqual(account.body.data.profileId, "unrelated-profile");
      const saved = await request("/api/account/signup-phone", { cookie: sessionCookie(account) || cookie, body: { phone: "7085550123" } });
      assert.equal(saved.status, 200);
      assert.equal(upstreamCalls.at(-1).body.Client.Id, "42");
    }
  });

  await t.test("an unlinked account rejects other-studio links and previously rejected consumer data", async () => {
    const { mindbody_client_id, ...unlinkedClaims } = defaultOAuthClaims;
    oauthClaims = unlinkedClaims;
    profileResult = { Id: "999", Email: "stranger@example.invalid", MobilePhone: "3125550199" };
    searchResults = [];
    platformLinkedProfile = { businessId: "unrelated-other-studio", clientId: "999" };
    platformProfiles = [{ businessId: "unrelated-other-studio", clientId: "999" }];
    const before = upstreamCalls.length;
    const { cookie, session } = await completeSignupOAuth();
    assert.equal(session.clientId, "");
    const account = await request("/api/account/me", { method: "GET", cookie });
    assert.equal(account.status, 200);
    assert.equal(account.body.data.clientId, "");
    assert.equal(account.body.data.hasBusinessProfile, false);
    assert.equal(account.body.data.phone, undefined);
    const saved = await request("/api/account/signup-phone", { cookie: sessionCookie(account) || cookie, body: { phone: "7085550123" } });
    assert.equal(saved.status, 409);
    assert.ok(!upstreamCalls.slice(before).some((call) => call.url.pathname.endsWith("/client/updateclient")));
  });

  await t.test("an unlinked account accepts a unique Cave business profile", async () => {
    profileResult = {};
    searchResults = [];
    platformLinkedProfile = {};
    platformProfiles = [{ businessId: "unrelated-other-studio", clientId: "999" }, { businessId: process.env.BOOKING_SITE_ID, clientId: "73" }];
    const { cookie } = await completeSignupOAuth();
    profileResult = { Id: "73", Email: "signup-test@example.invalid", MobilePhone: "7085550123" };
    const account = await request("/api/account/me", { method: "GET", cookie });
    assert.equal(account.status, 200);
    assert.equal(account.body.data.clientId, "73");
    assert.equal(account.body.data.hasBusinessProfile, true);
    assert.equal(account.body.data.phone, "7085550123");
    const saved = await request("/api/account/signup-phone", { cookie: sessionCookie(account), body: { phone: "7085550123" } });
    assert.equal(saved.status, 200);
    assert.equal(upstreamCalls.at(-1).body.Client.Id, "73");
  });

  await t.test("an unlinked account rejects conflicting Cave business profiles", async () => {
    profileResult = {};
    searchResults = [];
    platformProfiles = [{ businessId: process.env.BOOKING_SITE_ID, clientId: "73" }, { businessId: process.env.BOOKING_SITE_ID, clientId: "74" }];
    const { cookie } = await completeSignupOAuth();
    const account = await request("/api/account/me", { method: "GET", cookie });
    assert.equal(account.body.data.clientId, "");
    assert.equal(account.body.data.hasBusinessProfile, false);
    const saved = await request("/api/account/signup-phone", { cookie: sessionCookie(account) || cookie, body: { phone: "7085550123" } });
    assert.equal(saved.status, 409);
  });

  await t.test("dashboard cannot link ambiguous or truncated authenticated-email results", async () => {
    for (const scenario of [
      { results: [{ Id: "73", Email: "signup-test@example.invalid" }, { Id: "74", Email: "signup-test@example.invalid" }], pagination: null },
      { results: [{ Id: "73", Email: "signup-test@example.invalid" }], pagination: { TotalResults: 2 } }
    ]) {
      searchResults = scenario.results;
      searchPagination = scenario.pagination;
      const cookie = createdClientCookie("", { authMode: "oauth", accessToken: "synthetic-token", consumerIdentityToken: "synthetic-token", hydratedAt: new Date().toISOString() });
      const before = upstreamCalls.length;
      const dashboard = await request("/api/client/dashboard", { method: "GET", cookie });
      assert.equal(dashboard.status, 200);
      assert.equal(dashboard.body.clientLinked, false);
      assert.equal(dashboard.body.session.clientId, "");
      assert.equal(sessionCookie(dashboard), "");
      assert.ok(upstreamCalls.slice(before).every((call) => call.method === "GET"));
    }
    searchPagination = null;
  });
});
