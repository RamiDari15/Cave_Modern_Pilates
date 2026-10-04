import { createHash, timingSafeEqual } from "node:crypto";
import { isCancelledVisit } from "../src/bookingGuard.js";
import { isMilestone, nextMilestone } from "../src/milestones.js";
import {
  CLIENT_FILTERS,
  CLIENT_SORTS,
  clientsWithBookings,
  frontDeskStoreConfig,
  listClientCounts,
  readClientRow,
  readSyncState,
  syncCandidates,
  syncProgress,
  upsertClientRows,
  writeSyncState
} from "./frontDeskStore.mjs";

// Front desk class counts. Staff unlock the page with FRONT_DESK_PASSWORD; the
// server checks it and sets a sealed, HttpOnly cookie. Every Mindbody call stays
// server-side and uses the source-credential action token, never the browser.

export const FRONT_DESK_COOKIE = "cave_front_desk";
const FRONT_DESK_TTL_SECONDS = 12 * 60 * 60;
const STUDIO_TIME_ZONE = "America/Chicago";
const DEFAULT_HISTORY_START = "2020-01-01";
const MAX_WINDOW_DAYS = 7;
const DEFAULT_WINDOW_DAYS = 3;
const RECENT_MILESTONE_DAYS = 3;
const MINDBODY_CONCURRENCY = 6;
const VISIT_CACHE_TTL_MS = 10 * 60 * 1000;
const ROSTER_CACHE_TTL_MS = 3 * 60 * 1000;
const LOGIN_LIMIT = { count: 8, windowMs: 15 * 60 * 1000 };
// All-client snapshot sync: each step lists up to a few pages of clients and
// refreshes a small batch of visit histories, so Mindbody calls stay spread out.
const CLIENT_LIST_PAGES_PER_STEP = 5;
const CLIENT_LIST_REFRESH_MS = 24 * 60 * 60 * 1000;
const VISIT_BATCH_PER_STEP = 25;
const ACTIVE_CLIENT_REFRESH_MS = 12 * 60 * 60 * 1000;
const INACTIVE_CLIENT_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_CLIENT_DAYS = 45;
const STAFF_SYNC_BUDGET_MS = 8_000;
const CRON_SYNC_BUDGET_MS = 50_000;

const visitCache = new Map();
const rosterCache = new Map();
const loginFailures = new Map();

export function resetFrontDeskCaches() {
  visitCache.clear();
  rosterCache.clear();
  loginFailures.clear();
}

