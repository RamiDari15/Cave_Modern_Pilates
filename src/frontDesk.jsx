import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ordinal } from "./milestones";
import "./frontDesk.css";

const WINDOW_OPTIONS = [
  { days: 1, label: "Today" },
  { days: 3, label: "3 days" },
  { days: 7, label: "Week" }
];
const CLIENT_FILTERS = [
  { id: "active", label: "Has taken a class" },
  { id: "close", label: "Within 3 of a milestone" },
  { id: "booked", label: "Booked ahead" },
  { id: "lapsed", label: "Not in for 30+ days" },
  { id: "all", label: "Everyone in Mindbody" }
];
const CLIENT_COLUMNS = [
  { id: "name", label: "Client", sort: "name", firstDir: "asc" },
  { id: "classes", label: "Classes", sort: "classes", firstDir: "desc", numeric: true },
  { id: "milestone", label: "Next milestone", sort: "milestone", firstDir: "asc", numeric: true },
  { id: "to_go", label: "To go", sort: "to_go", firstDir: "asc", numeric: true },
  { id: "booked", label: "Booked", sort: "booked", firstDir: "desc", numeric: true },
  { id: "next", label: "Next class" },
  { id: "last_visit", label: "Last class", sort: "last_visit", firstDir: "desc" }
];
const PAGE_SIZES = [50, 100, 250];
// Schedule and counts top up on their own this often while the page is open.
const AUTO_REFRESH_MS = 15 * 60 * 1000;
const STORAGE_KEYS = {
  celebrated: "cave-front-desk-celebrated-v1",
  notified: "cave-front-desk-notified-v1",
  days: "cave-front-desk-days-v1",
  alerts: "cave-front-desk-alerts-v1",
  clientView: "cave-front-desk-client-view-v1"
};

function readStored(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value == null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function writeStored(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be blocked; the page still works without remembering.
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data?.message || "Something went wrong.");
    error.status = response.status;
    throw error;
  }

  return data;
}

// Mindbody times are studio-local with no offset; format them without letting
// the browser's own time zone shift them.
function localDate(value) {
  const [date, time = "00:00:00"] = String(value || "").split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, h || 0, mi || 0));
}

function formatStamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(localDate(value));
}

