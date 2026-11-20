import { classKind, scoreVisits } from "../src/challengeScoring.js";
import { createHash } from "node:crypto";
import { isCancelledVisit } from "../src/bookingGuard.js";
import { LEADERBOARD, leaderboardName } from "../src/leaderboardConfig.js";
import { studioLocalNow } from "./frontDesk.mjs";

// Completed Mindbody attendance powers two separate challenges: an open
// reformer-class Countdown and the members-only daily-capped points board.
// Only first name and last initial leave the server. Shared bounded caches
// and single-flight refreshes prevent duplicate provider request bursts.

const MINDBODY_CONCURRENCY = 4;
const TODAY_ROSTER_TTL_MS = 4 * 60 * 1000;
const PAST_ROSTER_TTL_MS = 6 * 60 * 60 * 1000;
const PROFILE_TTL_MS = 3 * 60 * 1000;
const RESULT_TTL_MS = 4 * 60 * 1000;
const MAX_LEADERS = 50;
const PREVIEW_DAYS = 14;

const rosterCache = new Map();
const profileCache = new Map();
let resultCache = null;
let inFlight = null;

// Mindbody's Client.Status is the membership status ("Active", "Non-Member",
// "Expired", ...). MembershipStatus is only checked as a fallback.
function isMemberClient(client) {
  return [client?.Status, client?.MembershipStatus].some((value) => String(value || "").trim().toLowerCase() === "active");
}

export function resetLeaderboardCaches() {
  rosterCache.clear();
  profileCache.clear();
  resultCache = null;
  inFlight = null;
}

export async function handleLeaderboardRequest(request, response, url, deps) {
  if (url.pathname !== "/api/leaderboard") return false;

  if (request.method !== "GET") {
    sendLeaderboardJson(response, 405, { error: "Method not allowed." }, "no-store");
    return true;
  }

  try {
    const result = await leaderboardSnapshot(deps, url.searchParams.get("preview") === "1");
    const { rankings = result.leaders, countdown = [], ...publicResult } = result;
    if (url.searchParams.get("mine") === "1") {
      const clientId = await deps.currentClientId(request);
      const yourRank = clientId ? rankings.find((row) => row.key === publicKey(String(clientId))) || { position: null, classes: 0 } : null;
      sendLeaderboardJson(response, 200, { signedIn: Boolean(clientId), yourRank, countdown: clientId ? countdown.find(row=>row.key===publicKey(String(clientId))) || {completed:0,qualified:false} : null }, "private, no-store");
      return true;
    }
    const edgeSeconds = result.status === "final" ? 3600 : 240;
    sendLeaderboardJson(response, 200, publicResult, `public, max-age=0, s-maxage=${edgeSeconds}, stale-while-revalidate=600`);
  } catch (error) {
    logLeaderboardError("request failed", error);
    sendLeaderboardJson(response, 502, { error: "The leaderboard could not reach the class schedule. Try again in a minute." }, "no-store");
  }

  return true;
}

function sendLeaderboardJson(response, status, payload, cacheControl) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", cacheControl);
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  response.end(JSON.stringify(payload));
}

export function leaderboardStatus(now) {
  if (now < `${LEADERBOARD.startDate}T00:00:00`) return "upcoming";
  if (now > `${LEADERBOARD.endDate}T23:59:59`) return "final";
  return "live";
}

