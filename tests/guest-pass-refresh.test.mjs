import assert from "node:assert/strict";
import test from "node:test";
import { watchGuestPassRenewal } from "../src/guestPassRefresh.js";

function environment() {
  const window = new EventTarget();
  const document = new EventTarget();
  document.visibilityState = "visible";
  let tick;
  let cleared = false;
  window.setInterval = (callback, interval) => {
    assert.equal(interval, 60_000);
    tick = callback;
    return 1;
  };
  window.clearInterval = (id) => { assert.equal(id, 1); cleared = true; };
  return { window, document, tick: () => tick(), cleared: () => cleared };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("an open page refreshes a used pass after the monthly boundary without polling the server all month", async () => {
  const env = environment();
  let date = new Date("2026-10-01T03:59:59Z");
  let benefitMonth = "2026-09-01";
  let calls = 0;
  const stop = watchGuestPassRenewal({
    ...env,
    now: () => date,
    getBenefitMonth: () => benefitMonth,
    refresh: async (isActive) => { calls++; if (isActive()) benefitMonth = "2026-10-01"; }
  });
  env.tick();
  await flush();
  assert.equal(calls, 0);
  date = new Date("2026-10-01T04:00:00Z");
  env.tick();
  await flush();
  assert.equal(calls, 1);
  env.tick();
  await flush();
  assert.equal(calls, 1);
  stop();
  assert.equal(env.cleared(), true);
});

test("a sleeping tab checks its pass on return and retries a failed renewal", async () => {
  const env = environment();
  let calls = 0;
  let benefitMonth = "2026-09-01";
  const stop = watchGuestPassRenewal({
    ...env,
    now: () => new Date("2026-10-02T12:00:00Z"),
    getBenefitMonth: () => benefitMonth,
    refresh: async () => {
      calls++;
      if (calls === 1) throw new Error("Offline");
      benefitMonth = "2026-10-01";
    }
  });
  env.document.visibilityState = "hidden";
  env.tick();
  await flush();
  assert.equal(calls, 0);
  env.document.visibilityState = "visible";
  env.document.dispatchEvent(new Event("visibilitychange"));
  await flush();
  assert.equal(calls, 1);
  env.tick();
  await flush();
  assert.equal(calls, 2);
  env.window.dispatchEvent(new Event("focus"));
  await flush();
  assert.equal(calls, 3);
  stop();
});

test("focus and visibility events share one request, and leaving the page prevents late updates", async () => {
  const env = environment();
  let calls = 0;
  let release;
  let lateUpdateAllowed;
  const stop = watchGuestPassRenewal({
    ...env,
    getBenefitMonth: () => "",
    refresh: async (isActive) => {
      calls++;
      await new Promise((resolve) => { release = resolve; });
      lateUpdateAllowed = isActive();
    }
  });
  env.window.dispatchEvent(new Event("focus"));
  env.document.dispatchEvent(new Event("visibilitychange"));
  env.tick();
  assert.equal(calls, 1);
  stop();
  release();
  await flush();
  assert.equal(lateUpdateAllowed, false);
  env.window.dispatchEvent(new Event("focus"));
  env.tick();
  assert.equal(calls, 1);
});
