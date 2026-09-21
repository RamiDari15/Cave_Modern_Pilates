import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { GUEST_PASS_TIME_ZONE, getGuestPassPeriod } from "../src/guestPass.js";

// Never read developer credentials or call a real service from these tests.
for (const key of Object.keys(process.env)) {
  if (/^(BOOKING_|MINDBODY_|SUPABASE_|VITE_SUPABASE_|SESSION_SECRET$)/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  SESSION_SECRET: "guest-pass-test-secret",
  BOOKING_API_KEY: "guest-pass-test-key",
  BOOKING_STAFF_TOKEN: "guest-pass-test-token",
  SUPABASE_URL: "https://guest-pass-test.example.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "guest-pass-test-service-role"
});
const originalExistsSync = fs.existsSync;
fs.existsSync = (path) => [".env", ".env.local"].includes(basename(String(path))) ? false : originalExistsSync(path);
syncBuiltinESMExports();
const apiModuleUrl = process.env.GUEST_PASS_TEST_API_MODULE
  ? pathToFileURL(process.env.GUEST_PASS_TEST_API_MODULE)
  : new URL("../server/api.mjs", import.meta.url);
const { handleApiRequest, hasEligibleUnlimitedMembership } = await import(apiModuleUrl);

test("active unlimited memberships keep the monthly guest benefit when Mindbody reports zero remaining", () => {
  assert.equal(hasEligibleUnlimitedMembership({
    activeMemberships: [{
      name: "Unlimited Members- 12 Month Contract",
      status: "Active",
      remaining: 0,
      expirationDate: "2099-08-05"
    }]
  }), true);
});

test("expired or cancelled unlimited memberships do not receive a monthly guest benefit", () => {
  assert.equal(hasEligibleUnlimitedMembership({
    activeMemberships: [{ name: "Unlimited Membership", status: "Cancelled", remaining: 0 }]
  }), false);
  assert.equal(hasEligibleUnlimitedMembership({
    activeMemberships: [{ name: "Unlimited Membership", status: "Active", expirationDate: "2020-01-01" }]
  }), false);
});

test("class packs do not receive the unlimited monthly guest benefit", () => {
  assert.equal(hasEligibleUnlimitedMembership({
    activeServices: [{ name: "10 Class Pack", status: "Active", remaining: 10, expirationDate: "2099-01-01" }]
  }), false);
});

test("guest-pass periods use the established studio calendar", () => {
  assert.equal(GUEST_PASS_TIME_ZONE, "America/Detroit");
  assert.deepEqual(getGuestPassPeriod(new Date("2026-01-01T04:59:59Z")), { benefitMonth: "2025-12-01", renewsOn: "2026-01-01" });
  assert.deepEqual(getGuestPassPeriod(new Date("2026-01-01T05:00:00Z")), { benefitMonth: "2026-01-01", renewsOn: "2026-02-01" });
  assert.deepEqual(getGuestPassPeriod(new Date("2028-02-29T12:00:00Z")), { benefitMonth: "2028-02-01", renewsOn: "2028-03-01" });
});

