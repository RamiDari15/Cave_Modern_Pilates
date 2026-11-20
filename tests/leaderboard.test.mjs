import assert from "node:assert/strict";
import test from "node:test";

import { leaderboardName } from "../src/leaderboardConfig.js";
import { handleLeaderboardRequest, leaderboardStatus, rankLeaders, resetLeaderboardCaches } from "../server/leaderboard.mjs";

// Mocked Mindbody responses only.
const classes = [
  { Id: 1, ClassDescription: {Name:"Cave Signature"}, StartDateTime: "2026-12-05T09:00:00", EndDateTime: "2026-12-05T09:50:00" }, // before the start: ignored
  { Id: 2, ClassDescription: {Name:"Cave Signature"}, StartDateTime: "2026-12-06T09:00:00", EndDateTime: "2026-12-06T09:50:00" },
  { Id: 3, ClassDescription: {Name:"Cave Signature"}, StartDateTime: "2026-12-07T09:00:00", EndDateTime: "2026-12-07T09:50:00" },
  { Id: 4, ClassDescription: {Name:"Cave Signature"}, StartDateTime: "2026-12-07T18:00:00", EndDateTime: "2026-12-07T18:50:00" }, // not finished yet
  { Id: 5, ClassDescription: {Name:"Cave Signature"}, StartDateTime: "2026-12-07T08:00:00", EndDateTime: "2026-12-07T08:50:00", IsCanceled: true }
];
const rosters = {
  1: [{ SignedIn:true, ClientId: "101" }, { SignedIn:true, ClientId: "102" }],
  2: [{ SignedIn:true, ClientId: "101" }, { SignedIn:true, ClientId: "102", LateCancelled: true }, { SignedIn:true, ClientId: "103" }],
  3: [{ SignedIn:true, ClientId: "101" }, { SignedIn:true, ClientId: "103" }, { SignedIn:true, ClientId: "104", Missed: true }],
  4: [{ SignedIn:true, ClientId: "102" }]
};
const people = {
  101: { Id: "101", MembershipStatus: "Active", FirstName: "amira", LastName: "Haddad" },
  102: { Id: "102", MembershipStatus: "Active", FirstName: "Dana", LastName: "Ray" },
  103: { Id: "103", MembershipStatus: "Active", FirstName: "Lina Marie", LastName: "saleh" },
  104: { Id: "104", MembershipStatus: "Active", FirstName: "Noor", LastName: "Ali" }
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

test("scores completed classes from Dec 6 and deducts no-shows, skipping cancels", async () => {
  resetLeaderboardCaches();
  const response = await request("2026-12-07T12:00:00");
  const body = response.body;
  assert.equal(body.status, "live");
  assert.match(response.headers["cache-control"], /s-maxage=/);
  assert.deepEqual(body.leaders.map(({ name, classes, position }) => ({ name, classes, position })), [
    { name: "Amira H.", classes: 2, position: 1 },
    { name: "Lina S.", classes: 2, position: 2 },
    { name: "Noor A.", classes: -1, position: 3 }
  ]);
  assert.equal(body.totalClasses, 4);
  assert.equal(body.participants, 3);
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

test("resolves missing names from paginated clients and limits the public board to 50", async () => {
  resetLeaderboardCaches();
  const deps = fakeDeps("2026-12-07T12:00:00", []);
  const original = deps.bookingRequest;
  deps.bookingRequest = async (path, options) => {
    if (path === "/class/classvisits") return { Visits: Array.from({length:60}, (_,i) => ({SignedIn:true, ClientId:String(i+1)})) };
    if (path === "/client/clients") return { Clients: options.params["request.clientIds"] ? [] : Array.from({length:60}, (_,i) => ({Id:String(i+1), MembershipStatus: "Active", FirstName:`Member${i+1}`, LastName:"Cave"})) };
    return original(path, options);
  };
  const publicResponse = fakeResponse();
  await handleLeaderboardRequest({method:"GET"}, publicResponse, new URL("http://x/api/leaderboard"), deps);
  assert.equal(publicResponse.body.leaders.length,50);
  assert.equal(publicResponse.body.participants,60);
  assert.ok(publicResponse.body.leaders.every(row => row.name.startsWith("Member")));
  assert.equal(publicResponse.body.rankings,undefined);
  deps.currentClientId = async () => "9";
  const personal = fakeResponse();
  await handleLeaderboardRequest({method:"GET"}, personal, new URL("http://x/api/leaderboard?mine=1"), deps);
  assert.ok(personal.body.yourRank.position > 50);
  assert.equal(personal.headers["cache-control"],"private, no-store");
  deps.currentClientId = async () => null;
  const anonymous = fakeResponse();
  await handleLeaderboardRequest({method:"GET"}, anonymous, new URL("http://x/api/leaderboard?mine=1"), deps);
  assert.equal(anonymous.body.yourRank,null);
});

 test("nonmembers receive Countdown progress but no member rank", async () => {
  resetLeaderboardCaches();
  const old = people[101].MembershipStatus;
  people[101].MembershipStatus = "Terminated";
  try {
    const deps = fakeDeps("2026-12-07T12:00:00", []);
    deps.currentClientId = async () => "101";
    const response = fakeResponse();
    await handleLeaderboardRequest({method:"GET"}, response, new URL("http://x/api/leaderboard?mine=1"), deps);
    assert.equal(response.body.yourRank.position, null);
    const publicResponse = await request("2026-12-07T12:00:00");
    assert.equal(publicResponse.body.leaders.some(row => row.name === "Amira H."), false);
    assert.equal(response.body.countdown.completed, 2);
  } finally { people[101].MembershipStatus = old; resetLeaderboardCaches(); }
});

test("membership comes from Mindbody's Client.Status, and a finished class counts without a check-in", async () => {
  resetLeaderboardCaches();
  const deps = fakeDeps("2026-12-07T12:00:00", []);
  const realRequest = deps.bookingRequest;
  deps.bookingRequest = async (path, options) => {
    if (path === "/class/classvisits") return { Class: { Visits: [{ ClientId: "201" }, { ClientId: "202" }] } };
    if (path === "/client/clients") {
      return { Clients: [
        { Id: "201", Status: "Active", FirstName: "Maya", LastName: "Kim" },
        { Id: "202", Status: "Non-Member", FirstName: "Rita", LastName: "Lee" }
      ] };
    }
    return realRequest(path, options);
  };
  const response = fakeResponse();
  await handleLeaderboardRequest({ method: "GET" }, response, new URL("http://x/api/leaderboard"), deps);
  assert.deepEqual(response.body.leaders.map(({ name, classes }) => ({ name, classes })), [{ name: "Maya K.", classes: 2 }]);
  assert.equal(response.body.totalClasses, 4);
});

test("preview cache cannot carry scores into December 6", async () => {
  resetLeaderboardCaches();
  const preview = fakeResponse();
  await handleLeaderboardRequest({method:"GET"}, preview, new URL("http://x/api/leaderboard?preview=1"), fakeDeps("2026-12-05T12:00:00", []));
  assert.ok(preview.body.totalClasses > 0);
  const launch = await request("2026-12-06T00:00:00");
  assert.equal(launch.body.status, "live");
  assert.equal(launch.body.windowFrom, "2026-12-06");
  assert.equal(launch.body.totalClasses, 0);
  assert.deepEqual(launch.body.leaders, []);
});

test("refreshes share work; old corrections refresh after 15 minutes without rereading every 3 minutes", async () => {
  resetLeaderboardCaches();
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  const calls = [];
  const deps = fakeDeps("2026-12-07T12:00:00", calls);
  const original = deps.bookingRequest;
  let corrected = false;
  deps.bookingRequest = async (path, options) => {
    if (corrected && path === "/class/classvisits" && Number(options.params["request.classID"]) === 2) {
      calls.push(path);
      return {Class:{Visits:[]}};
    }
    return original(path, options);
  };
  const run = async () => {
    const response = fakeResponse();
    await handleLeaderboardRequest({method:"GET"}, response, new URL("http://x/api/leaderboard"), deps);
    return response;
  };
  try {
    const responses = await Promise.all(Array.from({length:10},run));
    assert.equal(calls.filter(p=>p==="/class/classes").length,1);
    assert.equal(calls.filter(p=>p==="/class/classvisits").length,2);
    assert.equal(responses[0].body.totalClasses,4);
    clock += 2 * 60 * 1000;
    const cached = await run();
    assert.match(cached.headers['cache-control'], /s-maxage=50/);
    assert.doesNotMatch(cached.headers['cache-control'], /stale-while-revalidate/);
    corrected = true;
    clock += 60 * 1000 + 1;
    const freshToday = await run();
    assert.equal(calls.filter(p=>p==="/class/classvisits").length,3);
    assert.equal(freshToday.body.totalClasses,4);
    clock += 12 * 60 * 1000;
    const correctedPast = await run();
    assert.equal(correctedPast.body.totalClasses,2);
    assert.equal(calls.filter(p=>p==="/class/classvisits").length,5);
  } finally {Date.now=realNow;resetLeaderboardCaches();}
});
