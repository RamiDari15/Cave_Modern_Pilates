import { createHash, timingSafeEqual } from "node:crypto";
import { isCancelledVisit } from "../src/bookingGuard.js";
import { isMilestone, nextMilestone } from "../src/milestones.js";

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

  if (!["/api/front-desk/dashboard", "/api/front-desk/client-search"].includes(path)) {
    return false;
  }

  if (request.method !== "GET") {
    throw httpError(405, "Method not allowed.");
  }

  if (!hasFrontDeskSession(request, deps)) {
    throw httpError(401, "Please enter the front desk password.");
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
      capacity: Number(item.MaxCapacity) || null
    }))
    .filter((item) => item.start)
    .sort((a, b) => a.start.localeCompare(b.start));

  const classes = await mapLimit(scheduled, MINDBODY_CONCURRENCY, async (item) => {
    const data = await deps.bookingRequest("/class/classvisits", { token, params: { "request.classID": item.classId } });
    const visits = data?.Class?.Visits || data?.Visits || [];
    const clientIds = [...new Set((Array.isArray(visits) ? visits : []).filter(countsTowardTotal).map((visit) => String(visit.ClientId || "")).filter(Boolean))];
    return { ...item, clientIds };
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

async function buildDashboard(days, fresh, deps) {
  const token = await deps.getMindbodyActionToken("Front desk class counts");
  const now = studioLocalNow();
  const today = now.slice(0, 10);
  const endDate = addDays(today, days - 1);
  const classes = await fetchRosters(today, endDate, fresh, token, deps);
  const clientIds = [...new Set(classes.flatMap((item) => item.clientIds))];

  const [profiles, summaries] = await Promise.all([
    clientIds.length ? fetchClientProfiles(clientIds, token, deps) : new Map(),
    mapLimit(clientIds, MINDBODY_CONCURRENCY, async (clientId) => [clientId, await clientVisitSummary(clientId, now, endDate, fresh, token, deps)])
  ]);
  const summaryById = new Map(summaries);
  const profileFor = (clientId) => profiles.get(clientId) || { clientId, firstName: "", lastName: "", name: "Client", photoUrl: "" };

  const classRows = classes.map((item) => ({
    classId: item.classId,
    className: item.className,
    instructor: item.instructor,
    start: item.start,
    end: item.end,
    capacity: item.capacity,
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

  const classById = new Map(classes.map((item) => [item.classId, item]));
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
    // Only the classes this client is booked into on the board, so staff see
    // the milestone in the class where it actually happens.
    for (const visit of summary.upcomingMilestones) {
      if (classById.has(visit.classId)) upcomingMilestones.push(milestoneEntry(clientId, visit));
    }
    for (const visit of summary.recentMilestones) {
      recentMilestones.push(milestoneEntry(clientId, visit));
    }
  }

  // Milestones reached in a class that already started today count as "just hit".
  for (const item of classRows) {
    if (item.start > now) continue;
    for (const client of item.clients) {
      if (client.isMilestone && !recentMilestones.some((entry) => entry.clientId === client.clientId && entry.classId === item.classId)) {
        recentMilestones.push({ ...milestoneEntry(client.clientId, { classId: item.classId, classNumber: client.classNumber, start: item.start, className: item.className }) });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    studioNow: now,
    window: { startDate: today, endDate, days },
    upcomingMilestones: upcomingMilestones.sort((a, b) => a.start.localeCompare(b.start)),
    recentMilestones: recentMilestones.sort((a, b) => b.start.localeCompare(a.start)),
    classes: classRows,
    clients: clientIds
      .map((clientId) => clientRow(profileFor(clientId), summaryById.get(clientId)))
      .sort((a, b) => b.completedCount - a.completedCount || a.name.localeCompare(b.name))
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
