import assert from "node:assert/strict";
import test from "node:test";

import { leaderboardName } from "../src/leaderboardConfig.js";
import { handleLeaderboardRequest, leaderboardStatus, rankLeaders, resetLeaderboardCaches } from "../server/leaderboard.mjs";

// Mocked Mindbody responses only.
const classes = [
  { Id: 1, StartDateTime: "2026-12-05T09:00:00", EndDateTime: "2026-12-05T09:50:00" }, // before the start: ignored
  { Id: 2, StartDateTime: "2026-12-06T09:00:00", EndDateTime: "2026-12-06T09:50:00" },
  { Id: 3, StartDateTime: "2026-12-07T09:00:00", EndDateTime: "2026-12-07T09:50:00" },
  { Id: 4, StartDateTime: "2026-12-07T18:00:00", EndDateTime: "2026-12-07T18:50:00" }, // not finished yet
  { Id: 5, StartDateTime: "2026-12-07T08:00:00", EndDateTime: "2026-12-07T08:50:00", IsCanceled: true }
];
const rosters = {
  1: [{ ClientId: "101" }, { ClientId: "102" }],
  2: [{ ClientId: "101" }, { ClientId: "102", LateCancelled: true }, { ClientId: "103" }],
  3: [{ ClientId: "101" }, { ClientId: "103" }, { ClientId: "104", Missed: true }],
  4: [{ ClientId: "102" }]
};
const people = {
  101: { Id: "101", FirstName: "amira", LastName: "Haddad" },
  102: { Id: "102", FirstName: "Dana", LastName: "Ray" },
  103: { Id: "103", FirstName: "Lina Marie", LastName: "saleh" },
  104: { Id: "104", FirstName: "Noor", LastName: "Ali" }
};

function fakeDeps(now, calls) {
  return {
    studioNow: () => now,
    getMindbodyActionToken: async () => "token",
    firstListByKey: (data, key) => data?.[key] || [],
    bookingRequest: async (path, { params }) => {
      calls.push(path);
      if (path === "/class/classes") return { Classes: classes, PaginationResponse: { TotalResults: classes.length } };
      if (path === "/class/classvisits") return { Class: { Visits: rosters[params["request.classID"]] || [] } };
      if (path === "/client/clients") return { Clients: params["request.clientIds"].map((id) => people[id]) };
      throw new Error(`Unexpected ${path}`);
    }
  };
}

function fakeResponse() {
  return {
    headers: {},
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    end(body) {
      this.body = JSON.parse(body);
    }
  };
}

async function request(now, calls = []) {
  const response = fakeResponse();
  const handled = await handleLeaderboardRequest({ method: "GET" }, response, new URL("http://x/api/leaderboard"), fakeDeps(now, calls));
  assert.equal(handled, true);
  return response;
}

test("names show first name and last initial only", () => {
  assert.equal(leaderboardName("amira", "Haddad"), "Amira H.");
  assert.equal(leaderboardName("Lina Marie", "saleh"), "Lina S.");
  assert.equal(leaderboardName("Dana", ""), "Dana");
  assert.equal(leaderboardName("", ""), "Cave client");
});

test("status follows the Dec 6 to Dec 20 window", () => {
  assert.equal(leaderboardStatus("2026-12-05T23:59:59"), "upcoming");
  assert.equal(leaderboardStatus("2026-12-06T00:00:00"), "live");
  assert.equal(leaderboardStatus("2026-12-20T23:59:59"), "live");
  assert.equal(leaderboardStatus("2026-12-21T00:00:00"), "final");
});

test("before the start the board is empty and Mindbody is not called", async () => {
  resetLeaderboardCaches();
  const calls = [];
  const response = await request("2026-11-19T10:00:00", calls);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "upcoming");
  assert.deepEqual(response.body.leaders, []);
  assert.deepEqual(calls, []);
});

test("counts finished classes from Dec 6 only, skipping cancels and no-shows", async () => {
  resetLeaderboardCaches();
  const response = await request("2026-12-07T12:00:00");
  const body = response.body;
  assert.equal(body.status, "live");
  assert.match(response.headers["cache-control"], /s-maxage=/);
  assert.deepEqual(body.leaders.map(({ name, classes, position }) => ({ name, classes, position })), [
    { name: "Amira H.", classes: 2, position: 1 },
    { name: "Lina S.", classes: 2, position: 2 }
  ]);
  assert.equal(body.totalClasses, 4);
  assert.equal(body.participants, 2);
  assert.equal(body.classesHeld, 2);
  const text = JSON.stringify(body);
  assert.doesNotMatch(text, /Haddad|saleh|"101"|clientId/);
});

test("ties go to whoever reached the total first", () => {
  const ranked = rankLeaders(
    new Map([
      ["a", ["2026-12-06T09:00:00", "2026-12-08T09:00:00"]],
      ["b", ["2026-12-06T10:00:00", "2026-12-07T09:00:00"]],
      ["c", ["2026-12-06T11:00:00"]]
    ]),
    new Map([["a", "Ann A."], ["b", "Bea B."], ["c", "Cy C."]])
  );
  assert.deepEqual(ranked.map((row) => row.name), ["Bea B.", "Ann A.", "Cy C."]);
});

test("before launch, ?preview=1 scores the last two weeks of real classes", async () => {
  resetLeaderboardCaches();
  const calls = [];
  const response = fakeResponse();
  await handleLeaderboardRequest({ method: "GET" }, response, new URL("http://x/api/leaderboard?preview=1"), fakeDeps("2026-12-05T12:00:00", calls));
  assert.equal(response.body.status, "preview");
  assert.equal(response.body.windowFrom, "2026-11-22");
  assert.ok(calls.includes("/class/classes"));
  // Dec 5 class counts in the preview window; Dec 6+ classes are in the future.
  assert.deepEqual(response.body.leaders.map((row) => row.name), ["Amira H.", "Dana R."]);
});

test("a roster Mindbody won't return is retried, then skipped instead of failing the board", async () => {
  resetLeaderboardCaches();
  const deps = fakeDeps("2026-12-07T12:00:00", []);
  const realRequest = deps.bookingRequest;
  let classThreeTries = 0;
  deps.bookingRequest = async (path, options) => {
    if (path === "/class/classvisits" && options.params["request.classID"] === 3) {
      classThreeTries += 1;
      const error = new Error("Too many requests");
      error.status = 429;
      throw error;
    }
    return realRequest(path, options);
  };
  const realError = console.error;
  console.error = () => {};
  const response = fakeResponse();
  try {
    await handleLeaderboardRequest({ method: "GET" }, response, new URL("http://x/api/leaderboard"), deps);
  } finally {
    console.error = realError;
  }
  assert.equal(classThreeTries, 3);
  assert.equal(response.statusCode ?? 200, 200);
  assert.deepEqual(response.body.leaders.map(({ name, classes }) => ({ name, classes })), [
    { name: "Amira H.", classes: 1 },
    { name: "Lina S.", classes: 1 }
  ]);
});