export async function handleFrontDeskRequest(request, response, url, deps) {
  const path = url.pathname;
  const { sendJson, httpError } = deps;

  if (path === "/api/front-desk/session" && request.method === "GET") {
    sendJson(response, 200, { configured: Boolean(frontDeskPassword()), authenticated: hasFrontDeskSession(request, deps) });
    return true;
  }

  if (path === "/api/front-desk/login" && request.method === "POST") {
    const password = frontDeskPassword();

    if (!password) {
      throw httpError(503, "The front desk password has not been set up yet.");
    }

    const ip = clientIp(request);
    enforceLoginLimit(ip, httpError);
    const body = await deps.readJsonBody(request);

    if (!passwordsMatch(String(body?.password || ""), password)) {
      recordLoginFailure(ip);
      throw httpError(401, "That password is not right.");
    }

    loginFailures.delete(ip);
    const token = deps.seal({ role: "front-desk", pw: passwordFingerprint(password), exp: nowSeconds() + FRONT_DESK_TTL_SECONDS });
    deps.appendSetCookie(response, frontDeskCookie(token, FRONT_DESK_TTL_SECONDS, deps));
    sendJson(response, 200, { authenticated: true });
    return true;
  }

  if (path === "/api/front-desk/logout" && request.method === "POST") {
    deps.appendSetCookie(response, frontDeskCookie("", 0, deps));
    sendJson(response, 200, { authenticated: false });
    return true;
  }

  if (path === "/api/front-desk/sync") {
    const cron = isCronRequest(request);

    if (!cron && !hasFrontDeskSession(request, deps)) {
      throw httpError(401, "Please enter the front desk password.");
    }

    if (!cron && request.method !== "POST") {
      throw httpError(405, "Method not allowed.");
    }

    sendJson(response, 200, await runClientSync(deps, cron ? CRON_SYNC_BUDGET_MS : STAFF_SYNC_BUDGET_MS));
    return true;
  }

  if (!["/api/front-desk/dashboard", "/api/front-desk/client-search", "/api/front-desk/clients", "/api/front-desk/client"].includes(path)) {
    return false;
  }

  if (request.method !== "GET") {
    throw httpError(405, "Method not allowed.");
  }

  if (!hasFrontDeskSession(request, deps)) {
    throw httpError(401, "Please enter the front desk password.");
  }

  if (path === "/api/front-desk/clients") {
    if (url.searchParams.get("format") === "csv") {
      const csv = await clientCountsCsv(url);
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/csv; charset=utf-8");
      response.setHeader("Content-Disposition", `attachment; filename="cave-class-counts-${studioLocalNow().slice(0, 10)}.csv"`);
      response.setHeader("Cache-Control", "no-store");
      response.end(csv);
      return true;
    }

    sendJson(response, 200, await allClientCounts(url));
    return true;
  }

  if (path === "/api/front-desk/client") {
    const clientId = String(url.searchParams.get("id") || "").trim();

    if (!/^[\w-]{1,40}$/.test(clientId)) {
      throw httpError(400, "Missing client.");
    }

    sendJson(response, 200, await clientDetail(clientId, deps));
    return true;
  }

  const fresh = url.searchParams.get("refresh") === "1";

  if (path === "/api/front-desk/dashboard") {
    const days = clampDays(url.searchParams.get("days"));
    sendJson(response, 200, await buildDashboard(days, fresh, deps));
    return true;
  }

  const query = String(url.searchParams.get("q") || "").trim().slice(0, 80);

  if (query.length < 2) {
    throw httpError(400, "Type at least two letters to search.");
  }

  sendJson(response, 200, await searchClients(query, fresh, deps));
  return true;
}

function isCronRequest(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  const header = String(request.headers.authorization || "");

  if (!secret || !header.startsWith("Bearer ")) return false;
  return passwordsMatch(header.slice(7), secret);
}

function frontDeskPassword() {
  return String(process.env.FRONT_DESK_PASSWORD || "").trim();
}

function passwordFingerprint(password) {
  return createHash("sha256").update(`front-desk:${password}`).digest("hex").slice(0, 24);
}

