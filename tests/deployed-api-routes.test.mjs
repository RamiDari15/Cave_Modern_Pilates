import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { Readable } from "node:stream";
import test from "node:test";
import contact from "../api/contact.js";
import completeProfile from "../api/client/complete-profile.js";

test("frontend API routes have deployable Vercel entry points", () => {
  const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const paths = [...source.matchAll(/["'](\/api\/[\w/-]+)["']/g)].map(match => match[1]);
  for (const path of new Set(paths)) {
    assert.ok(existsSync(new URL(`..${path}.js`, import.meta.url)), `Missing Vercel route: ${path}`);
  }
});

async function post(handler, path, body) {
  const request = Readable.from([JSON.stringify(body)]);
  Object.assign(request, {
    url: path, method: "POST",
    headers: { host: "localhost", origin: "http://localhost", "content-type": "application/json" },
    socket: { remoteAddress: "route-test" }
  });
  const headers = new Map();
  let output = "";
  const response = {
    statusCode: 200,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    end(value = "") { output += value; }
  };
  await handler(request, response);
  return { status: response.statusCode, body: JSON.parse(output) };
}

test("contact deployment entry point reaches input validation", async () => {
  const result = await post(contact, "/api/contact", {});
  assert.equal(result.status, 400);
  assert.match(result.body.message, /Name, email, and message are required/);
});

test("profile deployment entry point enforces sign-in", async () => {
  const result = await post(completeProfile, "/api/client/complete-profile", {});
  assert.equal(result.status, 401);
  assert.equal(result.body.message, "Please sign in first.");
});


test("contact saves with production server credentials and reports database failures", async (t) => {
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });
  for (const key of keys) delete process.env[key];
  process.env.SUPABASE_URL = "https://contact-test.supabase.co/";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-server-only-key";
  let stored;
  const mock = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://contact-test.supabase.co/rest/v1/contact_submissions");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.apikey, "test-server-only-key");
    stored = JSON.parse(options.body);
    return new Response(null, { status: 201 });
  });
  const body = { name: "Cave Test", email: "test@example.invalid", message: "Contact save test" };
  assert.deepEqual(await post(contact, "/api/contact", body), { status: 200, body: { ok: true } });
  assert.deepEqual(stored, body);
  mock.mock.mockImplementation(async () => new Response(null, { status: 500 }));
  const failed = await post(contact, "/api/contact", body);
  assert.equal(failed.status, 500);
  assert.match(failed.body.message, /Could not save/);
});
