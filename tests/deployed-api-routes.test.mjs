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