function passwordsMatch(given, expected) {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function hasFrontDeskSession(request, deps) {
  const password = frontDeskPassword();
  const token = deps.parseCookies(request.headers.cookie || "")[FRONT_DESK_COOKIE];

  if (!password || !token) return false;

  try {
    const payload = deps.unseal(token);
    // Changing FRONT_DESK_PASSWORD signs every front desk device out.
    return payload?.role === "front-desk" && payload.pw === passwordFingerprint(password);
  } catch {
    return false;
  }
}

function frontDeskCookie(value, maxAge, deps) {
  return deps.buildCookie(FRONT_DESK_COOKIE, value, {
    path: "/",
    maxAge,
    sameSite: "SameSite=Strict",
    secure: deps.getBookingConfig().secureCookies
  });
}

function clientIp(request) {
  return String(request.headers["x-forwarded-for"] || "").split(",")[0].trim() || request.socket?.remoteAddress || "unknown";
}

function enforceLoginLimit(ip, httpError) {
  const entry = loginFailures.get(ip);

  if (entry && entry.resetAt > Date.now() && entry.count >= LOGIN_LIMIT.count) {
    throw httpError(429, "Too many tries. Please wait 15 minutes and try again.");
  }
}

function recordLoginFailure(ip) {
  const now = Date.now();
  const entry = loginFailures.get(ip);

  if (!entry || entry.resetAt <= now) {
    loginFailures.set(ip, { count: 1, resetAt: now + LOGIN_LIMIT.windowMs });
    return;
  }

  entry.count += 1;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function clampDays(value) {
  const days = Math.floor(Number(value) || DEFAULT_WINDOW_DAYS);
  return Math.min(Math.max(days, 1), MAX_WINDOW_DAYS);
}

// Mindbody returns studio-local times without an offset, so every comparison
// below uses "YYYY-MM-DDTHH:MM:SS" strings in the studio's time zone.
export function studioLocalNow(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: STUDIO_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localTimestamp(value) {
  return String(value || "").slice(0, 19);
}

function normalizeVisit(visit) {
  return {
    visitId: String(visit.Id || ""),
    classId: Number(visit.ClassId || visit.Class?.Id || 0),
    start: localTimestamp(visit.StartDateTime || visit.Class?.StartDateTime),
    className: String(visit.Name || visit.ClassDescription?.Name || visit.Class?.ClassDescription?.Name || "Class")
  };
}

function countsTowardTotal(visit) {
  return visit && typeof visit === "object" && !isCancelledVisit(visit) && visit.Missed !== true;
}

// Builds a client's class history from Mindbody visits: every non-cancelled,
// non-missed class visit counts, in date order, so a booking's position in the
// list is the class number that visit will be (past ones are completed).
export function summarizeClientVisits(rawVisits, now, recentMilestoneDays = RECENT_MILESTONE_DAYS) {
  const visits = (Array.isArray(rawVisits) ? rawVisits : [])
    .filter(countsTowardTotal)
    .map(normalizeVisit)
    .filter((visit) => visit.classId > 0 && visit.start);

  const unique = [...new Map(visits.map((visit) => [visit.visitId || `${visit.classId}:${visit.start}`, visit])).values()]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((visit, index) => ({ ...visit, classNumber: index + 1, completed: visit.start <= now }));

  const completed = unique.filter((visit) => visit.completed);
  const recentCutoff = `${addDays(now, -recentMilestoneDays)}T00:00:00`;
  const completedCount = completed.length;

  return {
    completedCount,
    upcomingCount: unique.length - completedCount,
    lastVisit: completed.at(-1)?.start || "",
    nextMilestone: nextMilestone(completedCount),
    classesToNextMilestone: nextMilestone(completedCount) - completedCount,
    byClassId: new Map(unique.map((visit) => [visit.classId, visit])),
    upcomingMilestones: unique.filter((visit) => !visit.completed && isMilestone(visit.classNumber)),
    recentMilestones: completed.filter((visit) => visit.start >= recentCutoff && isMilestone(visit.classNumber))
  };
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

async function clientVisitSummary(clientId, now, endDate, fresh, token, deps) {
  const cacheKey = `${clientId}:${endDate}`;
  const cached = visitCache.get(cacheKey);
  let rawVisits = cached && cached.expiresAt > Date.now() && !fresh ? cached.visits : null;

  if (!rawVisits) {
    rawVisits = await pagedList(
      deps,
      "/client/clientvisits",
      {
        "request.clientId": clientId,
        "request.startDate": String(process.env.FRONT_DESK_HISTORY_START || DEFAULT_HISTORY_START).slice(0, 10),
        "request.endDate": endDate
      },
      "Visits",
      token,
      5000
    );
    visitCache.set(cacheKey, { visits: rawVisits, expiresAt: Date.now() + VISIT_CACHE_TTL_MS });
  }

  return summarizeClientVisits(rawVisits, now);
}

async function fetchClientProfiles(clientIds, token, deps) {
  const profiles = new Map();
  const chunks = [];

  for (let i = 0; i < clientIds.length; i += 50) chunks.push(clientIds.slice(i, i + 50));

  await mapLimit(chunks, 2, async (chunk) => {
    const data = await deps.bookingRequest("/client/clients", {
      token,
      params: { "request.clientIds": chunk, "request.limit": "200" }
    });

    for (const client of deps.firstListByKey(data, "Clients")) {
      profiles.set(String(client.Id), clientProfile(client));
    }
  });

  return profiles;
}

function clientProfile(client) {
  const firstName = String(client?.FirstName || "").trim();
  const lastName = String(client?.LastName || "").trim();
  return {
    clientId: String(client?.Id || ""),
    firstName,
    lastName,
    name: [firstName, lastName].filter(Boolean).join(" ") || "Client",
    photoUrl: typeof client?.PhotoUrl === "string" && /^https:\/\//.test(client.PhotoUrl) ? client.PhotoUrl : ""
  };
}

function className(item) {
  return String(item?.ClassDescription?.Name || item?.Name || "Class");
}

function staffName(staff) {
  if (!staff || typeof staff !== "object") return "";
  return String(staff.DisplayName || staff.Name || [staff.FirstName, staff.LastName].filter(Boolean).join(" ") || "");
}

function idsFromVisits(list) {
  return (Array.isArray(list) ? list : [])
    .filter(countsTowardTotal)
    .map((visit) => String(visit.ClientId || visit.Client?.Id || visit.Id || ""))
    .filter(Boolean);
}

async function fetchRosters(startDate, endDate, fresh, token, deps) {
  const cacheKey = `${startDate}:${endDate}`;
  const cached = rosterCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now() && !fresh) {
    return cached.classes;
  }

  const rawClasses = await pagedList(
    deps,
    "/class/classes",
    {
      "request.startDateTime": `${startDate}T00:00:00`,
      "request.endDateTime": `${endDate}T23:59:59`,
      "request.hideCanceledClasses": "true"
    },
    "Classes",
    token,
    1000
  );

  const scheduled = rawClasses
    .filter((item) => item && typeof item === "object" && !item.IsCanceled && Number(item.Id) > 0)
    .map((item) => ({
      classId: Number(item.Id),
      className: className(item),
      instructor: staffName(item.Staff),
      start: localTimestamp(item.StartDateTime),
      end: localTimestamp(item.EndDateTime),
      capacity: Number(item.MaxCapacity) || null,
      bookedCount: Number(item.TotalBooked ?? item.WebBooked) || 0,
      reportedEmpty: (item.TotalBooked ?? item.WebBooked) != null && Number(item.TotalBooked ?? item.WebBooked) === 0,
      embeddedIds: [...idsFromVisits(item.Visits), ...(Array.isArray(item.Clients) ? item.Clients.map((client) => String(client?.Id || "")).filter(Boolean) : [])]
    }))
    .filter((item) => item.start)
    .sort((a, b) => a.start.localeCompare(b.start));

  const classes = await mapLimit(scheduled, MINDBODY_CONCURRENCY, async ({ embeddedIds, reportedEmpty, ...item }) => {
    let rosterIds = [];

    // Skip the roster call only when Mindbody already says nobody is booked.
    if (!reportedEmpty || embeddedIds.length) {
      try {
        const data = await deps.bookingRequest("/class/classvisits", { token, params: { "request.classID": item.classId } });
        const visitClass = data?.Class || data?.Classes?.[0] || {};
        rosterIds = [
          ...idsFromVisits(visitClass.Visits || data?.Visits),
          ...(Array.isArray(visitClass.Clients) ? visitClass.Clients.map((client) => String(client?.Id || "")).filter(Boolean) : [])
        ];
      } catch {
        // Fall back to the snapshot's booked visits below.
      }
    }

    return { ...item, clientIds: [...new Set([...embeddedIds, ...rosterIds])] };
  });

  rosterCache.set(cacheKey, { classes, expiresAt: Date.now() + ROSTER_CACHE_TTL_MS });
  return classes;
}

function clientRow(profile, summary) {
  return {
    ...profile,
    completedCount: summary.completedCount,
    upcomingCount: summary.upcomingCount,
    lastVisit: summary.lastVisit,
    nextMilestone: summary.nextMilestone,
    classesToNextMilestone: summary.classesToNextMilestone
  };
}

function snapshotRow(profile, summary) {
  return {
    client_id: profile.clientId,
    first_name: profile.firstName,
    last_name: profile.lastName,
    full_name: profile.name,
    photo_url: profile.photoUrl || "",
    completed_count: summary.completedCount,
    upcoming_count: summary.upcomingCount,
    next_milestone: summary.nextMilestone,
    classes_to_next_milestone: summary.classesToNextMilestone,
    last_visit: summary.lastVisit,
    upcoming_visits: [...summary.byClassId.values()]
      .filter((visit) => !visit.completed)
      .slice(0, 50)
      .map(({ classId, start, classNumber, className: name }) => ({ classId, start, classNumber, className: name })),
    visits_synced_at: new Date().toISOString()
  };
}

function profileFromSnapshot(row) {
  return {
    clientId: String(row.client_id),
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    name: row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" ") || "Client",
    photoUrl: row.photo_url || ""
  };
}

function clientFromSnapshot(row) {
  return {
    ...profileFromSnapshot(row),
    completedCount: row.completed_count,
    upcomingCount: row.upcoming_count,
    lastVisit: row.last_visit || "",
    nextMilestone: row.next_milestone,
    classesToNextMilestone: row.classes_to_next_milestone,
    syncedAt: row.visits_synced_at || ""
  };
}

async function buildDashboard(days, fresh, deps) {
  const token = await deps.getMindbodyActionToken("Front desk class counts");
  const store = frontDeskStoreConfig();
  const now = studioLocalNow();
  const today = now.slice(0, 10);
  const endDate = addDays(today, days - 1);
  const [classes, bookedSnapshot] = await Promise.all([
    fetchRosters(today, endDate, fresh, token, deps).then((list) => list.map((item) => ({ ...item, clientIds: [...item.clientIds] }))),
    store ? clientsWithBookings(store).catch(() => []) : []
  ]);
  const classById = new Map(classes.map((item) => [item.classId, item]));

  // Clients the snapshot says are booked into a class on the board fill in any
  // roster Mindbody did not return.
  for (const row of bookedSnapshot) {
    for (const visit of Array.isArray(row.upcoming_visits) ? row.upcoming_visits : []) {
      const scheduled = classById.get(Number(visit.classId));
      if (scheduled && !scheduled.clientIds.includes(String(row.client_id))) {
        scheduled.clientIds = [...scheduled.clientIds, String(row.client_id)];
      }
    }
  }

  const clientIds = [...new Set(classes.flatMap((item) => item.clientIds))];
  const snapshotById = new Map(bookedSnapshot.map((row) => [String(row.client_id), row]));
  const missingProfiles = clientIds.filter((clientId) => !snapshotById.has(clientId));

  const [profiles, summaries] = await Promise.all([
    missingProfiles.length ? fetchClientProfiles(missingProfiles, token, deps) : new Map(),
    mapLimit(clientIds, MINDBODY_CONCURRENCY, async (clientId) => [clientId, await clientVisitSummary(clientId, now, endDate, fresh, token, deps)])
  ]);
  const summaryById = new Map(summaries);
  const profileFor = (clientId) =>
    profiles.get(clientId) || (snapshotById.has(clientId) ? profileFromSnapshot(snapshotById.get(clientId)) : { clientId, firstName: "", lastName: "", name: "Client", photoUrl: "" });

  if (store && clientIds.length) {
    // Booked clients are the ones most likely to change, so keep them fresh.
    await upsertClientRows(store, clientIds.map((clientId) => snapshotRow(profileFor(clientId), summaryById.get(clientId)))).catch(() => {});
  }

  const classRows = classes.map((item) => ({
    classId: item.classId,
    className: item.className,
    instructor: item.instructor,
    start: item.start,
    end: item.end,
    capacity: item.capacity,
    bookedCount: Math.max(item.bookedCount, item.clientIds.length),
    clients: item.clientIds
      .map((clientId) => {
        const summary = summaryById.get(clientId);
        const visit = summary?.byClassId.get(item.classId);
        const classNumber = visit?.classNumber || (summary ? summary.completedCount + 1 : null);
        return {
          ...clientRow(profileFor(clientId), summary),
          classNumber,
          isMilestone: isMilestone(classNumber)
        };
      })
      .sort((a, b) => Number(b.isMilestone) - Number(a.isMilestone) || a.name.localeCompare(b.name))
  }));

  const milestoneEntry = (clientId, visit) => {
    const scheduled = classById.get(visit.classId);
    return {
      ...profileFor(clientId),
      milestone: visit.classNumber,
      classId: visit.classId,
      className: scheduled?.className || visit.className,
      instructor: scheduled?.instructor || "",
      start: visit.start
    };
  };

  const upcomingMilestones = [];
  const recentMilestones = [];

  for (const clientId of clientIds) {
    const summary = summaryById.get(clientId);
    // Only the classes on the board, so staff see the milestone in the class
    // where it actually happens.
    for (const visit of summary.upcomingMilestones) {
      if (classById.has(visit.classId)) upcomingMilestones.push(milestoneEntry(clientId, visit));
    }
    for (const visit of summary.recentMilestones) {
      recentMilestones.push(milestoneEntry(clientId, visit));
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    studioNow: now,
    window: { startDate: today, endDate, days },
    snapshot: Boolean(store),
    upcomingMilestones: upcomingMilestones.sort((a, b) => a.start.localeCompare(b.start)),
    recentMilestones: recentMilestones.sort((a, b) => b.start.localeCompare(a.start)),
    classes: classRows,
    clients: clientIds
      .map((clientId) => clientRow(profileFor(clientId), summaryById.get(clientId)))
      .sort((a, b) => b.completedCount - a.completedCount || a.name.localeCompare(b.name))
  };
}

function needsVisitRefresh(row, nowMs) {
  if (!row.visits_synced_at) return true;

  const age = nowMs - Date.parse(row.visits_synced_at);
  const lastVisitMs = row.last_visit ? Date.parse(`${row.last_visit.slice(0, 10)}T12:00:00Z`) : 0;
  const active = row.upcoming_count > 0 || nowMs - lastVisitMs < ACTIVE_CLIENT_DAYS * 24 * 60 * 60 * 1000;
  return age >= (active ? ACTIVE_CLIENT_REFRESH_MS : INACTIVE_CLIENT_REFRESH_MS);
}

async function syncClientList(store, token, deps) {
  const state = await readSyncState(store);
  const completedAt = state.client_list_completed_at ? Date.parse(state.client_list_completed_at) : 0;

  if (state.client_list_offset === 0 && Date.now() - completedAt < CLIENT_LIST_REFRESH_MS) {
    return { listing: false };
  }

  let offset = Number(state.client_list_offset) || 0;
  const startedAt = offset === 0 ? new Date().toISOString() : state.client_list_started_at;
  let finished = false;

  for (let page = 0; page < CLIENT_LIST_PAGES_PER_STEP; page++) {
    const data = await deps.bookingRequest("/client/clients", {
      token,
      params: { "request.limit": "200", "request.offset": String(offset) }
    });
    const clients = deps.firstListByKey(data, "Clients").map(clientProfile).filter((profile) => profile.clientId);
    const listedAt = new Date().toISOString();

    await upsertClientRows(
      store,
      clients.map((profile) => ({
        client_id: profile.clientId,
        first_name: profile.firstName,
        last_name: profile.lastName,
        full_name: profile.name,
        photo_url: profile.photoUrl,
        listed_at: listedAt
      }))
    );

    offset += clients.length;
    const total = Number(data?.PaginationResponse?.TotalResults);

    if (clients.length < 200 || (Number.isFinite(total) && offset >= total)) {
      finished = true;
      break;
    }
  }

  await writeSyncState(store, finished
    ? { client_list_offset: 0, client_list_started_at: startedAt, client_list_completed_at: new Date().toISOString() }
    : { client_list_offset: offset, client_list_started_at: startedAt });

  return { listing: !finished };
}

async function runClientSync(deps, budgetMs) {
  const store = frontDeskStoreConfig();

  if (!store) {
    return { configured: false };
  }

  const startedAt = Date.now();
  const token = await deps.getMindbodyActionToken("Front desk client sync");
  const now = studioLocalNow();
  const endDate = addDays(now.slice(0, 10), MAX_WINDOW_DAYS);
  let refreshed = 0;
  let listing = true;

  while (Date.now() - startedAt < budgetMs) {
    if (listing) {
      ({ listing } = await syncClientList(store, token, deps));
      if (listing) continue;
    }

    const due = (await syncCandidates(store)).filter((row) => needsVisitRefresh(row, Date.now())).slice(0, VISIT_BATCH_PER_STEP);
    if (!due.length) break;

    const rows = await mapLimit(due, MINDBODY_CONCURRENCY, async (row) =>
      snapshotRow(profileFromSnapshot(row), await clientVisitSummary(String(row.client_id), now, endDate, false, token, deps))
    );
    await upsertClientRows(store, rows);
    refreshed += rows.length;
  }

  return { configured: true, refreshed, ...(await syncProgress(store)) };
}

function listOptions(url) {
  const sort = Object.hasOwn(CLIENT_SORTS, url.searchParams.get("sort")) ? url.searchParams.get("sort") : "classes";
  const filter = CLIENT_FILTERS.includes(url.searchParams.get("filter")) ? url.searchParams.get("filter") : "active";
  return {
    query: url.searchParams.get("q") || "",
    filter,
    sort,
    direction: url.searchParams.get("dir") === "asc" ? "asc" : "desc",
    today: studioLocalNow().slice(0, 10)
  };
}

function nextBooking(row) {
  const visits = Array.isArray(row.upcoming_visits) ? row.upcoming_visits : [];
  return [...visits].sort((a, b) => String(a.start).localeCompare(String(b.start)))[0] || null;
}

async function allClientCounts(url) {
  const store = frontDeskStoreConfig();

  if (!store) {
    return { configured: false, clients: [], total: 0 };
  }

  const limit = Math.min(Math.max(Math.floor(Number(url.searchParams.get("limit")) || 50), 1), 500);
  const offset = Math.max(Math.floor(Number(url.searchParams.get("offset")) || 0), 0);
  const options = listOptions(url);
  const [list, progress] = await Promise.all([listClientCounts(store, { ...options, limit, offset }), syncProgress(store)]);

  return {
    configured: true,
    ...options,
    offset,
    limit,
    total: list.total,
    clients: list.clients.map((row) => ({ ...clientFromSnapshot(row), nextBooking: nextBooking(row) })),
    ...progress
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  // Leading = + - @ would run as formulas when the file is opened in a spreadsheet.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

async function clientCountsCsv(url) {
  const store = frontDeskStoreConfig();

  if (!store) {
    return "Client list needs Supabase to be connected.\n";
  }

  const options = listOptions(url);
  const rows = [];

  for (let offset = 0; offset < 20000; offset += 1000) {
    const page = await listClientCounts(store, { ...options, limit: 1000, offset });
    rows.push(...page.clients);
    if (page.clients.length < 1000) break;
  }

  const header = ["First name", "Last name", "Classes taken", "Next milestone", "Classes to go", "Booked ahead", "Next class", "Last class", "Mindbody client ID"];
  const lines = rows.map((row) => {
    const next = nextBooking(row);
    return [
      row.first_name,
      row.last_name,
      row.completed_count,
      row.next_milestone,
      row.classes_to_next_milestone,
      row.upcoming_count,
      next ? next.start.replace("T", " ").slice(0, 16) : "",
      row.last_visit ? row.last_visit.slice(0, 10) : "",
      row.client_id
    ].map(csvCell).join(",");
  });

  return `${[header.join(","), ...lines].join("\n")}\n`;
}

async function clientDetail(clientId, deps) {
  const token = await deps.getMindbodyActionToken("Front desk client detail");
  const store = frontDeskStoreConfig();
  const now = studioLocalNow();
  const endDate = addDays(now.slice(0, 10), 60);
  const [row, summary] = await Promise.all([
    store ? readClientRow(store, clientId).catch(() => null) : null,
    clientVisitSummary(clientId, now, endDate, true, token, deps)
  ]);
  const profile = row ? profileFromSnapshot(row) : (await fetchClientProfiles([clientId], token, deps)).get(clientId) || { clientId, firstName: "", lastName: "", name: "Client", photoUrl: "" };

  if (store) {
    await upsertClientRows(store, [snapshotRow(profile, summary)]).catch(() => {});
  }

  const visits = [...summary.byClassId.values()].map(({ classId, start, classNumber, className: name, completed }) => ({
    classId,
    start,
    classNumber,
    className: name,
    completed,
    isMilestone: isMilestone(classNumber)
  }));

  return {
    ...clientRow(profile, summary),
    firstVisit: visits.find((visit) => visit.completed)?.start || "",
    milestones: visits.filter((visit) => visit.isMilestone),
    visits: visits.reverse()
  };
}

async function searchClients(query, fresh, deps) {
  const token = await deps.getMindbodyActionToken("Front desk client search");
  const now = studioLocalNow();
  const endDate = addDays(now.slice(0, 10), MAX_WINDOW_DAYS);
  const data = await deps.bookingRequest("/client/clients", {
    token,
    params: { "request.searchText": query, "request.limit": "12" }
  });
  const profiles = deps.firstListByKey(data, "Clients").map(clientProfile).filter((profile) => profile.clientId).slice(0, 12);
  const rows = await mapLimit(profiles, MINDBODY_CONCURRENCY, async (profile) =>
    clientRow(profile, await clientVisitSummary(profile.clientId, now, endDate, fresh, token, deps))
  );

  return { query, clients: rows };
}
