import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bell, BellOff, CalendarDays, Check, Lock, LogOut, PartyPopper, RefreshCw, Search, Sparkles, Users, X } from "lucide-react";
import { nextMilestone, ordinal, previousMilestone } from "./milestones";
import studioPhoto from "../assets/cave-studio-wide.jpg";
import "./frontDesk.css";

const REFRESH_MS = 5 * 60 * 1000;
const WINDOW_OPTIONS = [
  { days: 1, label: "Today" },
  { days: 3, label: "3 days" },
  { days: 7, label: "Week" }
];
const STORAGE_KEYS = {
  celebrated: "cave-front-desk-celebrated-v1",
  notified: "cave-front-desk-notified-v1",
  days: "cave-front-desk-days-v1",
  alerts: "cave-front-desk-alerts-v1"
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
    // Storage can be blocked; the board still works without remembering.
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

function formatTime(value) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(localDate(value));
}

function formatDay(value, today) {
  const day = String(value || "").slice(0, 10);
  if (day === today) return "Today";
  const tomorrow = localDate(`${today}T12:00:00`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (day === tomorrow.toISOString().slice(0, 10)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(localDate(value));
}

function formatShortDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(localDate(value));
}

function milestoneKey(entry) {
  return `${entry.clientId}:${entry.milestone}`;
}

function initials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
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
    <main className="fd-login" style={{ backgroundImage: `url(${studioPhoto})` }}>
      <form className="fd-login-card" onSubmit={submit}>
        <span className="fd-wordmark">Cave Modern Pilates</span>
        <p className="fd-eyebrow">Front Desk</p>
        <h1>Welcome back.</h1>
        <p className="fd-login-copy">Class counts and milestone celebrations for today's clients.</p>
        {!configured ? (
          <p className="fd-alert">The front desk password has not been set up yet. Add FRONT_DESK_PASSWORD in Vercel to turn this page on.</p>
        ) : null}
        <label className="fd-field">
          <span>Staff password</span>
          <div className="fd-input-wrap">
            <Lock aria-hidden="true" size={16} strokeWidth={1.7} />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={!configured || busy}
              autoFocus
            />
          </div>
        </label>
        {error ? <p className="fd-error" role="alert">{error}</p> : null}
        <button className="fd-button fd-button-dark" type="submit" disabled={!configured || busy || !password}>
          {busy ? "Checking…" : "Open front desk"}
        </button>
      </form>
    </main>
  );
}