// The dates whose classes count. The "preview" phase is a dress rehearsal for
// before launch: the real board, scored on the last two weeks of real classes.
export function leaderboardWindow(status, now = "") {
  if (status === "preview") return { from: addDays(now.slice(0, 10), -(PREVIEW_DAYS - 1)), to: now.slice(0, 10) };
  return { from: LEADERBOARD.startDate, to: LEADERBOARD.endDate };
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function baseResult(now, status) {
  const window = leaderboardWindow(status, now);
  return {
    title: LEADERBOARD.title,
    startDate: LEADERBOARD.startDate,
    endDate: LEADERBOARD.endDate,
    windowFrom: window.from,
    windowTo: window.to,
    status,
    studioNow: now,
    updatedAt: new Date().toISOString(),
    participants: 0,
    totalClasses: 0,
    classesHeld: 0,
    leaders: []
  };
}

async function leaderboardSnapshot(deps, preview = false) {
  const now = deps.studioNow ? deps.studioNow() : studioLocalNow();
  const phase = leaderboardStatus(now);
  const status = phase === "upcoming" && preview ? "preview" : phase;

  if (status === "upcoming") return baseResult(now, status);

  // A cached result from another phase is never reused.
  if (resultCache && resultCache.status === status && resultCache.expiresAt > Date.now()) return resultCache.value;
  if (!inFlight || inFlight.status !== status) {
    const promise = buildLeaderboard(now, status, deps)
      .then((value) => {
        resultCache = { status, value, expiresAt: Date.now() + (status === "final" ? PAST_ROSTER_TTL_MS : RESULT_TTL_MS) };
        return value;
      })
      .finally(() => {
        if (inFlight?.promise === promise) inFlight = null;
      });
    inFlight = { status, promise };
  }
  return inFlight.promise;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

// Mindbody throttles bursts, so retry a failed call a couple of times before
// giving up on it.
async function withRetry(task, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || error?.statusCode || 0);
      if (status && status < 500 && status !== 429 && status !== 408) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

function logLeaderboardError(label, error) {
  console.error(`[leaderboard] ${label}:`, error?.status || error?.statusCode || "", error?.message || error);
}

async function pagedList(deps, path, params, key, token, maxItems = 2000) {
  const items = [];
  const limit = 200;
  let offset = 0;
  while (offset < maxItems) {
    const data = await withRetry(() =>
      deps.bookingRequest(path, {
        token,
        params: { ...params, "request.limit": String(limit), "request.offset": String(offset) }
      })
    );
    const page = deps.firstListByKey(data, key);
    if (!page.length) break;
    items.push(...page);
    offset += page.length;
    const total = Number(data?.PaginationResponse?.TotalResults);
    if ((Number.isFinite(total) && offset >= total) || page.length < limit) break;
  }
  return items;
}

function localTimestamp(value) {
  return String(value || "").slice(0, 19);
}

function countsAsTaken(visit) {
  return visit && typeof visit === "object" && !isCancelledVisit(visit) && visit.Missed !== true;
}

function visitClientId(visit) {
  return String(visit?.ClientId || visit?.Client?.Id || "");
}

async function classRoster(classItem, today, token, deps) {
  const cached = rosterCache.get(classItem.classId);
  if (cached && cached.expiresAt > Date.now()) return cached.visits;

  let data;
  try {
    data = await withRetry(() => deps.bookingRequest("/class/classvisits", { token, params: { "request.classID": classItem.classId } }));
  } catch (error) {
    // One unreachable roster shouldn't take the whole board down. Skip it
    // without caching so the next refresh tries again.
    logLeaderboardError(`roster for class ${classItem.classId}`, error);
    return [];
  }
  const visitClass = data?.Class || data?.Classes?.[0] || {};
  const visits = Array.isArray(visitClass.Visits) ? visitClass.Visits : Array.isArray(data?.Visits) ? data.Visits : [];
  // Rosters often include the client names directly. Use them before a
  // separate lookup, and support both Mindbody ID representations.
  const clients = [...(visitClass.Clients || []), ...visits.map((visit) => visit.Client).filter(Boolean)];
  for (const client of clients) {
    if (!client.FirstName || (client.Status == null && client.MembershipStatus == null)) continue;
    for (const id of [client.Id, client.UniqueId]) {
      if (id != null) profileCache.set(String(id), { name: leaderboardName(client.FirstName, client.LastName), member: isMemberClient(client), expiresAt: Date.now() + PROFILE_TTL_MS });
    }
  }
  const rows = visits.map(visit => ({clientId: visitClientId(visit), cancelled: isCancelledVisit(visit), missed: visit.Missed === true || /no.?show|missed/i.test(String(visit.Status || visit.VisitStatus || "")), completed: true})).filter(visit => visit.clientId);
  const unique = [...new Map(rows.map(row => [row.clientId,row])).values()];
  const ttl = classItem.start.slice(0, 10) < today ? PAST_ROSTER_TTL_MS : TODAY_ROSTER_TTL_MS;
  rosterCache.set(classItem.classId, { visits: unique, expiresAt: Date.now() + ttl });
  return unique;
}

async function clientNames(clientIds, token, deps) {
  const names = new Map();
  const missing = [];
  for (const id of clientIds) {
    const cached = profileCache.get(id);
    if (cached && cached.expiresAt > Date.now()) names.set(id, cached.name);
    else missing.push(id);
  }

  const chunks = [];
  for (let i = 0; i < missing.length; i += 50) chunks.push(missing.slice(i, i + 50));
  await mapLimit(chunks, 2, async (chunk) => {
    let data;
    try {
      data = await withRetry(() =>
        deps.bookingRequest("/client/clients", {
          token,
          params: { "request.clientIds": chunk, "request.limit": "200" }
        })
      );
    } catch (error) {
      logLeaderboardError("client names", error);
      return;
    }
    for (const client of deps.firstListByKey(data, "Clients")) {
      const id = String(client?.Id || "");
      if (!id) continue;
      const name = leaderboardName(client.FirstName, client.LastName);
      if (!client.FirstName) continue;
      for (const alias of [id, client.UniqueId].filter((value) => value != null)) {
        names.set(String(alias), name);
        profileCache.set(String(alias), { name, member: isMemberClient(client), expiresAt: Date.now() + PROFILE_TTL_MS });
      }
    }
  });

  // Some Mindbody sites do not return matches for the batched ID filter.
  // Resolve remaining IDs from a bounded, paginated client list instead.
  if (clientIds.some((id) => !names.has(id))) {
    const clients = await pagedList(deps, "/client/clients", {}, "Clients", token, 5000);
    for (const client of clients) {
      if (!client?.FirstName) continue;
      const name = leaderboardName(client.FirstName, client.LastName);
      for (const alias of [client.Id, client.UniqueId].filter((id) => id != null)) {
        const id = String(alias);
        profileCache.set(id, { name, member: isMemberClient(client), expiresAt: Date.now() + PROFILE_TTL_MS });
        if (clientIds.includes(id)) names.set(id, name);
      }
    }
  }
  return names;
}

// Stable, non-reversible key per client so the page can animate rows without
// ever seeing a Mindbody client ID.
function publicKey(clientId) {
  return createHash("sha256").update(`cave-leaderboard:${process.env.SESSION_SECRET || ""}:${clientId}`).digest("hex").slice(0, 12);
}

export function rankLeaders(classesTaken, names) {
  // classesTaken: Map<clientId, string[]> of finished class start times.
  return [...classesTaken.entries()]
    .map(([clientId, starts]) => {
      const sorted = [...starts].sort();
      return {
        clientId,
        name: names.get(clientId) || "Cave client",
        classes: sorted.length,
        // Ties go to whoever reached that total first.
        reachedAt: sorted.at(-1) || ""
      };
    })
    .filter((row) => row.classes > 0)
    .sort((a, b) => b.classes - a.classes || a.reachedAt.localeCompare(b.reachedAt) || a.name.localeCompare(b.name))
    .map((row, index) => ({ position: index + 1, key: publicKey(row.clientId), name: row.name, classes: row.classes }));
}

async function buildLeaderboard(now, status, deps) {
  const token = await deps.getMindbodyActionToken("Class leaderboard");
  const today = now.slice(0, 10);
  const window = leaderboardWindow(status, now);
  const lastDay = today < window.to ? today : window.to;

  const rawClasses = await pagedList(
    deps,
    "/class/classes",
    {
      "request.startDateTime": `${window.from}T00:00:00`,
      "request.endDateTime": `${lastDay}T23:59:59`,
      "request.hideCanceledClasses": "true"
    },
    "Classes",
    token,
    2000
  );

  // A class earns its point once it has finished.
  const finished = rawClasses
    .filter((item) => item && typeof item === "object" && !item.IsCanceled && Number(item.Id) > 0)
    .map((item) => ({
      classId: Number(item.Id),
      start: localTimestamp(item.StartDateTime),
      end: localTimestamp(item.EndDateTime || item.StartDateTime),
      kind: classKind(item.ClassDescription?.Name || item.Name)
    }))
    .filter((item) => item.start >= `${window.from}T00:00:00` && item.start <= `${window.to}T23:59:59` && item.end && item.end <= now);

  const uniqueClasses = [...new Map(finished.map((item) => [item.classId, item])).values()];
  const rosters = await mapLimit(uniqueClasses, MINDBODY_CONCURRENCY, (item) => classRoster(item, today, token, deps));

  const events = new Map();
  uniqueClasses.forEach((item,index) => {
    for(const visit of rosters[index]) {
      if (visit.cancelled || (!visit.completed && !visit.missed) || !item.kind) continue;
      if(!events.has(visit.clientId)) events.set(visit.clientId,[]);
      events.get(visit.clientId).push({...visit,kind:item.kind,start:item.end});
    }
  });
  const names = await clientNames([...events.keys()],token,deps);
  const progress = [...events].map(([id,visits]) => ({id,...scoreVisits(visits)}));
  const ranked = progress.filter(row => profileCache.get(row.id)?.member)
    .sort((a,b)=>b.points-a.points || a.reachedAt.localeCompare(b.reachedAt) || a.id.localeCompare(b.id))
    .map((row,index)=>({position:index+1,key:publicKey(row.id),name:names.get(row.id)||"Cave client",classes:row.points}));
  return {
    ...baseResult(now,status),
    participants: ranked.length,
    totalClasses: progress.reduce((sum,row)=>sum+row.reformerClasses,0),
    classesHeld: uniqueClasses.length,
    countdown: progress.map(row=>({key:publicKey(row.id),completed:row.reformerClasses,qualified:row.qualified})),
    rankings: ranked,
    leaders: ranked.slice(0,MAX_LEADERS)
  };
}
