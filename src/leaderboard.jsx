import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { LEADERBOARD } from "./leaderboardConfig.js";
import "./leaderboard.css";

const REFRESH_MS = 5 * 60 * 1000;
const SAMPLE_TICK_MS = 4200;
const STUDIO_TIME_ZONE = "America/Chicago";

const SAMPLE_NAMES = [
  "Layla M.", "Sofia R.", "Nour A.", "Emma K.", "Maya S.", "Hana B.", "Olivia T.", "Yasmin D.",
  "Ava P.", "Rania H.", "Chloe W.", "Lina F.", "Grace L.", "Dina Z.", "Mia C.", "Sara J.",
  "Zoe G.", "Reem Q.", "Ella N.", "Jana O."
];
const SAMPLE_COUNTS = [14, 13, 11, 10, 10, 9, 8, 8, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1];

function sampleBoard() {
  const leaders = SAMPLE_NAMES.map((name, index) => ({ key: `sample-${index}`, name, classes: SAMPLE_COUNTS[index], position: index + 1 }));
  return withTotals({
    title: LEADERBOARD.title,
    startDate: LEADERBOARD.startDate,
    endDate: LEADERBOARD.endDate,
    status: "live",
    sample: true,
    updatedAt: new Date().toISOString(),
    classesHeld: 96,
    leaders
  });
}

function withTotals(board) {
  return {
    ...board,
    participants: board.leaders.length,
    totalClasses: board.leaders.reduce((sum, row) => sum + row.classes, 0)
  };
}

// Sample mode adds a class to someone every few seconds so the motion can be seen.
function sampleTick(board) {
  const leaders = board.leaders.map((row) => ({ ...row }));
  const weights = leaders.map((_, index) => 1 / (index + 2));
  let pick = Math.random() * weights.reduce((a, b) => a + b, 0);
  let index = 0;
  while (pick > weights[index] && index < leaders.length - 1) pick -= weights[index++];
  leaders[index].classes += 1;
  leaders[index].bumpedAt = Date.now();
  leaders.sort((a, b) => b.classes - a.classes || (a.bumpedAt || 0) - (b.bumpedAt || 0));
  return withTotals({ ...board, classesHeld: board.classesHeld + 1, updatedAt: new Date().toISOString(), leaders: leaders.map((row, i) => ({ ...row, position: i + 1 })) });
}

// Milliseconds from now until midnight (Chicago) of the given date.
function studioMidnightMs(isoDate) {
  const guess = new Date(`${isoDate}T06:00:00Z`).getTime();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: STUDIO_TIME_ZONE, hour: "numeric", hourCycle: "h23", minute: "numeric" })
      .formatToParts(new Date(guess))
      .map((part) => [part.type, Number(part.value)])
  );
  return guess - (parts.hour * 60 + parts.minute) * 60 * 1000;
}

const START_MS = studioMidnightMs(LEADERBOARD.startDate);
const END_MS = studioMidnightMs(LEADERBOARD.endDate) + 24 * 60 * 60 * 1000;

