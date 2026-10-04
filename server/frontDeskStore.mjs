// Supabase-backed snapshot of every client's class count for the front desk.
// Uses the service role key server-side only; the tables have RLS on and no
// anon policies, so the browser can never read them directly.

const CLIENTS_TABLE = "front_desk_client_counts";
const STATE_TABLE = "front_desk_sync_state";
const LIST_COLUMNS = [
  "client_id",
  "first_name",
  "last_name",
  "full_name",
  "photo_url",
  "completed_count",
  "upcoming_count",
  "next_milestone",
  "classes_to_next_milestone",
  "last_visit",
  "visits_synced_at"
].join(",");

function normalizeProjectUrl(value) {
  const input = String(value || "").trim().replace(/\/+$/, "");

  if (!input) return "";
  if (/^https?:\/\//i.test(input)) return input;
  if (/\.supabase\.co$/i.test(input)) return `https://${input}`;
  if (/^[a-z0-9]{12,40}$/i.test(input)) return `https://${input}.supabase.co`;
  return input;
}

export function frontDeskStoreConfig() {
  const url = normalizeProjectUrl(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL);
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return url && key ? { url, key } : null;
}

async function storeRequest(config, table, { method = "GET", query = {}, body, prefer, range } = {}) {
  const url = new URL(`${config.url}/rest/v1/${table}`);

  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(name, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
      ...(range ? { Range: range, "Range-Unit": "items" } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.message || `Front desk storage request failed (${response.status}).`);
    error.status = 503;
    throw error;
  }

  const total = Number(String(response.headers.get("content-range") || "").split("/")[1]);
  return { data, total: Number.isFinite(total) ? total : null };
}

export async function readSyncState(config) {
  const { data } = await storeRequest(config, STATE_TABLE, { query: { id: "eq.1", select: "*" } });
  return data?.[0] || { id: 1, client_list_offset: 0, client_list_started_at: null, client_list_completed_at: null };
}

export async function writeSyncState(config, patch) {
  await storeRequest(config, STATE_TABLE, {
    method: "POST",
    body: [{ id: 1, ...patch, updated_at: new Date().toISOString() }],
    prefer: "resolution=merge-duplicates,return=minimal"
  });
}

// Upserts only the columns present on each row, so a name refresh never wipes counts.
export async function upsertClientRows(config, rows) {
  if (!rows.length) return;

  for (let i = 0; i < rows.length; i += 500) {
    await storeRequest(config, CLIENTS_TABLE, {
      method: "POST",
      body: rows.slice(i, i + 500),
      prefer: "resolution=merge-duplicates,return=minimal"
    });
  }
}

export async function syncCandidates(config, limit = 200) {
  const { data } = await storeRequest(config, CLIENTS_TABLE, {
    query: {
      select: "client_id,first_name,last_name,full_name,photo_url,visits_synced_at,last_visit,upcoming_count",
      order: "visits_synced_at.asc.nullsfirst",
      limit
    }
  });
  return Array.isArray(data) ? data : [];
}

export async function clientsWithBookings(config) {
  const { data } = await storeRequest(config, CLIENTS_TABLE, {
    query: { select: `${LIST_COLUMNS},upcoming_visits`, upcoming_count: "gt.0", limit: 2000 }
  });
  return Array.isArray(data) ? data : [];
}

export async function syncProgress(config) {
  const [all, synced] = await Promise.all([
    storeRequest(config, CLIENTS_TABLE, { query: { select: "client_id", limit: 1 }, prefer: "count=exact" }),
    storeRequest(config, CLIENTS_TABLE, { query: { select: "client_id", visits_synced_at: "not.is.null", limit: 1 }, prefer: "count=exact" })
  ]);
  return { totalClients: all.total ?? 0, syncedClients: synced.total ?? 0 };
}

function searchPattern(query) {
  const cleaned = String(query || "").replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return cleaned ? `*${cleaned}*` : "";
}

export const CLIENT_SORTS = Object.freeze({
  name: ["last_name", "first_name"],
  classes: ["completed_count"],
  to_go: ["classes_to_next_milestone"],
  milestone: ["next_milestone"],
  booked: ["upcoming_count"],
  last_visit: ["last_visit"]
});
export const CLIENT_FILTERS = Object.freeze(["all", "active", "close", "booked", "lapsed"]);

function filterParams(filter, today) {
  switch (filter) {
    case "active":
      return { completed_count: "gt.0" };
    case "close":
      return { classes_to_next_milestone: "lte.3", completed_count: "gt.0" };
    case "booked":
      return { upcoming_count: "gt.0" };
    case "lapsed": {
      const cutoff = new Date(`${today}T12:00:00Z`);
      cutoff.setUTCDate(cutoff.getUTCDate() - 30);
      return { completed_count: "gt.0", last_visit: `lt.${cutoff.toISOString().slice(0, 10)}` };
    }
    default:
      return {};
  }
}

export async function listClientCounts(config, { query = "", filter = "all", sort = "classes", direction = "desc", limit = 50, offset = 0, today = new Date().toISOString().slice(0, 10) } = {}) {
  const pattern = searchPattern(query);
  const dir = direction === "asc" ? "asc" : "desc";
  const columns = CLIENT_SORTS[sort] || CLIENT_SORTS.classes;
  const order = [...columns.map((column) => `${column}.${dir}${dir === "desc" ? ".nullslast" : ""}`), "full_name.asc", "client_id.asc"].join(",");
  const params = {
    select: `${LIST_COLUMNS},upcoming_visits`,
    order,
    full_name: pattern ? `ilike.${pattern}` : undefined,
    visits_synced_at: "not.is.null",
    ...filterParams(filter, today)
  };
  const { data, total } = await storeRequest(config, CLIENTS_TABLE, {
    query: params,
    prefer: "count=exact",
    range: `${offset}-${offset + limit - 1}`
  });
  return { clients: Array.isArray(data) ? data : [], total: total ?? (Array.isArray(data) ? data.length : 0) };
}

export async function readClientRow(config, clientId) {
  const { data } = await storeRequest(config, CLIENTS_TABLE, {
    query: { select: `${LIST_COLUMNS},upcoming_visits`, client_id: `eq.${clientId}`, limit: 1 }
  });
  return Array.isArray(data) ? data[0] || null : null;
}
