import { createHash } from "node:crypto";
import { isCancelledVisit } from "../src/bookingGuard.js";
import { LEADERBOARD, leaderboardName } from "../src/leaderboardConfig.js";
import { studioLocalNow } from "./frontDesk.mjs";

// Public class leaderboard (/leaderboard). One point per class a client takes
// inside the challenge window. Counts come from Mindbody class rosters
// (/class/classvisits) for classes that have finished, using the same rule as
// the front desk page: a visit counts unless it was cancelled, late-cancelled,
// or marked missed. Only first name + last initial ever leave the server.
//
// Mindbody load stays low: nothing is called before the start date, finished
// days' rosters are cached for hours, today's for a few minutes, and the
// response is cached at Vercel's edge so many viewers share one result.

const MINDBODY_CONCURRENCY = 6;
const TODAY_ROSTER_TTL_MS = 4 * 60 * 1000;
const PAST_ROSTER_TTL_MS = 6 * 60 * 60 * 1000;
const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;
const RESULT_TTL_MS = 4 * 60 * 1000;
const MAX_LEADERS = 250;

const rosterCache = new Map();
const profileCache = new Map();
let resultCache = null;
let inFlight = null;

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
    const result = await leaderboardSnapshot(deps);
    const edgeSeconds = result.status === "final" ? 3600 : 240;
    sendLeaderboardJson(response, 200, result, `public, max-age=0, s-maxage=${edgeSeconds}, stale-while-revalidate=600`);
  } catch (error) {
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

function baseResult(now, status) {
  return {
    title: LEADERBOARD.title,
    startDate: LEADERBOARD.startDate,
    endDate: LEADERBOARD.endDate,
    status,
    studioNow: now,
    updatedAt: new Date().toISOString(),
    participants: 0,
    totalClasses: 0,
    classesHeld: 0,
    leaders: []
  };
}

async function leaderboardSnapshot(deps) {
  const now = deps.studioNow ? deps.studioNow() : studioLocalNow();
  const status = leaderboardStatus(now);

  // The board resets on the start date: before it there is nothing to count.
  if (status === "upcoming") return baseResult(now, status);

  if (resultCache && resultCache.expiresAt > Date.now()) return resultCache.value;
  if (!inFlight) {
    inFlight = buildLeaderboard(now, status, deps)
      .then((value) => {
        resultCache = { value, expiresAt: Date.now() + (status === "final" ? PAST_ROSTER_TTL_MS : RESULT_TTL_MS) };
        return value;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
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

async function pagedList(deps, path, params, key, token, maxItems = 2000) {
  const items = [];
  const limit = 200;
  let offset = 0;
  while (offset < maxItems) {
    const data = await deps.bookingRequest(path, {
      token,
      params: { ...params, "request.limit": String(limit), "request.offset": String(offset) }
    });
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
  if (cached && cached.expiresAt > Date.now()) return cached.clientIds;

  const data = await deps.bookingRequest("/class/classvisits", { token, params: { "request.classID": classItem.classId } });
  const visitClass = data?.Class || data?.Classes?.[0] || {};
  const visits = Array.isArray(visitClass.Visits) ? visitClass.Visits : Array.isArray(data?.Visits) ? data.Visits : [];
  const clientIds = [...new Set(visits.filter(countsAsTaken).map(visitClientId).filter(Boolean))];

  const ttl = classItem.start.slice(0, 10) < today ? PAST_ROSTER_TTL_MS : TODAY_ROSTER_TTL_MS;
  rosterCache.set(classItem.classId, { clientIds, expiresAt: Date.now() + ttl });
  return clientIds;
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
    const data = await deps.bookingRequest("/client/clients", {
      token,
      params: { "request.clientIds": chunk, "request.limit": "200" }
    });
    for (const client of deps.firstListByKey(data, "Clients")) {
      const id = String(client?.Id || "");
      if (!id) continue;
      const name = leaderboardName(client.FirstName, client.LastName);
      names.set(id, name);
      profileCache.set(id, { name, expiresAt: Date.now() + PROFILE_TTL_MS });
    }
  });

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
  const lastDay = today < LEADERBOARD.endDate ? today : LEADERBOARD.endDate;

  const rawClasses = await pagedList(
    deps,
    "/class/classes",
    {
      "request.startDateTime": `${LEADERBOARD.startDate}T00:00:00`,
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
      end: localTimestamp(item.EndDateTime || item.StartDateTime)
    }))
    .filter((item) => item.start >= `${LEADERBOARD.startDate}T00:00:00` && item.start <= `${LEADERBOARD.endDate}T23:59:59` && item.end && item.end <= now);

  const uniqueClasses = [...new Map(finished.map((item) => [item.classId, item])).values()];
  const rosters = await mapLimit(uniqueClasses, MINDBODY_CONCURRENCY, (item) => classRoster(item, today, token, deps));

  const classesTaken = new Map();
  uniqueClasses.forEach((item, index) => {
    for (const clientId of rosters[index]) {
      if (!classesTaken.has(clientId)) classesTaken.set(clientId, []);
      classesTaken.get(clientId).push(item.start);
    }
  });

  const names = await clientNames([...classesTaken.keys()], token, deps);
  const ranked = rankLeaders(classesTaken, names);

  return {
    ...baseResult(now, status),
    participants: ranked.length,
    totalClasses: ranked.reduce((sum, row) => sum + row.classes, 0),
    classesHeld: uniqueClasses.length,
    leaders: ranked.slice(0, MAX_LEADERS)
  };
}
