import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { isMilestone, nextMilestone, ordinal, previousMilestone } from "../src/milestones.js";

// Synthetic credentials and mocked Mindbody responses only.
for (const key of Object.keys(process.env)) {
  if (/^(BOOKING_|MINDBODY_|FRONT_DESK_|SESSION_SECRET$)/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: "test",
  SESSION_SECRET: "front-desk-test-session-secret",
  BOOKING_API_KEY: "front-desk-test-api-key",
  BOOKING_SITE_ID: "front-desk-test-studio",
  BOOKING_STAFF_TOKEN: "front-desk-test-staff-token",
  FRONT_DESK_PASSWORD: "reformer-desk-test"
});

const originalExistsSync = fs.existsSync;
const isEnvFile = (path) => [".env", ".env.local"].includes(basename(String(path)));
fs.existsSync = (path) => (isEnvFile(path) ? false : originalExistsSync(path));
syncBuiltinESMExports();

const { handleApiRequest } = await import("../server/api.mjs");
const { resetFrontDeskCaches, studioLocalNow, summarizeClientVisits } = await import("../server/frontDesk.mjs");

const now = studioLocalNow();
const today = now.slice(0, 10);
const inTwoHours = new Date(Date.now() + 2 * 60 * 60 * 1000);
const laterToday = studioLocalNow(inTwoHours).slice(0, 10) === today ? studioLocalNow(inTwoHours) : `${today}T23:59:00`;

function pastVisits(clientId, count, extra = []) {
  return [
    ...Array.from({ length: count }, (_, index) => ({
      Id: `${clientId}-${index}`,
      ClientId: clientId,
      ClassId: 1000 + index,
      StartDateTime: `2025-0${1 + (index % 9)}-${String(1 + (index % 27)).padStart(2, "0")}T0${index % 10}:00:00`,
      Name: "Reformer Flow"
    })),
    ...extra
  ];
}

const visitsByClient = {
  // 24 completed + booked today = 25th class.
  "101": pastVisits("101", 24, [
    { Id: "101-late", ClientId: "101", ClassId: 1999, StartDateTime: "2025-03-03T09:00:00", LateCancelled: true },
    { Id: "101-miss", ClientId: "101", ClassId: 1998, StartDateTime: "2025-03-04T09:00:00", Missed: true },
    { Id: "101-today", ClientId: "101", ClassId: 501, StartDateTime: laterToday, Name: "Reformer Flow" }
  ]),
  // 7 completed + booked today = 8th class (no milestone).
  "102": pastVisits("102", 7, [{ Id: "102-today", ClientId: "102", ClassId: 501, StartDateTime: laterToday }])
};
let upstreamCalls = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  upstreamCalls.push(url);
  assert.equal(options.headers.Authorization, "Bearer front-desk-test-staff-token");

  if (url.pathname.endsWith("/class/classes")) {
    return Response.json({
      Classes: [{ Id: 501, StartDateTime: laterToday, EndDateTime: laterToday, ClassDescription: { Name: "Reformer Flow" }, Staff: { Name: "Lila" }, MaxCapacity: 10 }],
      PaginationResponse: { TotalResults: 1 }
    });
  }
  if (url.pathname.endsWith("/class/classvisits")) {
    return Response.json({ Class: { Visits: [{ ClientId: "101" }, { ClientId: "102" }, { ClientId: "103", LateCancelled: true }] } });
  }
  if (url.pathname.endsWith("/client/clients")) {
    if (url.searchParams.get("request.searchText")) {
      return Response.json({ Clients: [{ Id: "102", FirstName: "Dana", LastName: "Ray" }] });
    }
    return Response.json({
      Clients: [
        { Id: "101", FirstName: "Amira", LastName: "Haddad" },
        { Id: "102", FirstName: "Dana", LastName: "Ray" }
      ]
    });
  }
  if (url.pathname.endsWith("/client/clientvisits")) {
    const visits = visitsByClient[url.searchParams.get("request.clientId")] || [];
    return Response.json({ Visits: visits, PaginationResponse: { TotalResults: visits.length } });
  }
  throw new Error(`Unexpected mocked upstream request: ${url.pathname}`);
};

async function request(path, { method = "GET", body, cookie = "" } = {}) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  req.url = path;
  req.method = method;
  req.headers = { host: "localhost", origin: "http://localhost", cookie, "content-type": "application/json" };
  req.socket = { remoteAddress: "front-desk-test" };
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

function frontDeskCookie(result) {
  const cookies = [].concat(result.headers.get("set-cookie") || []);
  return cookies.map((cookie) => cookie.split(";")[0]).find((cookie) => cookie.startsWith("cave_front_desk=")) || "";
}

