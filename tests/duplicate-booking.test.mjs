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

let visits = [], posts = 0, readFailure = false, uncertain = false, capacity = 10;
let services = [{ Id: 10, Name: "10 Class Pack", Remaining: 10, ActiveDate: "2020-01-01", ExpirationDate: "2099-12-31" }];
let contracts = [];
let completeMemberships = [];
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input), body = options.body ? JSON.parse(options.body) : {};
  if (url.pathname.endsWith("/class/classes")) return Response.json({ Classes: [{ Id: 77, StartDateTime: "2099-01-01T10:00:00", MaxCapacity: capacity, TotalBooked: 0, IsAvailable: true }] });
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

test("booking guard acquires synchronously before the UI re-renders", () => {
  const guard = createBookingGuard();
  assert.equal(guard.acquire(), true);
  assert.equal(guard.acquire(), false);
  guard.release();
  assert.equal(guard.acquire(), true);
});

test("cancelled and waitlisted visits are not duplicate active bookings", () => {
  assert.equal(isActiveClassBooking({ ClassId: "77", Status: "Booked" },77),true);
  for (const status of ["Cancelled", "Canceled", "LateCancel", "Waitlisted"]) assert.equal(isActiveClassBooking({ClassId:77, Status:status},77),false);
  assert.equal(isActiveClassBooking({ClassId:88, Status:"Booked"},77),false);
  assert.equal(isCancelledVisit({ IsCancelled:true }),true);
});

test("booking requests with a synthetic provider never create duplicate reservations", async t => {
  t.after(() => { globalThis.fetch = originalFetch; fs.existsSync = originalExistsSync; fs.readFileSync = originalReadFileSync; syncBuiltinESMExports(); });
  await t.test("simultaneous clicks and both booking endpoints make only one upstream booking", async () => {
    reset();
    const results = await Promise.all(Array.from({length:8},(_,i)=>request({classId:77},i%2 ? "/api/classes/book" : "/api/mindbody/book-class")));
    for (const result of results) assert.equal(result.status,200,JSON.stringify(result.body));
    assert.equal(posts,1); assert.equal(visits.length,1);
  });
  await t.test("later repeat returns already booked without another credit consumption", async () => {
    const result = await request({classId:77});
    assert.equal(result.status,200); assert.equal(result.body.data.alreadyBooked,true); assert.equal(posts,1);
  });
  await t.test("retry after a lost response finds the booking instead of creating a duplicate", async () => {
    reset(); uncertain = true;
    assert.equal((await request({classId:77})).status,503);
    uncertain = false;
    const retry = await request({classId:77});
    assert.equal(retry.status,200); assert.equal(retry.body.data.alreadyBooked,true); assert.equal(posts,1);
  });
  await t.test("unavailable reservation lookup fails closed with no upstream booking", async () => {
    reset(); readFailure = true;
    assert.equal((await request({classId:77})).status,503); assert.equal(posts,0);
    readFailure = false;
    assert.equal((await request({classId:77})).status,200); assert.equal(posts,1);
  });
  await t.test("schedule hides cancelled visits but preserves remaining duplicates", async () => {
    reset(); visits = [{Id:98,ClassId:77,VisitStatus:"Cancelled"},{Id:99,ClassId:77,VisitStatus:"Booked"}];
    const result = await request(null, "/api/client/schedule", "GET");
    assert.equal(result.status,200); assert.equal(result.body.data.visits.length,1);
    assert.equal(result.body.data.visits[0].visitId,99);
    readFailure = true;
    assert.equal((await request(null, "/api/client/schedule", "GET")).status,503);
  });
  await t.test("a previously cancelled reservation permits booking again", async () => {
    reset(); visits = [{Id:99,ClassId:77,VisitStatus:"Cancelled"}];
    assert.equal((await request({classId:77})).status,200); assert.equal(posts,1);
  });
  await t.test("a terminated unlimited contract cannot book with its leftover service", async () => {
    reset();
    services = [
      { Id: 10, Name: "Unlimited Membership", Remaining: 0, ExpirationDate: "2099-12-31" },
      { Id: 11, Name: "Guest Pass", Remaining: 1, ExpirationDate: "2099-12-31" }
    ];
    contracts = [{ Id: 20, Name: "Unlimited Membership - 12 Months", Status: "Terminated", ExpirationDate: "2099-12-31" }];
    completeMemberships = [{ Id: 20, Name: "Unlimited Membership", Status: "Active", ExpirationDate: "2099-12-31" }];
    const result = await request({classId:77});
    assert.equal(result.status,402,JSON.stringify(result.body));
    assert.equal(result.body.code,"NO_VALID_SERVICE");
    assert.equal(posts,0);
  });
  await t.test("a terminated unlimited contract cannot book a guest with its leftover guest pass", async () => {
    reset();
    services = [
      { Id: 10, Name: "Unlimited Membership", Remaining: 0, ExpirationDate: "2099-12-31" },
      { Id: 11, Name: "Guest Pass", Remaining: 1, ExpirationDate: "2099-12-31" }
    ];
    contracts = [{ Id: 20, Name: "Unlimited Membership - 12 Months", Status: "Terminated", ExpirationDate: "2099-12-31" }];
    completeMemberships = [{ Id: 20, Name: "Unlimited Membership", Status: "Active", ExpirationDate: "2099-12-31" }];
    const result = await request({
      classId: 77,
      guestPassClientServiceId: 11,
      guest: { firstName: "Test", lastName: "Guest", email: "guest@example.invalid", mobilePhone: "3135550100" }
    }, "/api/mindbody/book-guest");
    assert.equal(result.status,402,JSON.stringify(result.body));
    assert.equal(result.body.code,"NO_GUEST_PASS");
    assert.equal(posts,0);
  });
  await t.test("a guest pass never counts as a member class credit", async () => {
    reset();
    services = [{ Id: 11, Name: "Guest Pass", Remaining: 1, ExpirationDate: "2099-12-31" }];
    const result = await request({classId:77});
    assert.equal(result.status,402,JSON.stringify(result.body));
    assert.equal(result.body.code,"NO_VALID_SERVICE");
    assert.equal(posts,0);
  });
  await t.test("an expired service cannot be used for booking", async () => {
    reset();
    services = [{ Id: 10, Name: "10 Class Pack", Remaining: 10, Status: "Active", ExpirationDate: "2020-01-01" }];
    const result = await request({classId:77});
    assert.equal(result.status,402,JSON.stringify(result.body));
    assert.equal(posts,0);
  });
});
