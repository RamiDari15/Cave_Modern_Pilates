import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { createBookingGuard, isActiveClassBooking, isCancelledVisit } from "../src/bookingGuard.js";
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

let waitlistCount = 4, waitlistLimit = 5;
let visits = [], posts = 0, readFailure = false, uncertain = false, capacity = 10;
let services = [{ Id: 10, Name: "10 Class Pack", Remaining: 10, ActiveDate: "2020-01-01", ExpirationDate: "2099-12-31" }];
let contracts = [];
let completeMemberships = [];
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input), body = options.body ? JSON.parse(options.body) : {};
  if (url.pathname.endsWith("/class/classes")) return Response.json({ Classes: [{ Id: 77, StartDateTime: "2099-01-01T10:00:00", MaxCapacity: capacity, TotalBooked: 10, TotalBookedWaitlist: waitlistCount, WaitListSize: waitlistLimit, IsAvailable: true }] });
  if (url.pathname.endsWith("/client/clientschedule")) {
    if (readFailure) return Response.json({ Error: { Message: "schedule unavailable" } }, { status: 503 });
    return Response.json({ Visits: visits });
  }
  if (url.pathname.endsWith("/class/waitlistentries")) return Response.json({ WaitlistEntries: [] });
  if (url.pathname.endsWith("/client/clientcompleteinfo")) return Response.json({ Client: { Id: "42" }, ClientMemberships: completeMemberships });
  if (url.pathname.endsWith("/client/clientservices")) return Response.json({ ClientServices: services });
  if (url.pathname.endsWith("/client/clientcontracts")) return Response.json({ Contracts: contracts });
  if (url.pathname.endsWith("/class/addclienttoclass")) {
    posts++;
    await new Promise(resolve => setTimeout(resolve, 30));
    const visit = { Id: 100, ClassId: body.ClassId, VisitStatus: "Booked" };
    visits.push(visit);
    if (uncertain) throw new Error("response lost after reservation was created");
    return Response.json({ Visit: visit });
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

async function request(body, path = "/api/mindbody/book-class", method = "POST") {
  const req = Readable.from(body == null ? [] : [JSON.stringify(body)]);
  Object.assign(req, { url: path, method, headers: { host: "localhost", origin: "http://localhost", cookie: cookie(), "content-type": "application/json" }, socket: { remoteAddress: "membership-checkout-test" } });
  const headers = new Map(); let output = "";
  const res = { statusCode: 200, setHeader(k, v) { headers.set(k.toLowerCase(), v); }, getHeader(k) { return headers.get(k.toLowerCase()); }, end(value = "") { output += value; } };
  await handleApiRequest(req, res);
  return { status: res.statusCode, body: JSON.parse(output) };
}


function reset() {
  visits = [];
  posts = 0;
  readFailure = false;
  uncertain = false;
  capacity = 10;
  services = [{ Id: 10, Name: "10 Class Pack", Remaining: 10, ActiveDate: "2020-01-01", ExpirationDate: "2099-12-31" }];
  contracts = [];
  completeMemberships = [];
}


test("waitlist enforces fresh capacity before any provider write", async t => {
  t.after(() => { globalThis.fetch = originalFetch; fs.existsSync = originalExistsSync; fs.readFileSync = originalReadFileSync; syncBuiltinESMExports(); });
  for (const [count, limit, expected] of [[4,5,200],[5,5,409],[6,5,409],[5,0,409],[5,20,409],[3,3,409],[null,5,503]]) {
    await t.test(`${count} waiting, provider limit ${limit}`, async () => {
      reset(); waitlistCount=count; waitlistLimit=limit;
      const result=await request({classId:77},"/api/mindbody/join-waitlist");
      assert.equal(result.status,expected,JSON.stringify(result.body));
      assert.equal(posts,expected===200 ? 1 : 0);
    });
  }
});