test.after(() => {
  globalThis.fetch = originalFetch;
  fs.existsSync = originalExistsSync;
  syncBuiltinESMExports();
});

test("milestones are 5, 10, 25, 50, 75, 100 then every 25", () => {
  const hits = Array.from({ length: 300 }, (_, index) => index + 1).filter(isMilestone);
  assert.deepEqual(hits, [5, 10, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300]);
  assert.equal(nextMilestone(0), 5);
  assert.equal(nextMilestone(10), 25);
  assert.equal(nextMilestone(100), 125);
  assert.equal(nextMilestone(126), 150);
  assert.equal(previousMilestone(4), 0);
  assert.equal(previousMilestone(30), 25);
  assert.equal(previousMilestone(149), 125);
  assert.deepEqual([1, 2, 3, 11, 12, 13, 22, 25, 101].map(ordinal), ["1st", "2nd", "3rd", "11th", "12th", "13th", "22nd", "25th", "101st"]);
});

test("class counts skip cancelled, late-cancelled and missed visits", () => {
  const summary = summarizeClientVisits(visitsByClient["101"], now);
  assert.equal(summary.completedCount, 24);
  assert.equal(summary.upcomingCount, 1);
  assert.equal(summary.byClassId.get(501).classNumber, 25);
  assert.deepEqual(summary.upcomingMilestones.map((visit) => visit.classNumber), [25]);
  assert.equal(summary.nextMilestone, 25);
  assert.equal(summary.classesToNextMilestone, 1);
});

test("front desk page requires the staff password", async () => {
  resetFrontDeskCaches();

  const session = await request("/api/front-desk/session");
  assert.deepEqual(session.body, { configured: true, authenticated: false });

  const blocked = await request("/api/front-desk/dashboard");
  assert.equal(blocked.status, 401);

  const wrong = await request("/api/front-desk/login", { method: "POST", body: { password: "nope" } });
  assert.equal(wrong.status, 401);
  assert.equal(frontDeskCookie(wrong), "");

  const forged = await request("/api/front-desk/dashboard", { cookie: "cave_front_desk=not-a-real-token" });
  assert.equal(forged.status, 401);
  assert.equal(upstreamCalls.length, 0, "no Mindbody calls before sign-in");
});

test("signed-in staff see class counts and milestone alerts", async () => {
  resetFrontDeskCaches();
  upstreamCalls = [];

  const login = await request("/api/front-desk/login", { method: "POST", body: { password: "reformer-desk-test" } });
  assert.equal(login.status, 200);
  const cookie = frontDeskCookie(login);
  assert.ok(cookie);
  const rawCookie = [].concat(login.headers.get("set-cookie")).find((value) => value.startsWith("cave_front_desk="));
  assert.match(rawCookie, /HttpOnly/);
  assert.match(rawCookie, /SameSite=Strict/);

  const session = await request("/api/front-desk/session", { cookie });
  assert.equal(session.body.authenticated, true);

  const dashboard = await request("/api/front-desk/dashboard?days=1", { cookie });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.window.startDate, today);
  assert.equal(dashboard.body.classes.length, 1);

  const roster = dashboard.body.classes[0].clients;
  assert.deepEqual(roster.map((client) => [client.name, client.classNumber, client.isMilestone]), [
    ["Amira Haddad", 25, true],
    ["Dana Ray", 8, false]
  ]);
  assert.deepEqual(dashboard.body.upcomingMilestones.map((entry) => [entry.name, entry.milestone, entry.classId, entry.instructor]), [["Amira Haddad", 25, 501, "Lila"]]);
  assert.deepEqual(dashboard.body.clients.map((client) => [client.name, client.completedCount, client.nextMilestone]), [
    ["Amira Haddad", 24, 25],
    ["Dana Ray", 7, 10]
  ]);

  const search = await request("/api/front-desk/client-search?q=dana", { cookie });
  assert.equal(search.status, 200);
  assert.deepEqual(search.body.clients.map((client) => [client.name, client.completedCount]), [["Dana Ray", 7]]);

  const logout = await request("/api/front-desk/logout", { method: "POST", cookie });
  assert.match([].concat(logout.headers.get("set-cookie")).join(";"), /cave_front_desk=;.*Max-Age=0/);
});

test("changing the password signs existing devices out", async () => {
  const login = await request("/api/front-desk/login", { method: "POST", body: { password: "reformer-desk-test" } });
  const cookie = frontDeskCookie(login);
  process.env.FRONT_DESK_PASSWORD = "new-desk-password";
  try {
    const session = await request("/api/front-desk/session", { cookie });
    assert.equal(session.body.authenticated, false);
  } finally {
    process.env.FRONT_DESK_PASSWORD = "reformer-desk-test";
  }
});