function formatDay(value, today) {
  const day = String(value || "").slice(0, 10);
  if (today && day === today) return "Today";
  if (today) {
    const tomorrow = localDate(`${today}T12:00:00`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    if (day === tomorrow.toISOString().slice(0, 10)) return "Tomorrow";
  }
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(localDate(value));
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(localDate(value));
}

function formatWhen(value, today) {
  return value ? `${formatDay(value, today)}, ${formatTime(value)}` : "";
}

function milestoneKey(entry) {
  return `${entry.clientId}:${entry.milestone}`;
}

function FrontDeskApp() {
  const [status, setStatus] = useState({ loading: true, configured: true, authenticated: false });

  useEffect(() => {
    api("/api/front-desk/session")
      .then((data) => setStatus({ loading: false, ...data }))
      .catch(() => setStatus({ loading: false, configured: true, authenticated: false }));
  }, []);

  if (status.loading) {
    return <div className="fd-splash" aria-busy="true"><span className="fd-wordmark">Cave Modern Pilates</span></div>;
  }

  if (!status.authenticated) {
    return <LoginScreen configured={status.configured} onSignedIn={() => setStatus({ loading: false, configured: true, authenticated: true })} />;
  }

  return <Dashboard onSignedOut={() => setStatus({ loading: false, configured: true, authenticated: false })} />;
}

function LoginScreen({ configured, onSignedIn }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      await api("/api/front-desk/login", { method: "POST", body: JSON.stringify({ password }) });
      setPassword("");
      onSignedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="fd-login">
      <form className="fd-login-box" onSubmit={submit}>
        <span className="fd-wordmark">Cave Modern Pilates</span>
        <h1>Front desk</h1>
        {!configured ? <p className="fd-note">The front desk password has not been set up yet. Add FRONT_DESK_PASSWORD in Vercel to turn this page on.</p> : null}
        <label className="fd-label" htmlFor="fd-password">Staff password</label>
        <input
          id="fd-password"
          className="fd-input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          disabled={!configured || busy}
          autoFocus
        />
        {error ? <p className="fd-error" role="alert">{error}</p> : null}
        <button className="fd-btn fd-btn-dark" type="submit" disabled={!configured || busy || !password}>
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

function Dashboard({ onSignedOut }) {
  const [days, setDays] = useState(() => readStored(STORAGE_KEYS.days, 1));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("clients");
  const [detailId, setDetailId] = useState("");
  const [celebrated, setCelebrated] = useState(() => new Set(readStored(STORAGE_KEYS.celebrated, [])));
  const [alertsOn, setAlertsOn] = useState(() => readStored(STORAGE_KEYS.alerts, false) && typeof Notification !== "undefined" && Notification.permission === "granted");
  const [toasts, setToasts] = useState([]);
  const [sync, setSync] = useState(null);
  const notifiedRef = useRef(new Set(readStored(STORAGE_KEYS.notified, [])));
  const alertsRef = useRef(alertsOn);
  alertsRef.current = alertsOn;

  const firstLoadRef = useRef(true);
  const loadedAtRef = useRef(0);

  const announce = useCallback((entries) => {
    const fresh = entries.filter((entry) => !notifiedRef.current.has(milestoneKey(entry)));
    const silent = firstLoadRef.current;
    firstLoadRef.current = false;
    if (!fresh.length) return;

    fresh.forEach((entry) => notifiedRef.current.add(milestoneKey(entry)));
    writeStored(STORAGE_KEYS.notified, [...notifiedRef.current].slice(-500));
    // The banner already lists what's booked when the page opens; pop-ups are
    // for milestones that get booked while staff have the page up.
    if (silent) return;
    setToasts((current) => [...current, ...fresh.map((entry) => ({ ...entry, toastId: `${milestoneKey(entry)}:${Date.now()}` }))].slice(-3));

    if (alertsRef.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
      for (const entry of fresh.slice(0, 5)) {
        new Notification(`${entry.name}: ${ordinal(entry.milestone)} class`, {
          body: `${entry.className}, ${formatTime(entry.start)}`,
          tag: milestoneKey(entry)
        });
      }
    }
  }, []);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError("");

    try {
      const result = await api(`/api/front-desk/dashboard?days=${days}${fresh ? "&refresh=1" : ""}`);
      setData(result);
      loadedAtRef.current = Date.now();
      announce(result.upcomingMilestones);
    } catch (err) {
      if (err.status === 401) {
        onSignedOut();
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [days, announce, onSignedOut]);

  useEffect(() => {
    writeStored(STORAGE_KEYS.days, days);
    load();
  }, [days, load]);

  const snapshotOn = Boolean(data?.snapshot);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (snapshotOn) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") loadRef.current();
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [snapshotOn]);

  // Light auto refresh while the page is open and visible: every 15 minutes
  // the sync picks up clients whose booked class has happened, then the
  // schedule reloads through the server's roster cache. While the first full
  // load of class history runs, one small batch goes every 2 minutes. The
  // daily cron covers everything else.
  useEffect(() => {
    if (!snapshotOn) return undefined;
    let timer;
    let cancelled = false;

    async function step() {
      let delay = AUTO_REFRESH_MS;
      if (document.visibilityState === "visible") {
        try {
          const result = await api("/api/front-desk/sync", { method: "POST" });
          if (cancelled) return;
          setSync({ ...result, error: "" });
          if (!result.totalClients || result.syncedClients < result.totalClients) delay = 2 * 60 * 1000;
          if (Date.now() - loadedAtRef.current >= AUTO_REFRESH_MS) loadRef.current();
        } catch (err) {
          if (err.status === 401) return onSignedOut();
          if (!cancelled) setSync((current) => ({ ...(current || {}), error: err.message }));
          delay = 5 * 60 * 1000;
        }
      }
      if (!cancelled) timer = window.setTimeout(step, delay);
    }

    step();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [snapshotOn, onSignedOut]);

  useEffect(() => {
    if (!toasts.length) return undefined;
    const timer = window.setTimeout(() => setToasts((current) => current.slice(1)), 9000);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  function toggleCelebrated(entry) {
    setCelebrated((current) => {
      const next = new Set(current);
      const key = milestoneKey(entry);
      next.has(key) ? next.delete(key) : next.add(key);
      writeStored(STORAGE_KEYS.celebrated, [...next].slice(-500));
      return next;
    });
  }

  async function toggleAlerts() {
    if (alertsOn) {
      setAlertsOn(false);
      writeStored(STORAGE_KEYS.alerts, false);
      return;
    }

    if (typeof Notification === "undefined") {
      setError("This browser does not support desktop alerts. Milestones still pop up on this page.");
      return;
    }

    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    const enabled = permission === "granted";
    setAlertsOn(enabled);
    writeStored(STORAGE_KEYS.alerts, enabled);
    if (!enabled) setError("Desktop alerts are blocked in this browser's settings. Milestones still pop up on this page.");
  }

  // Manual refresh: bring in counts for anyone whose class has happened, then
  // reload today's rosters right away instead of waiting for the next top-up.
  async function refreshNow() {
    if (snapshotOn) {
      try {
        const result = await api("/api/front-desk/sync", { method: "POST" });
        setSync({ ...result, error: "" });
      } catch (err) {
        if (err.status === 401) return onSignedOut();
      }
    }
    load(true);
  }

  async function signOut() {
    await api("/api/front-desk/logout", { method: "POST" }).catch(() => {});
    onSignedOut();
  }

  const today = data?.studioNow?.slice(0, 10) || "";
  const upcoming = data?.upcomingMilestones || [];
  const recent = data?.recentMilestones || [];
  const openMilestones = upcoming.filter((entry) => !celebrated.has(milestoneKey(entry)));

  return (
    <div className="fd-app">
      <header className="fd-bar">
        <div className="fd-bar-brand">
          <a className="fd-wordmark" href="/">Cave Modern Pilates</a>
          <span className="fd-bar-title">Front desk</span>
        </div>
        <div className="fd-bar-actions">
          <span className="fd-bar-meta">{sync?.lastSyncedAt ? `Counts updated ${formatStamp(sync.lastSyncedAt)}` : data ? `Updated ${formatStamp(data.generatedAt)}` : ""}</span>
          <button type="button" className="fd-link" onClick={toggleAlerts} aria-pressed={alertsOn}>
            Desktop alerts: {alertsOn ? "on" : "off"}
          </button>
          <button type="button" className="fd-link" onClick={refreshNow} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" className="fd-link" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main className="fd-main">
        {error ? (
          <p className="fd-note fd-note-warn" role="alert">
            {error} <button type="button" className="fd-link" onClick={() => setError("")}>Dismiss</button>
          </p>
        ) : null}

        {openMilestones.length ? (
          <button type="button" className="fd-banner" onClick={() => setTab("milestones")}>
            <strong>{openMilestones.length} milestone {openMilestones.length === 1 ? "class" : "classes"} coming up.</strong>{" "}
            {openMilestones.slice(0, 3).map((entry) => `${entry.name} (${ordinal(entry.milestone)}, ${formatWhen(entry.start, today)})`).join(" · ")}
            {openMilestones.length > 3 ? ` · and ${openMilestones.length - 3} more` : ""}
          </button>
        ) : null}

        <nav className="fd-tabs" aria-label="Views">
          <button type="button" aria-pressed={tab === "clients"} onClick={() => setTab("clients")}>Clients</button>
          <button type="button" aria-pressed={tab === "schedule"} onClick={() => setTab("schedule")}>Schedule</button>
          <button type="button" aria-pressed={tab === "milestones"} onClick={() => setTab("milestones")}>
            Milestones{upcoming.length ? <span className="fd-count">{upcoming.length}</span> : null}
          </button>
        </nav>

        {tab === "clients" ? (
          data && !data.snapshot ? (
            <p className="fd-note">The full client list needs Supabase connected (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel).</p>
          ) : (
            <ClientsView today={today} sync={sync} onOpen={setDetailId} onSignedOut={onSignedOut} />
          )
        ) : null}
        {tab === "schedule" ? <ScheduleView data={data} loading={loading} today={today} days={days} onDays={setDays} onOpen={setDetailId} /> : null}
        {tab === "milestones" ? (
          <MilestonesView upcoming={upcoming} recent={recent} today={today} celebrated={celebrated} onToggle={toggleCelebrated} onOpen={setDetailId} loading={!data && loading} />
        ) : null}
      </main>

      {detailId ? <ClientDetail clientId={detailId} today={today} onClose={() => setDetailId("")} onSignedOut={onSignedOut} /> : null}

      <div className="fd-toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div className="fd-toast" key={toast.toastId}>
            <div>
              <strong>{toast.name}: {ordinal(toast.milestone)} class</strong>
              <span>{formatWhen(toast.start, today)} · {toast.className}</span>
            </div>
            <button type="button" className="fd-link" onClick={() => setToasts((current) => current.filter((item) => item.toastId !== toast.toastId))}>
              Close
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientsView({ today, sync, onOpen, onSignedOut }) {
  const saved = readStored(STORAGE_KEYS.clientView, {});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(saved.filter || "active");
  const [sort, setSort] = useState(saved.sort || "classes");
  const [dir, setDir] = useState(saved.dir || "desc");
  const [pageSize, setPageSize] = useState(saved.pageSize || 50);
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState({ loading: true, clients: [], total: 0, error: "" });
  const requestRef = useRef(0);

  useEffect(() => {
    writeStored(STORAGE_KEYS.clientView, { filter, sort, dir, pageSize });
  }, [filter, sort, dir, pageSize]);

  useEffect(() => setOffset(0), [query, filter, sort, dir, pageSize]);

  const params = useMemo(() => {
    const search = new URLSearchParams({ filter, sort, dir });
    if (query.trim()) search.set("q", query.trim());
    return search;
  }, [filter, sort, dir, query]);

  useEffect(() => {
    const requestId = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      setState((current) => ({ ...current, loading: true, error: "" }));
      try {
        const result = await api(`/api/front-desk/clients?${params}&offset=${offset}&limit=${pageSize}`);
        if (requestId === requestRef.current) setState({ loading: false, error: "", clients: result.clients, total: result.total });
      } catch (err) {
        if (err.status === 401) return onSignedOut();
        if (requestId === requestRef.current) setState((current) => ({ ...current, loading: false, error: err.message }));
      }
    }, query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [params, offset, pageSize, query, onSignedOut, sync?.syncedClients, sync?.lastSyncedAt]);

  function sortBy(column) {
    if (!column.sort) return;
    if (sort === column.sort) {
      setDir(dir === "asc" ? "desc" : "asc");
    } else {
      setSort(column.sort);
      setDir(column.firstDir);
    }
  }

  const syncing = sync && (!sync.totalClients || sync.syncedClients < sync.totalClients);
  const from = state.total ? offset + 1 : 0;
  const to = Math.min(offset + state.clients.length, state.total);

  return (
    <section>
      <div className="fd-toolbar">
        <input
          className="fd-input fd-search"
          type="search"
          placeholder="Search by name"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search clients by name"
        />
        <label className="fd-select-label">
          <span>Show</span>
          <select className="fd-select" value={filter} onChange={(event) => setFilter(event.target.value)}>
            {CLIENT_FILTERS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label className="fd-select-label">
          <span>Rows</span>
          <select className="fd-select" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
            {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <a className="fd-btn" href={`/api/front-desk/clients?${params}&format=csv`} download>Export CSV</a>
      </div>

      <p className="fd-status">
        {state.total.toLocaleString()} {state.total === 1 ? "client" : "clients"}
        {syncing && sync?.totalClients
          ? `. Loading class history: ${sync.syncedClients.toLocaleString()} of ${sync.totalClients.toLocaleString()} clients done. Keep this page open and it continues.`
          : syncing
            ? ". Pulling the client list from Mindbody."
            : sync?.totalClients
              ? `. All ${sync.totalClients.toLocaleString()} Mindbody clients tracked.`
              : ""}
      </p>
      {state.error || sync?.error ? <p className="fd-error">{state.error || sync.error}</p> : null}

      <div className="fd-table-wrap">
        <table className="fd-table fd-clickable">
          <thead>
            <tr>
              {CLIENT_COLUMNS.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={`${column.numeric ? "fd-num" : ""} ${["next", "booked", "milestone"].includes(column.id) ? "fd-hide-sm" : ""}`}
                  aria-sort={sort === column.sort ? (dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {column.sort ? (
                    <button type="button" className="fd-sort" onClick={() => sortBy(column)}>
                      {column.label}
                      <span className="fd-sort-mark" aria-hidden="true">{sort === column.sort ? (dir === "asc" ? "↑" : "↓") : ""}</span>
                    </button>
                  ) : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.clients.map((client) => (
              <tr key={client.clientId} className={client.classesToNextMilestone === 1 ? "is-close" : ""} onClick={() => onOpen(client.clientId)}>
                <th scope="row">
                  <button type="button" className="fd-name" onClick={(event) => { event.stopPropagation(); onOpen(client.clientId); }}>
                    {client.name}
                  </button>
                </th>
                <td className="fd-num">{client.completedCount}</td>
                <td className="fd-num fd-hide-sm">{client.nextMilestone}</td>
                <td className="fd-num">{client.classesToNextMilestone === 1 ? <strong>1</strong> : client.classesToNextMilestone}</td>
                <td className="fd-num fd-hide-sm">{client.upcomingCount || ""}</td>
                <td className="fd-hide-sm">{client.nextBooking ? formatWhen(client.nextBooking.start, today) : ""}</td>
                <td>{client.lastVisit ? formatDate(client.lastVisit) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!state.clients.length ? (
          <p className="fd-empty">{state.loading ? "Loading…" : syncing ? "Clients appear here as their history loads." : "No clients match."}</p>
        ) : null}
      </div>

      <div className="fd-pager">
        <span>{from ? `${from.toLocaleString()}–${to.toLocaleString()} of ${state.total.toLocaleString()}` : ""}</span>
        <div>
          <button type="button" className="fd-btn" disabled={!offset || state.loading} onClick={() => setOffset(Math.max(offset - pageSize, 0))}>Previous</button>
          <button type="button" className="fd-btn" disabled={to >= state.total || state.loading} onClick={() => setOffset(offset + pageSize)}>Next</button>
        </div>
      </div>
    </section>
  );
}

function ScheduleView({ data, loading, today, days, onDays, onOpen }) {
  const byDay = useMemo(() => {
    const groups = new Map();
    for (const item of data?.classes || []) {
      const day = item.start.slice(0, 10);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push(item);
    }
    return [...groups.entries()];
  }, [data]);

  const now = data?.studioNow || "";

  return (
    <section>
      <div className="fd-toolbar">
        <div className="fd-segmented" role="group" aria-label="Days to show">
          {WINDOW_OPTIONS.map((option) => (
            <button key={option.days} type="button" aria-pressed={days === option.days} onClick={() => onDays(option.days)}>
              {option.label}
            </button>
          ))}
        </div>
        <span className="fd-status">Class number shown after each name. Milestone classes are marked.</span>
      </div>
      {!data && loading ? <p className="fd-empty">Loading…</p> : null}
      {data && !byDay.length ? <p className="fd-empty">No classes scheduled.</p> : null}
      {byDay.map(([day, classes]) => (
        <div className="fd-day" key={day}>
          <h2>{formatDay(`${day}T12:00:00`, today)}</h2>
          <div className="fd-table-wrap">
            <table className="fd-table fd-schedule">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Class</th>
                  <th scope="col" className="fd-num">Booked</th>
                  <th scope="col">Clients</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((item) => (
                  <tr key={item.classId} className={item.end && item.end < now ? "is-past" : ""}>
                    <td className="fd-nowrap">{formatTime(item.start)}</td>
                    <td>
                      {item.className}
                      {item.instructor ? <span className="fd-sub">{item.instructor}</span> : null}
                    </td>
                    <td className="fd-num fd-nowrap">{item.bookedCount ?? item.clients.length}{item.capacity ? ` / ${item.capacity}` : ""}</td>
                    <td>
                      {item.clients.length ? (
                        <ul className="fd-roster">
                          {item.clients.map((client) => (
                            <li key={client.clientId} className={client.isMilestone ? "is-milestone" : ""}>
                              <button type="button" className="fd-name" onClick={() => onOpen(client.clientId)}>{client.name}</button>
                              <span className="fd-sub-inline">{client.classNumber ? ordinal(client.classNumber) : ""}{client.isMilestone ? " · milestone" : ""}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {item.bookedCount > item.clients.length ? (
                        <span className="fd-sub">{item.bookedCount - item.clients.length} {item.clients.length ? "more " : ""}booked, names still loading</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

function MilestonesView({ upcoming, recent, today, celebrated, onToggle, onOpen, loading }) {
  const table = (rows, emptyText) => (
    <div className="fd-table-wrap">
      <table className="fd-table">
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Client</th>
            <th scope="col" className="fd-num">Class #</th>
            <th scope="col">Class</th>
            <th scope="col">Celebrated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={`${milestoneKey(entry)}:${entry.classId}`} className={celebrated.has(milestoneKey(entry)) ? "is-past" : ""}>
              <td className="fd-nowrap">{formatWhen(entry.start, today)}</td>
              <td><button type="button" className="fd-name" onClick={() => onOpen(entry.clientId)}>{entry.name}</button></td>
              <td className="fd-num"><strong>{entry.milestone}</strong></td>
              <td>
                {entry.className}
                {entry.instructor ? <span className="fd-sub">{entry.instructor}</span> : null}
              </td>
              <td>
                <input type="checkbox" checked={celebrated.has(milestoneKey(entry))} onChange={() => onToggle(entry)} aria-label={`Celebrated ${entry.name}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length ? <p className="fd-empty">{loading ? "Loading…" : emptyText}</p> : null}
    </div>
  );

  return (
    <section>
      <p className="fd-status">Milestones are classes 5, 10, 25, 50, 75 and 100, then every 25 after that. "Celebrated" is saved on this device.</p>
      <h2 className="fd-h2">Coming up</h2>
      {table(upcoming, "No milestone classes booked on the schedule shown.")}
      <h2 className="fd-h2">Reached in the last 3 days</h2>
      {table(recent, "None in the last 3 days.")}
    </section>
  );
}

function ClientDetail({ clientId, today, onClose, onSignedOut }) {
  const [state, setState] = useState({ loading: true, client: null, error: "" });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, client: null, error: "" });
    api(`/api/front-desk/client?id=${encodeURIComponent(clientId)}`)
      .then((client) => !cancelled && setState({ loading: false, client, error: "" }))
      .catch((err) => {
        if (err.status === 401) return onSignedOut();
        if (!cancelled) setState({ loading: false, client: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, onSignedOut]);

  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const client = state.client;
  const upcoming = client?.visits.filter((visit) => !visit.completed).reverse() || [];
  const history = client?.visits.filter((visit) => visit.completed) || [];

  return (
    <div className="fd-drawer-backdrop" onClick={onClose}>
      <aside className="fd-drawer" role="dialog" aria-modal="true" aria-label="Client details" onClick={(event) => event.stopPropagation()}>
        <div className="fd-drawer-head">
          <h2>{client?.name || (state.loading ? "Loading…" : "Client")}</h2>
          <button type="button" className="fd-link" onClick={onClose}>Close</button>
        </div>
        {state.error ? <p className="fd-error">{state.error}</p> : null}
        {client ? (
          <>
            <dl className="fd-facts">
              <div><dt>Classes taken</dt><dd>{client.completedCount}</dd></div>
              <div><dt>Next milestone</dt><dd>{client.nextMilestone} ({client.classesToNextMilestone} to go)</dd></div>
              <div><dt>Booked ahead</dt><dd>{client.upcomingCount}</dd></div>
              <div><dt>First class</dt><dd>{client.firstVisit ? formatDate(client.firstVisit) : "None yet"}</dd></div>
              <div><dt>Last class</dt><dd>{client.lastVisit ? formatDate(client.lastVisit) : "None yet"}</dd></div>
            </dl>

            <h3>Milestones</h3>
            {client.milestones.length ? (
              <table className="fd-table fd-compact">
                <tbody>
                  {client.milestones.map((visit) => (
                    <tr key={`${visit.classId}:${visit.classNumber}`}>
                      <td className="fd-num"><strong>{visit.classNumber}</strong></td>
                      <td>{visit.completed ? formatDate(visit.start) : `Booked ${formatWhen(visit.start, today)}`}</td>
                      <td>{visit.className}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="fd-sub">No milestones yet.</p>}

            <h3>Booked classes</h3>
            {upcoming.length ? (
              <table className="fd-table fd-compact">
                <tbody>
                  {upcoming.map((visit) => (
                    <tr key={visit.classId}>
                      <td className="fd-num">{visit.classNumber}</td>
                      <td className="fd-nowrap">{formatWhen(visit.start, today)}</td>
                      <td>{visit.className}{visit.isMilestone ? " · milestone" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="fd-sub">Nothing booked.</p>}

            <h3>Class history ({history.length})</h3>
            {history.length ? (
              <table className="fd-table fd-compact">
                <thead>
                  <tr>
                    <th scope="col" className="fd-num">#</th>
                    <th scope="col">Date</th>
                    <th scope="col">Class</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((visit) => (
                    <tr key={visit.classId} className={visit.isMilestone ? "is-close" : ""}>
                      <td className="fd-num">{visit.classNumber}</td>
                      <td className="fd-nowrap">{formatDate(visit.start)}, {formatTime(visit.start)}</td>
                      <td>{visit.className}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="fd-sub">No classes yet.</p>}
          </>
        ) : null}
      </aside>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<FrontDeskApp />);