function formatRange() {
  const fmt = (iso, opts) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
  const start = fmt(LEADERBOARD.startDate, { month: "short", day: "numeric" });
  const sameMonth = LEADERBOARD.startDate.slice(0, 7) === LEADERBOARD.endDate.slice(0, 7);
  const end = fmt(LEADERBOARD.endDate, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
  return `${start} – ${end}`;
}

function initials(name) {
  return name
    .replace(/\./g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function CountUp({ value, duration = 1200 }) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  const fromRef = useRef(shown);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(value);
      return undefined;
    }
    const from = fromRef.current;
    const started = performance.now();
    let frame;
    const step = (time) => {
      const t = Math.min(1, (time - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (value - from) * eased);
      fromRef.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <>{shown.toLocaleString("en-US")}</>;
}

// Remembers each row's previous count so a new class flashes "+1".
function useBumps(leaders) {
  const previous = useRef(new Map());
  const [bumps, setBumps] = useState({});

  useEffect(() => {
    const next = {};
    for (const row of leaders) {
      const before = previous.current.get(row.key);
      if (before != null && row.classes > before) next[row.key] = { gained: row.classes - before, at: Date.now() };
    }
    previous.current = new Map(leaders.map((row) => [row.key, row.classes]));
    if (Object.keys(next).length) {
      setBumps((current) => ({ ...current, ...next }));
      const timer = setTimeout(() => setBumps({}), 2400);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [leaders]);

  return bumps;
}

// FLIP: rows glide to their new place when the order changes.
function useFlip(listRef, order) {
  const positions = useRef(new Map());

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const rows = [...list.querySelectorAll("[data-flip]")];
    const next = new Map(rows.map((row) => [row.dataset.flip, row.getBoundingClientRect().top]));

    if (!prefersReducedMotion()) {
      for (const row of rows) {
        const before = positions.current.get(row.dataset.flip);
        const after = next.get(row.dataset.flip);
        if (before == null || Math.abs(before - after) < 1) continue;
        row.animate(
          [{ transform: `translateY(${before - after}px)` }, { transform: "translateY(0)" }],
          { duration: 700, easing: "cubic-bezier(.2,.8,.2,1)" }
        );
      }
    }
    positions.current = next;
  }, [order, listRef]);
}

function Countdown({ target }) {
  const now = useNow(1000);
  const left = Math.max(0, target - now);
  const units = [
    ["Days", Math.floor(left / 86_400_000)],
    ["Hours", Math.floor(left / 3_600_000) % 24],
    ["Minutes", Math.floor(left / 60_000) % 60],
    ["Seconds", Math.floor(left / 1000) % 60]
  ];

  return (
    <div className="lb-countdown" role="timer" aria-label="Time until the challenge starts">
      {units.map(([label, value]) => (
        <div className="lb-countdown-cell" key={label}>
          <span className="lb-countdown-value" key={value}>
            {String(value).padStart(2, "0")}
          </span>
          <span className="lb-countdown-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

const MEDALS = {
  1: { tier: "gold", label: "1st" },
  2: { tier: "silver", label: "2nd" },
  3: { tier: "bronze", label: "3rd" }
};

function PodiumSpot({ row, place, bump }) {
  const medal = MEDALS[place];
  if (!row) {
    return (
      <div className={`lb-podium-spot lb-${medal.tier} is-open`} style={{ "--order": place }}>
        <div className="lb-avatar">
          <span>?</span>
        </div>
        <p className="lb-podium-name">Open spot</p>
        <p className="lb-podium-count">&nbsp;</p>
        <div className="lb-pedestal">
          <span className="lb-pedestal-place">{place}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`lb-podium-spot lb-${medal.tier}${bump ? " is-bumped" : ""}`} style={{ "--order": place }}>
      {place === 1 && <span className="lb-crown" aria-hidden="true" />}
      <div className="lb-avatar">
        <span>{initials(row.name)}</span>
        {bump && <span className="lb-plus">+{bump.gained}</span>}
      </div>
      <p className="lb-podium-name">{row.name}</p>
      <p className="lb-podium-count">
        <strong>
          <CountUp value={row.classes} />
        </strong>{" "}
        {row.classes === 1 ? "class" : "classes"}
      </p>
      <div className="lb-pedestal">
        <span className="lb-pedestal-place">{place}</span>
        <span className="lb-pedestal-label">{medal.label}</span>
      </div>
    </div>
  );
}

function Podium({ leaders, bumps }) {
  const [first, second, third] = leaders;
  return (
    <section className="lb-podium" aria-label="Top three">
      <PodiumSpot row={second} place={2} bump={second && bumps[second.key]} />
      <PodiumSpot row={first} place={1} bump={first && bumps[first.key]} />
      <PodiumSpot row={third} place={3} bump={third && bumps[third.key]} />
    </section>
  );
}

function RankList({ leaders, topCount, bumps }) {
  const listRef = useRef(null);
  const rest = leaders.slice(3);
  useFlip(listRef, rest.map((row) => row.key).join("|"));

  if (!rest.length) return null;

  return (
    <section className="lb-list-wrap" aria-label="Everyone else">
      <ol className="lb-list" ref={listRef}>
        {rest.map((row, index) => (
          <li
            className={`lb-row${bumps[row.key] ? " is-bumped" : ""}`}
            data-flip={row.key}
            key={row.key}
            style={{ "--i": Math.min(index, 18) }}
          >
            <span className="lb-row-rank">{row.position}</span>
            <span className="lb-row-avatar" aria-hidden="true">
              {initials(row.name)}
            </span>
            <span className="lb-row-main">
              <span className="lb-row-name">{row.name}</span>
              <span className="lb-row-bar" aria-hidden="true">
                <span style={{ width: `${Math.max(4, (row.classes / Math.max(topCount, 1)) * 100)}%` }} />
              </span>
            </span>
            <span className="lb-row-count">
              {bumps[row.key] && <span className="lb-row-plus">+{bumps[row.key].gained}</span>}
              <strong>{row.classes}</strong>
              <small>{row.classes === 1 ? "class" : "classes"}</small>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Stats({ board, now }) {
  const daysLeft = Math.max(0, Math.ceil((END_MS - Math.max(now, START_MS)) / 86_400_000));
  const items = [
    ["Classes taken", board.totalClasses],
    ["On the board", board.participants],
    board.status === "final" ? ["Classes held", board.classesHeld] : ["Days left", daysLeft]
  ];
  return (
    <dl className="lb-stats">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            <CountUp value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.6,
        duration: 2.8 + Math.random() * 2.2,
        rotate: Math.random() * 360,
        tone: ["#e9c46a", "#f6e7b0", "#c9ccd1", "#c58b5b", "#71c7a7"][i % 5]
      })),
    []
  );
  if (prefersReducedMotion()) return null;
  return (
    <div className="lb-confetti" aria-hidden="true">
      {pieces.map((piece, i) => (
        <i
          key={i}
          style={{
            left: `${piece.left}%`,
            background: piece.tone,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            transform: `rotate(${piece.rotate}deg)`
          }}
        />
      ))}
    </div>
  );
}

function StatusPill({ status, sample }) {
  if (sample) return <span className="lb-pill is-sample">Sample data</span>;
  if (status === "live")
    return (
      <span className="lb-pill is-live">
        <i /> Live
      </span>
    );
  if (status === "final") return <span className="lb-pill is-final">Final standings</span>;
  return <span className="lb-pill">Starts {new Date(START_MS).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>;
}

function readSampleFlag() {
  try {
    return new URLSearchParams(window.location.search).has("preview");
  } catch {
    return false;
  }
}

function setSampleFlag(on) {
  const url = new URL(window.location.href);
  if (on) url.searchParams.set("preview", "1");
  else url.searchParams.delete("preview");
  window.history.replaceState(null, "", url);
}

function App() {
  const now = useNow(30_000);
  const [sample, setSample] = useState(readSampleFlag);
  const [live, setLive] = useState(null);
  const [demo, setDemo] = useState(() => (readSampleFlag() ? sampleBoard() : null));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!readSampleFlag());

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/leaderboard", { headers: { Accept: "application/json" } });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Could not load the leaderboard.");
      setLive(data);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load the leaderboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sample) return undefined;
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sample, load]);

  useEffect(() => {
    if (!sample || prefersReducedMotion()) return undefined;
    const timer = setInterval(() => setDemo((board) => (board ? sampleTick(board) : board)), SAMPLE_TICK_MS);
    return () => clearInterval(timer);
  }, [sample]);

  const toggleSample = (on) => {
    setSampleFlag(on);
    setSample(on);
    if (on) setDemo(sampleBoard());
    else setLoading(!live);
  };

  const fallbackStatus = now < START_MS ? "upcoming" : now >= END_MS ? "final" : "live";
  const board = sample ? demo : live;
  const status = board?.status || fallbackStatus;
  const leaders = board?.leaders || [];
  const bumps = useBumps(leaders);
  const showBoard = sample || (status !== "upcoming" && leaders.length > 0);

  useEffect(() => {
    document.title = `${LEADERBOARD.title} | Cave Modern Pilates`;
  }, []);

  return (
    <div className={`lb-page is-${status}${sample ? " is-sample" : ""}`}>
      <div className="lb-glow" aria-hidden="true" />
      {showBoard && (status === "final" || sample) && <Confetti key={sample ? "s" : "f"} />}

      <header className="lb-header">
        <p className="lb-wordmark">Cave Modern Pilates</p>
        <StatusPill status={status} sample={sample} />
      </header>

      <main className="lb-main">
        <section className="lb-hero">
          <p className="lb-kicker">{formatRange()} · One class, one point</p>
          <h1>
            {status === "final" && !sample ? "And the winners are" : "Class Challenge"}
            <span>Leaderboard</span>
          </h1>
        </section>

        {sample && (
          <div className="lb-banner">
            <p>
              You're looking at sample names and numbers. Real standings start counting on{" "}
              {new Date(START_MS).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.
            </p>
            <button type="button" onClick={() => toggleSample(false)}>
              Back to the real board
            </button>
          </div>
        )}

        {!sample && status === "upcoming" && (
          <section className="lb-upcoming">
            <p className="lb-upcoming-lead">The board opens in</p>
            <Countdown target={START_MS} />
            <ul className="lb-rules">
              <li>
                <strong>1 class = 1 point.</strong> Every Cave class you take from {formatRange()} counts.
              </li>
              <li>
                <strong>Fresh start.</strong> Everyone begins at zero on {new Date(START_MS).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
              </li>
              <li>
                <strong>Top three take the podium.</strong> Gold, silver and bronze.
              </li>
            </ul>
            <button type="button" className="lb-button" onClick={() => toggleSample(true)}>
              Preview with sample data
            </button>
          </section>
        )}

        {!sample && status !== "upcoming" && loading && !live && <p className="lb-empty">Loading the standings…</p>}

        {!sample && status !== "upcoming" && !loading && leaders.length === 0 && !error && (
          <section className="lb-upcoming">
            <p className="lb-upcoming-lead">The challenge is on</p>
            <p className="lb-empty">The first classes are counted as soon as they finish. Check back after class.</p>
            <button type="button" className="lb-button" onClick={() => toggleSample(true)}>
              Preview with sample data
            </button>
          </section>
        )}

        {error && !sample && <p className="lb-error">{error}</p>}

        {showBoard && board && (
          <>
            <Stats board={board} now={now} />
            <Podium leaders={leaders} bumps={bumps} />
            <RankList leaders={leaders} topCount={leaders[0]?.classes || 1} bumps={bumps} />
          </>
        )}
      </main>

      <footer className="lb-footer">
        <p>Late cancels and no-shows don't count. Ties go to whoever reached the total first.</p>
        {board?.updatedAt && !sample && status !== "upcoming" && (
          <p>
            Updated {new Date(board.updatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            {status === "live" ? " · refreshes every few minutes" : ""}
          </p>
        )}
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
