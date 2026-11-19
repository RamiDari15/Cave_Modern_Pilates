import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { LEADERBOARD } from "./leaderboardConfig.js";
import "./leaderboard.css";

const REFRESH_MS = 5 * 60 * 1000;
const STUDIO_TIME_ZONE = "America/Chicago";

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

  const secondsProgress = (left % 60_000) / 60_000;

  return (
    <div className="lb-countdown" role="timer" aria-label="Time until the challenge starts">
      {units.map(([label, value], index) => (
        <React.Fragment key={label}>
          {index > 0 && (
            <span className="lb-countdown-sep" aria-hidden="true">
              :
            </span>
          )}
          <div className={`lb-countdown-cell${label === "Seconds" ? " is-seconds" : ""}`} style={{ "--i": index }}>
            <span className="lb-countdown-value">
              {String(value)
                .padStart(2, "0")
                .split("")
                .map((digit, place) => (
                  <span className="lb-digit" key={`${place}-${digit}`}>
                    {digit}
                  </span>
                ))}
            </span>
            <span className="lb-countdown-label">{label}</span>
            {label === "Seconds" && <span className="lb-countdown-sweep" style={{ transform: `scaleX(${secondsProgress})` }} aria-hidden="true" />}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// Fades a block in the first time it scrolls into view.
function Reveal({ as: Tag = "div", className = "", delay = 0, children, ...rest }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(() => prefersReducedMotion() || typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (visible || !ref.current) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <Tag ref={ref} className={`lb-reveal${visible ? " is-visible" : ""} ${className}`} style={{ "--delay": `${delay}ms` }} {...rest}>
      {children}
    </Tag>
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
        <p className="lb-podium-name">Could be you</p>
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

function Stats({ board, now, phase }) {
  const daysLeft = Math.max(0, Math.ceil((END_MS - Math.max(now, START_MS)) / 86_400_000));
  const items = [
    ["Classes taken", board.totalClasses],
    ["On the board", board.participants],
    phase === "live" ? ["Days left", daysLeft] : ["Classes held", board.classesHeld]
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

function readPreviewFlag() {
  try {
    return new URLSearchParams(window.location.search).get("preview") === "1";
  } catch {
    return false;
  }
}

function phaseAt(time) {
  if (time < START_MS) return "upcoming";
  if (time >= END_MS) return "final";
  return "live";
}

function StatusPill({ status }) {
  if (status === "live")
    return (
      <span className="lb-pill is-live">
        <i /> Live
      </span>
    );
  if (status === "preview") return <span className="lb-pill is-preview">Preview</span>;
  if (status === "final") return <span className="lb-pill is-final">Final standings</span>;
  return <span className="lb-pill">Starts {new Date(START_MS).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>;
}

function Rules() {
  const startLabel = new Date(START_MS).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const steps = [
    ["Take class", `Every Cave class you finish from ${formatRange()} earns 1 point.`],
    ["Start fresh", `Everyone begins at zero at midnight on ${startLabel}. Nothing before it counts.`],
    ["Climb the board", "The top three take gold, silver and bronze. Standings update through the day."]
  ];
  return (
    <ol className="lb-steps">
      {steps.map(([title, text], index) => (
        <Reveal as="li" className="lb-step" delay={index * 120} key={title}>
          <span className="lb-step-number">{String(index + 1).padStart(2, "0")}</span>
          <h3>{title}</h3>
          <p>{text}</p>
        </Reveal>
      ))}
    </ol>
  );
}

// The Challenge page: a countdown until the start date, then (on its own, at
// midnight) the live leaderboard. /challenge?preview=1 shows the live board
// before launch, scored on the last two weeks of real classes.
export function ChallengePage() {
  const now = useNow(1000);
  const [preview] = useState(readPreviewFlag);
  const phase = preview && phaseAt(now) === "upcoming" ? "preview" : phaseAt(now);
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(phase !== "upcoming");

  const load = useCallback(async (currentPhase) => {
    try {
      // The phase in the URL gives each phase its own cached copy, so the
      // switch at midnight never shows an older phase's response.
      const query = currentPhase === "preview" ? "preview=1" : `phase=${currentPhase}`;
      const response = await fetch(`/api/leaderboard?${query}`, { headers: { Accept: "application/json" } });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Could not load the leaderboard.");
      setBoard(data);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load the leaderboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (phase === "upcoming") return undefined;
    setLoading(true);
    load(phase);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load(phase);
    }, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && load(phase);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [phase, load]);

  const leaders = phase !== "upcoming" && board?.status === phase ? board.leaders || [] : [];
  const bumps = useBumps(leaders);
  const showBoard = phase !== "upcoming" && leaders.length > 0;
  const startLong = new Date(START_MS).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className={`lb-page is-${phase}`}>
      {showBoard && phase === "final" && <Confetti />}

      <section className="lb-hero">
        <div className="lb-hero-meta">
          <p className="lb-kicker">{formatRange()} leaderboard</p>
          <StatusPill status={phase} />
        </div>
        <h1>{phase === "final" ? "Final standings" : "The Cave Challenge"}</h1>
      </section>

      <div className="lb-panel">
        {phase === "preview" && (
          <div className="lb-banner">
            <p>
              <strong>Preview</strong> using the last two weeks of real classes. Everyone else sees the countdown until {startLong}.
            </p>
          </div>
        )}

        {phase === "upcoming" && (
          <>
            <section className="lb-upcoming">
              <p className="lb-section-kicker">The challenge starts in</p>
              <Countdown target={START_MS} />
            </section>
            <Reveal as="section" className="lb-section">
              <p className="lb-section-kicker">How it works</p>
              <h2 className="lb-section-title">One class. One point.</h2>
              <Rules />
            </Reveal>
            <Reveal as="section" className="lb-section lb-teaser">
              <p className="lb-section-kicker">The podium</p>
              <h2 className="lb-section-title">Who takes gold?</h2>
              <Podium leaders={[]} bumps={{}} />
            </Reveal>
          </>
        )}

        {phase !== "upcoming" && loading && !showBoard && <p className="lb-empty">Loading the standings…</p>}

        {phase !== "upcoming" && !loading && !showBoard && !error && (
          <>
            <section className="lb-upcoming">
              <p className="lb-section-kicker">The challenge is on</p>
              <p className="lb-empty">Classes are counted as soon as they finish. The first names appear here after the first class of the day.</p>
            </section>
            <Reveal as="section" className="lb-section">
              <p className="lb-section-kicker">How it works</p>
              <h2 className="lb-section-title">One class. One point.</h2>
              <Rules />
            </Reveal>
          </>
        )}

        {error && <p className="lb-error">{error}</p>}

        {showBoard && (
          <>
            <Stats board={board} now={now} phase={phase} />
            <Podium leaders={leaders} bumps={bumps} />
            <RankList leaders={leaders} topCount={leaders[0]?.classes || 1} bumps={bumps} />
          </>
        )}

        <div className="lb-note">
          <p>Late cancels and no-shows don't count. Ties go to whoever reached the total first.</p>
          {showBoard && board?.updatedAt && (
            <p>
              Updated {new Date(board.updatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              {phase === "final" ? "" : " · refreshes every few minutes"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
