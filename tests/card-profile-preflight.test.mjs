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
function cookie(linked = true, oauth = false) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(process.env.SESSION_SECRET).digest(), iv);
  const payload = { authMode: oauth ? "oauth" : "created-client", accessToken: oauth ? "synthetic-token" : "", hydratedAt: new Date().toISOString(), clientId: linked ? "42" : "", user: { email: "checkout-test@example.invalid" }, exp: Math.floor(Date.now() / 1000) + 300 };
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return `cave_session=${[iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".")}`;
}

async function request(linked = true, oauth = false) {
  const body = null, path = "/api/account/payment-card", method = "GET";
  const req = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  Object.assign(req, { url: path, method, headers: { host: "localhost", origin: "http://localhost", cookie: cookie(linked, oauth), "content-type": "application/json" }, socket: { remoteAddress: "membership-checkout-test" } });
  const headers = new Map(); let output = "";
  const res = { statusCode: 200, setHeader(k, v) { headers.set(k.toLowerCase(), v); }, getHeader(k) { return headers.get(k.toLowerCase()); }, end(value = "") { output += value; } };
  await handleApiRequest(req, res);
  return { status: res.statusCode, body: JSON.parse(output) };
}

const appBody = (overrides = {}) => ({ checkoutVersion: 2, contractId: "9001", quote: { ...acceptedQuote }, acceptTerms: true, acceptWaiver: true, storedCardLastFour: "1234", ...overrides });
function reset() { calls = []; currentContracts = [contract]; providerUnavailable = false; process.env.MINDBODY_CONTRACT_PRICES_VERIFIED = "true"; }
function noCharge() { assert.equal(calls.filter((call) => call.method === "POST").length, 0); }

const calls = [];
globalThis.fetch = async (input, options = {}) => {
  calls.push({ url: String(input), method: options.method || "GET" });
  if (String(input).includes("/account/v1/me")) return Response.json({}, {status:404});
  assert.ok(String(input).includes("/client/clientcompleteinfo"));
  return Response.json({Client:{Id:"42", Active:true, Email:"checkout-test@example.invalid"}});
};
test("linked clients can check card setup without sending payment data", async () => {
  const result = await request(true);
  assert.equal(result.status, 200);
  assert.equal(result.body.ready, true);
  assert.ok(calls.every(call => call.method === "GET"));
});
test("unlinked clients get an actionable profile step before card entry", async () => {
  const before = calls.length;
  const result = await request(false);
  assert.equal(result.status, 409);
  assert.equal(result.body.code, "STUDIO_PROFILE_REQUIRED");
  assert.equal(result.body.profileUrl, "/account");
  assert.equal(calls.length, before);
});

test("a fresh lookup recovers an OAuth profile despite a recent cached miss", async () => {
  const result = await request(false, true);
  assert.equal(result.status, 200);
  assert.equal(result.body.ready, true);
  assert.ok(calls.every(call => call.method === "GET"));
});