function Dashboard({ onSignedOut }) {
  const [days, setDays] = useState(() => readStored(STORAGE_KEYS.days, 3));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("classes");
  const [celebrated, setCelebrated] = useState(() => new Set(readStored(STORAGE_KEYS.celebrated, [])));
  const [alertsOn, setAlertsOn] = useState(() => readStored(STORAGE_KEYS.alerts, false) && typeof Notification !== "undefined" && Notification.permission === "granted");
  const [toasts, setToasts] = useState([]);
  const notifiedRef = useRef(new Set(readStored(STORAGE_KEYS.notified, [])));
  const alertsRef = useRef(alertsOn);
  alertsRef.current = alertsOn;

  const announce = useCallback((entries) => {
    const fresh = entries.filter((entry) => !notifiedRef.current.has(milestoneKey(entry)));
    if (!fresh.length) return;

    fresh.forEach((entry) => notifiedRef.current.add(milestoneKey(entry)));
    writeStored(STORAGE_KEYS.notified, [...notifiedRef.current].slice(-500));
    setToasts((current) => [...current, ...fresh.map((entry) => ({ ...entry, toastId: `${milestoneKey(entry)}:${Date.now()}` }))].slice(-4));

    if (alertsRef.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
      for (const entry of fresh.slice(0, 5)) {
        new Notification(`${entry.firstName || entry.name} hits ${entry.milestone} classes`, {
          body: `${ordinal(entry.milestone)} class · ${entry.className} · ${formatTime(entry.start)}`,
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const [sync, setSync] = useState(null);
  const snapshotOn = Boolean(data?.snapshot);

  // Keep the all-client snapshot filling in while the page is open: quick steps
  // until every client is loaded, then an occasional top-up.
  useEffect(() => {
    if (!snapshotOn) return undefined;
    let timer;
    let cancelled = false;

    async function step() {
      let delay = 15 * 60 * 1000;
      if (document.visibilityState === "visible") {
        try {
          const result = await api("/api/front-desk/sync", { method: "POST" });
          if (cancelled) return;
          setSync({ ...result, error: "" });
          if (!result.totalClients || result.syncedClients < result.totalClients) delay = 20 * 1000;
        } catch (err) {
          if (err.status === 401) return onSignedOut();
          if (!cancelled) setSync((current) => ({ ...(current || {}), error: err.message }));
          delay = 60 * 1000;
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
      setError("This browser does not support desktop alerts. Milestones will still pop up on this page.");
      return;
    }

    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    const enabled = permission === "granted";
    setAlertsOn(enabled);
    writeStored(STORAGE_KEYS.alerts, enabled);
    if (!enabled) setError("Desktop alerts are blocked in this browser's settings. Milestones will still pop up on this page.");
  }

  async function signOut() {
    await api("/api/front-desk/logout", { method: "POST" }).catch(() => {});
    onSignedOut();
  }

  const today = data?.studioNow?.slice(0, 10) || "";
  const upcoming = data?.upcomingMilestones || [];
  const recent = data?.recentMilestones || [];
  const stats = [
    { label: "Classes on the board", value: data?.classes.length ?? "–", icon: CalendarDays },
    { label: "Spots booked", value: data ? data.classes.reduce((sum, item) => sum + (item.bookedCount ?? item.clients.length), 0) : "–", icon: Users },
    { label: "Milestones coming up", value: data ? upcoming.length : "–", icon: Sparkles, accent: true },
    { label: "Just celebrated", value: data ? recent.length : "–", icon: PartyPopper }
  ];

  return (
    <div className="fd-app">
      <header className="fd-topbar">
        <div className="fd-brand">
          <a className="fd-wordmark" href="/">Cave Modern Pilates</a>
          <span className="fd-topbar-tag">Front Desk</span>
        </div>
        <div className="fd-topbar-actions">
          <div className="fd-segmented" role="group" aria-label="Days to show">
            {WINDOW_OPTIONS.map((option) => (
              <button key={option.days} type="button" aria-pressed={days === option.days} onClick={() => setDays(option.days)}>
                {option.label}
              </button>
            ))}
          </div>
          <button className="fd-icon-button" type="button" onClick={toggleAlerts} aria-pressed={alertsOn} title={alertsOn ? "Desktop alerts on" : "Turn on desktop alerts"}>
            {alertsOn ? <Bell size={18} strokeWidth={1.7} /> : <BellOff size={18} strokeWidth={1.7} />}
            <span className="fd-hide-sm">{alertsOn ? "Alerts on" : "Alerts off"}</span>
          </button>
          <button className="fd-icon-button" type="button" onClick={() => load(true)} disabled={loading} title="Refresh from Mindbody">
            <RefreshCw className={loading ? "fd-spin" : ""} size={18} strokeWidth={1.7} />
            <span className="fd-hide-sm">Refresh</span>
          </button>
          <button className="fd-icon-button" type="button" onClick={signOut} title="Sign out">
            <LogOut size={18} strokeWidth={1.7} />
            <span className="fd-hide-sm">Sign out</span>
          </button>
        </div>
      </header>

      <main className="fd-main">
        <section className="fd-hero">
          <div>
            <p className="fd-eyebrow">{today ? formatDay(`${today}T12:00:00`, "") : "Loading"}</p>
            <h1>Every class counts.</h1>
            <p className="fd-hero-copy">
              Class totals come straight from Mindbody visit history. Milestones are 5, 10, 25, 50, 75 and 100 classes, then every 25 after that.
            </p>
          </div>
          {data ? <p className="fd-updated">Updated {new Date(data.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p> : null}
        </section>

        {error ? (
          <p className="fd-alert" role="alert">
            {error}
            <button type="button" onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button>
          </p>
        ) : null}

        <section className="fd-stats" aria-label="Summary">
          {stats.map(({ label, value, icon: Icon, accent }) => (
            <div className={`fd-stat${accent ? " is-accent" : ""}`} key={label}>
              <Icon aria-hidden="true" size={18} strokeWidth={1.6} />
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </section>

        <section className="fd-milestones" aria-labelledby="fd-milestones-title">
          <div className="fd-section-head">
            <div>
              <p className="fd-eyebrow">Celebrate</p>
              <h2 id="fd-milestones-title">Milestones coming up</h2>
            </div>
            <p className="fd-section-note">Booked clients whose next class is a milestone. Have their shout-out ready when they walk in.</p>
          </div>
          {!data && loading ? <SkeletonCards /> : null}
          {data && !upcoming.length ? (
            <p className="fd-empty">No milestone classes booked in this window yet. New bookings show up on the next refresh.</p>
          ) : null}
          <div className="fd-milestone-grid">
            {upcoming.map((entry) => (
              <MilestoneCard
                key={`${milestoneKey(entry)}:${entry.classId}`}
                entry={entry}
                today={today}
                celebrated={celebrated.has(milestoneKey(entry))}
                onToggle={() => toggleCelebrated(entry)}
              />
            ))}
          </div>
          {recent.length ? (
            <div className="fd-recent">
              <h3>Just hit a milestone</h3>
              <ul>
                {recent.map((entry) => (
                  <li key={`${milestoneKey(entry)}:${entry.classId}`} className={celebrated.has(milestoneKey(entry)) ? "is-done" : ""}>
                    <span className="fd-recent-badge">{entry.milestone}</span>
                    <span className="fd-recent-name">{entry.name}</span>
                    <span className="fd-recent-meta">{formatDay(entry.start, today)} · {entry.className}</span>
                    <button type="button" className="fd-text-button" onClick={() => toggleCelebrated(entry)}>
                      {celebrated.has(milestoneKey(entry)) ? <><Check size={14} /> Celebrated</> : "Mark celebrated"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <nav className="fd-tabs" aria-label="Views">
          <button type="button" aria-pressed={tab === "classes"} onClick={() => setTab("classes")}>Class rosters</button>
          <button type="button" aria-pressed={tab === "clients"} onClick={() => setTab("clients")}>Client counts</button>
        </nav>

        {tab === "classes" ? <ClassRosters data={data} loading={loading} today={today} /> : <ClientCounts data={data} today={today} sync={sync} onSignedOut={onSignedOut} />}
      </main>

      <div className="fd-toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div className="fd-toast" key={toast.toastId}>
            <span className="fd-toast-badge">{toast.milestone}</span>
            <div>
              <strong>{toast.name} hits {toast.milestone} classes</strong>
              <span>{formatDay(toast.start, today)} · {formatTime(toast.start)} · {toast.className}</span>
            </div>
            <button type="button" aria-label="Dismiss" onClick={() => setToasts((current) => current.filter((item) => item.toastId !== toast.toastId))}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonCards() {
  return (
    <div className="fd-milestone-grid" aria-hidden="true">
      {[0, 1, 2].map((index) => <div className="fd-milestone-card fd-skeleton" key={index} />)}
    </div>
  );
}

function MilestoneCard({ entry, today, celebrated, onToggle }) {
  const isToday = entry.start.slice(0, 10) === today;

  return (
    <article className={`fd-milestone-card${isToday ? " is-today" : ""}${celebrated ? " is-done" : ""}`}>
      <div className="fd-milestone-ring" aria-hidden="true">
        <span>{entry.milestone}</span>
        <small>classes</small>
      </div>
      <div className="fd-milestone-body">
        <p className="fd-milestone-when">{isToday ? "Today" : formatDay(entry.start, today)} · {formatTime(entry.start)}</p>
        <h3>{entry.name}</h3>
        <p className="fd-milestone-class">{ordinal(entry.milestone)} class · {entry.className}{entry.instructor ? ` with ${entry.instructor}` : ""}</p>
        <button type="button" className={`fd-button ${celebrated ? "fd-button-ghost" : "fd-button-dark"} fd-button-sm`} onClick={onToggle}>
          {celebrated ? <><Check size={14} /> Celebrated</> : "Mark celebrated"}
        </button>
      </div>
    </article>
  );
}

function ClassRosters({ data, loading, today }) {
  const byDay = useMemo(() => {
    const groups = new Map();
    for (const item of data?.classes || []) {
      const day = item.start.slice(0, 10);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push(item);
    }
    return [...groups.entries()];
  }, [data]);

  if (!data && loading) return <div className="fd-panel fd-skeleton fd-skeleton-tall" aria-hidden="true" />;
  if (data && !byDay.length) return <p className="fd-empty">No classes scheduled in this window.</p>;

  const now = data?.studioNow || "";

  return (
    <div className="fd-days">
      {byDay.map(([day, classes]) => (
        <section className="fd-day" key={day}>
          <h2 className="fd-day-title">{formatDay(`${day}T12:00:00`, today)}</h2>
          <div className="fd-class-grid">
            {classes.map((item) => (
              <article className={`fd-class-card${item.end && item.end < now ? " is-past" : ""}`} key={item.classId}>
                <header>
                  <div>
                    <p className="fd-class-time">{formatTime(item.start)}</p>
                    <h3>{item.className}</h3>
                    {item.instructor ? <p className="fd-class-instructor">with {item.instructor}</p> : null}
                  </div>
                  <span className="fd-class-count">{item.bookedCount ?? item.clients.length}{item.capacity ? `/${item.capacity}` : ""}</span>
                </header>
                {item.clients.length ? (
                  <ul className="fd-roster">
                    {item.clients.map((client) => (
                      <li key={client.clientId} className={client.isMilestone ? "is-milestone" : ""}>
                        <Avatar client={client} />
                        <span className="fd-roster-name">{client.name}</span>
                        <span className="fd-class-number" title={`This is their ${ordinal(client.classNumber)} class`}>
                          {client.isMilestone ? <Sparkles aria-hidden="true" size={12} /> : null}
                          {ordinal(client.classNumber)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {item.bookedCount > item.clients.length ? (
                  <p className="fd-roster-empty">
                    {item.bookedCount - item.clients.length} {item.clients.length ? "more " : ""}booked. Names fill in as client histories load.
                  </p>
                ) : null}
                {!item.bookedCount && !item.clients.length ? <p className="fd-roster-empty">No one booked yet.</p> : null}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Avatar({ client }) {
  return client.photoUrl ? (
    <img className="fd-avatar" src={client.photoUrl} alt="" loading="lazy" />
  ) : (
    <span className="fd-avatar" aria-hidden="true">{initials(client.name)}</span>
  );
}

const CLIENT_FILTERS = [
  { id: "active", label: "Taken a class" },
  { id: "close", label: "Close to a milestone" },
  { id: "all", label: "Everyone" }
];
const PAGE_SIZE = 50;

function ClientCounts({ data, today, sync, onSignedOut }) {
  if (data && !data.snapshot) {
    return <BookedClientCounts data={data} today={today} onSignedOut={onSignedOut} />;
  }

  return <AllClientCounts today={today} sync={sync} onSignedOut={onSignedOut} />;
}

function AllClientCounts({ today, sync, onSignedOut }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("active");
  const [state, setState] = useState({ loading: true, clients: [], total: 0, error: "" });
  const requestRef = useRef(0);

  const fetchPage = useCallback(async (offset) => {
    const requestId = ++requestRef.current;
    setState((current) => ({ ...current, loading: true, error: "" }));

    try {
      const params = new URLSearchParams({ filter, offset: String(offset), limit: String(PAGE_SIZE) });
      if (query.trim()) params.set("q", query.trim());
      const result = await api(`/api/front-desk/clients?${params}`);
      if (requestId !== requestRef.current) return;
      setState((current) => ({
        loading: false,
        error: "",
        total: result.total,
        clients: offset ? [...current.clients, ...result.clients] : result.clients
      }));
    } catch (err) {
      if (err.status === 401) return onSignedOut();
      if (requestId === requestRef.current) setState((current) => ({ ...current, loading: false, error: err.message }));
    }
  }, [filter, query, onSignedOut]);

  useEffect(() => {
    const timer = window.setTimeout(() => fetchPage(0), query ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [fetchPage, query, sync?.syncedClients]);

  const syncing = sync && sync.totalClients > 0 && sync.syncedClients < sync.totalClients;

  return (
    <section className="fd-panel">
      <div className="fd-search">
        <div className="fd-input-wrap">
          <Search aria-hidden="true" size={16} strokeWidth={1.7} />
          <input
            type="search"
            placeholder="Search every Cave client by name"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search clients"
          />
        </div>
      </div>
      <div className="fd-chips" role="group" aria-label="Filter clients">
        {CLIENT_FILTERS.map((option) => (
          <button key={option.id} type="button" aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>
            {option.label}
          </button>
        ))}
      </div>
      <p className="fd-search-note">
        {state.total.toLocaleString()} {state.total === 1 ? "client" : "clients"}
        {filter === "close" ? " within 3 classes of a milestone" : ""}
        {syncing
          ? ` · Loading class history for every client: ${sync.syncedClients.toLocaleString()} of ${sync.totalClients.toLocaleString()} done. Leave this page open and it keeps going.`
          : sync?.totalClients
            ? ` · All ${sync.totalClients.toLocaleString()} Cave clients tracked, refreshed automatically.`
            : ""}
      </p>
      {syncing ? (
        <div className="fd-progress fd-sync-progress" role="progressbar" aria-valuemin={0} aria-valuemax={sync.totalClients} aria-valuenow={sync.syncedClients}>
          <span style={{ width: `${Math.round((sync.syncedClients / sync.totalClients) * 100)}%` }} />
        </div>
      ) : null}
      {state.error || sync?.error ? <p className="fd-error">{state.error || sync.error}</p> : null}
      <ClientTable rows={state.clients} today={today} emptyText={state.loading ? "Loading clients…" : sync && !sync.totalClients ? "Pulling the client list from Mindbody…" : "No clients match."} />
      {state.clients.length < state.total ? (
        <div className="fd-load-more">
          <button type="button" className="fd-button fd-button-ghost fd-button-sm" disabled={state.loading} onClick={() => fetchPage(state.clients.length)}>
            {state.loading ? "Loading…" : `Show more (${(state.total - state.clients.length).toLocaleString()} left)`}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function BookedClientCounts({ data, today, onSignedOut }) {
  const [filter, setFilter] = useState("");
  const [lookup, setLookup] = useState({ loading: false, query: "", clients: null, error: "" });

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const source = lookup.clients || data?.clients || [];
    return needle && !lookup.clients ? source.filter((client) => client.name.toLowerCase().includes(needle)) : source;
  }, [data, filter, lookup.clients]);

  async function searchMindbody(event) {
    event.preventDefault();
    const query = filter.trim();
    if (query.length < 2) return;
    setLookup({ loading: true, query, clients: null, error: "" });

    try {
      const result = await api(`/api/front-desk/client-search?q=${encodeURIComponent(query)}`);
      setLookup({ loading: false, query, clients: result.clients, error: "" });
    } catch (err) {
      if (err.status === 401) return onSignedOut();
      setLookup({ loading: false, query, clients: null, error: err.message });
    }
  }

  function clearLookup() {
    setLookup({ loading: false, query: "", clients: null, error: "" });
    setFilter("");
  }

  return (
    <section className="fd-panel">
      <form className="fd-search" onSubmit={searchMindbody}>
        <div className="fd-input-wrap">
          <Search aria-hidden="true" size={16} strokeWidth={1.7} />
          <input
            type="search"
            placeholder="Filter booked clients, or search anyone in Mindbody"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              if (lookup.clients) setLookup({ loading: false, query: "", clients: null, error: "" });
            }}
            aria-label="Search clients"
          />
        </div>
        <button className="fd-button fd-button-dark fd-button-sm" type="submit" disabled={filter.trim().length < 2 || lookup.loading}>
          {lookup.loading ? "Searching…" : "Search Mindbody"}
        </button>
      </form>
      {lookup.clients ? (
        <p className="fd-search-note">
          Mindbody results for “{lookup.query}”. <button type="button" className="fd-text-button" onClick={clearLookup}>Back to booked clients</button>
        </p>
      ) : (
        <p className="fd-search-note">Showing clients booked in this window, most classes first. Connect Supabase to track every client.</p>
      )}
      {lookup.error ? <p className="fd-error">{lookup.error}</p> : null}
      <ClientTable rows={rows} today={today} emptyText={lookup.clients ? "No Mindbody clients match that search." : "No clients to show yet."} />
    </section>
  );
}

function ClientTable({ rows, today, emptyText }) {
  return (
    <div className="fd-table-wrap">
      <table className="fd-table">
        <thead>
          <tr>
            <th scope="col">Client</th>
            <th scope="col" className="fd-num">Classes</th>
            <th scope="col">Next milestone</th>
            <th scope="col" className="fd-hide-sm">Booked ahead</th>
            <th scope="col" className="fd-hide-sm">Last class</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((client) => {
            const floor = previousMilestone(client.completedCount);
            const target = nextMilestone(client.completedCount);
            const progress = Math.round(((client.completedCount - floor) / Math.max(target - floor, 1)) * 100);
            return (
              <tr key={client.clientId} className={client.classesToNextMilestone === 1 ? "is-next-milestone" : ""}>
                <th scope="row">
                  <span className="fd-client-cell"><Avatar client={client} />{client.name}</span>
                </th>
                <td className="fd-num"><strong>{client.completedCount}</strong></td>
                <td>
                  <div className="fd-progress-label">
                    <span>{target}</span>
                    <small>{client.classesToNextMilestone === 1 ? "next class!" : `${client.classesToNextMilestone} to go`}</small>
                  </div>
                  <div className="fd-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                    <span style={{ width: `${progress}%` }} />
                  </div>
                </td>
                <td className="fd-hide-sm">{client.upcomingCount || "–"}</td>
                <td className="fd-hide-sm">{client.lastVisit ? (client.lastVisit.slice(0, 10) === today ? "Today" : formatShortDate(client.lastVisit)) : "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length ? <p className="fd-empty">{emptyText}</p> : null}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<FrontDeskApp />);
