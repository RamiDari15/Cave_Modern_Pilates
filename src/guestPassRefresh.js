// One bounded membership check every three visible minutes. Focus/visibility events
// share the same cooldown and in-flight guard; hidden tabs never poll.
export function watchGuestPassRenewal({ window, document, refresh, now = () => new Date() }) {
  let active = true;
  let pending = false;
  let lastAttempt = Number(now());
  let failures = 0;
  const check = async () => {
    const timestamp = Number(now());
    const cooldown = Math.min(180_000 * 2 ** failures, 900_000);
    if (!active || pending || document.visibilityState === "hidden" || timestamp - lastAttempt < cooldown) return;
    pending = true;
    lastAttempt = timestamp;
    try {
      await refresh(() => active);
      failures = 0;
    } catch {
      failures = Math.min(failures + 1, 3);
    } finally {
      pending = false;
    }
  };
  const onFocus = () => { void check(); };
  const onVisible = () => { if (document.visibilityState === "visible") void check(); };
  const interval = window.setInterval(() => { void check(); }, 180_000);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    active = false;
    window.clearInterval(interval);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
