import { getGuestPassPeriod } from "./guestPass.js";

// Check the calendar locally; contact the server only after rollover, when
// returning to the page, or while a previous check is still unresolved.
export function watchGuestPassRenewal({ window, document, getBenefitMonth, refresh, now = () => new Date() }) {
  let active = true;
  let pending = false;

  const check = async (force = false) => {
    if (!active || pending || document.visibilityState === "hidden") return;
    if (!force && getBenefitMonth() === getGuestPassPeriod(now()).benefitMonth) return;
    pending = true;
    try {
      await refresh(() => active);
    } catch {
      // Keep the old period so the next check retries after a network failure.
    } finally {
      pending = false;
    }
  };

  const onFocus = () => { void check(true); };
  const onVisible = () => { if (document.visibilityState === "visible") void check(true); };
  const interval = window.setInterval(() => { void check(); }, 60_000);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    active = false;
    window.clearInterval(interval);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