test("monthly guest renewal through eligibility and dashboard routes", async (t) => {
  const originalFetch = globalThis.fetch;
  let now = Date.parse("2026-09-14T12:00:00Z");
  const OriginalDate = globalThis.Date;
  globalThis.Date = class extends OriginalDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.Date = OriginalDate;
    fs.existsSync = originalExistsSync;
    syncBuiltinESMExports();
  });

  let membership = { Id: 8, Name: "Unlimited Members- 12 Month Contract", Status: "Active", Remaining: 0, ExpirationDate: "2099-08-05" };
  let records = [];
  let trackingFailure = "";
  let membershipFailure = "";
  let clockAfterDetails = null;
  let requests = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ url, method: options.method || "GET", body });
    if (url.pathname.endsWith("/client/clientcompleteinfo")) return Response.json({ Client: { Id: "guest-test-member" } });
    if (url.pathname.endsWith("/client/clientservices")) {
      if (membershipFailure === "services") return Response.json({ Message: "Mindbody unavailable" }, { status: 503 });
      return Response.json({ ClientServices: [] });
    }
    if (url.pathname.endsWith("/client/clientcontracts")) {
      if (membershipFailure === "contracts") return Response.json({ Message: "Mindbody unavailable" }, { status: 503 });
      return Response.json({ Contracts: membership ? [membership] : [] });
    }
    if (url.pathname.endsWith("/client/clientschedule")) return Response.json({ Visits: [] });
    if (url.pathname.endsWith("/client/rewardpoints")) return Response.json({});
    if (url.pathname === "/rest/v1/guest_pass_redemptions") {
      if (trackingFailure === "details") return Response.json({ message: "Tracking offline" }, { status: 503 });
      if (trackingFailure === "invalid-details") return Response.json(null);
      const month = url.searchParams.get("benefit_month").replace(/^eq\./, "");
      if (clockAfterDetails !== null) now = clockAfterDetails;
      return Response.json(records.filter((record) => record.benefit_month === month && record.status === "booked"));
    }
    if (url.pathname === "/rest/v1/rpc/monthly_guest_pass_available") {
      if (trackingFailure === "availability") return Response.json({ message: "Tracking offline" }, { status: 503 });
      if (trackingFailure === "invalid-availability") return Response.json(null);
      return Response.json(!records.some((record) => record.benefit_month === body.p_benefit_month &&
        (record.status === "booked" || new OriginalDate(record.created_at).getTime() > now - 15 * 60_000)));
    }
    throw new Error(`Unexpected test request: ${options.method || "GET"} ${url.pathname}`);
  };

  const booked = (month) => ({ member_client_id: "guest-test-member", benefit_month: month, status: "booked", class_id: 123, guest_first_name: "Test", guest_last_name: "Guest", booked_at: `${month}T12:00:00Z` });
  const cookie = () => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(process.env.SESSION_SECRET).digest(), iv);
    const payload = { authMode: "created-client", clientId: "guest-test-member", user: { email: "member@example.invalid" }, exp: Math.floor(now / 1000) + 600 };
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
    return `cave_session=${[iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".")}`;
  };
  const readBenefit = async (path) => {
    const req = Readable.from([]);
    Object.assign(req, { method: "GET", url: path, headers: { host: "localhost", cookie: cookie() }, socket: { remoteAddress: "guest-pass-test" } });
    const headers = new Map();
    let output = "";
    const response = {
      statusCode: 200,
      setHeader(name, value) { headers.set(name, value); },
      getHeader(name) { return headers.get(name); },
      end(value) { output = value || ""; }
    };
    await handleApiRequest(req, response);
    assert.equal(response.statusCode, 200);
    const result = JSON.parse(output);
    return path.endsWith("/eligibility") ? result.data.monthlyGuestPass : result.monthlyGuestPass;
  };
  const routes = ["/api/client/eligibility", "/api/client/dashboard"];

  for (const transition of [
    { label: "local midnight", before: "2026-10-01T03:59:59Z", after: "2026-10-01T04:00:00Z", old: "2026-09-01", next: "2026-10-01", renews: "2026-11-01" },
    { label: "December/year rollover", before: "2027-01-01T04:59:59Z", after: "2027-01-01T05:00:00Z", old: "2026-12-01", next: "2027-01-01", renews: "2027-02-01" },
    { label: "leap February", before: "2028-03-01T04:59:59Z", after: "2028-03-01T05:00:00Z", old: "2028-02-01", next: "2028-03-01", renews: "2028-04-01" },
    { label: "spring DST offset", before: "2026-04-01T03:59:59Z", after: "2026-04-01T04:00:00Z", old: "2026-03-01", next: "2026-04-01", renews: "2026-05-01" },
    { label: "fall DST offset", before: "2026-12-01T04:59:59Z", after: "2026-12-01T05:00:00Z", old: "2026-11-01", next: "2026-12-01", renews: "2027-01-01" }
  ]) {
    await t.test(`${transition.label}: past usage does not consume the next month`, async () => {
      for (const route of routes) {
        records = [booked(transition.old)];
        now = OriginalDate.parse(transition.before);
        const before = await readBenefit(route);
        assert.equal(before.status, "used");
        assert.equal(before.available, false);
        assert.equal(before.benefitMonth, transition.old);
        now = OriginalDate.parse(transition.after);
        const after = await readBenefit(route);
        assert.deepEqual(after, { eligible: true, available: true, benefitMonth: transition.next, renewsOn: transition.renews, booking: null, status: "available" });
        assert.equal(records.length, 1, "renewal must leave prior-month history intact");
        records.push(booked(transition.next));
        const usedAgain = await readBenefit(route);
        assert.equal(usedAgain.status, "used");
        assert.equal(usedAgain.available, false, "the same monthly allowance cannot be reused");
      }
    });
  }

  await t.test("period stays consistent when the clock crosses midnight between tracking reads", async () => {
    for (const route of routes) {
      now = OriginalDate.parse("2026-10-01T03:59:59Z");
      clockAfterDetails = OriginalDate.parse("2026-10-01T04:00:00Z");
      records = [];
      requests = [];
      const result = await readBenefit(route);
      assert.equal(result.benefitMonth, "2026-09-01");
      assert.equal(result.renewsOn, "2026-10-01");
      const availability = requests.find((entry) => entry.url.pathname.endsWith("/monthly_guest_pass_available"));
      assert.equal(availability.body.p_benefit_month, "2026-09-01");
    }
    clockAfterDetails = null;
  });

  await t.test("tracking failures have an explicit unavailable state", async () => {
    records = [];
    for (const failure of ["details", "availability", "invalid-details", "invalid-availability"]) {
      trackingFailure = failure;
      for (const route of routes) {
        const result = await readBenefit(route);
        assert.equal(result.eligible, true);
        assert.equal(result.available, false);
        assert.equal(result.status, "unavailable");
        assert.equal(result.booking, null);
      }
    }
    trackingFailure = "";
  });

  await t.test("membership read failures stay unavailable instead of becoming ineligible", async () => {
    membership = null;
    for (const failure of ["services", "contracts"]) {
      membershipFailure = failure;
      for (const route of routes) {
        const result = await readBenefit(route);
        assert.equal(result.eligible, false);
        assert.equal(result.available, false);
        assert.equal(result.status, "unavailable");
      }
    }
    membershipFailure = "";
    membership = { Id: 8, Name: "Unlimited Members- 12 Month Contract", Status: "Active", Remaining: 0, ExpirationDate: "2099-08-05" };
  });

  await t.test("temporary reservations block duplicate use and expired reservations become available", async () => {
    const month = getGuestPassPeriod().benefitMonth;
    for (const route of routes) {
      records = [{ benefit_month: month, status: "reserved", created_at: new OriginalDate(now).toISOString() }];
      assert.equal((await readBenefit(route)).status, "reserved");
      records[0].created_at = new OriginalDate(now - 16 * 60_000).toISOString();
      assert.equal((await readBenefit(route)).status, "available");
    }
  });

  await t.test("expired and cancelled memberships stay ineligible without querying tracking", async () => {
    for (const invalid of [
      { Status: "Cancelled", ExpirationDate: "2099-08-05" },
      { Status: "Active", ExpirationDate: "2020-01-01" }
    ]) {
      membership = { ...membership, ...invalid };
      for (const route of routes) {
        requests = [];
        const result = await readBenefit(route);
        assert.equal(result.eligible, false);
        assert.equal(result.status, "ineligible");
        assert.ok(!requests.some((entry) => entry.url.hostname === "guest-pass-test.example.invalid"));
      }
    }
  });
});
