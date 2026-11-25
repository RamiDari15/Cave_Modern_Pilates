import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// On Vercel every API route needs its own api/**/*.js function file, or it 404s.
// Debug routes are intentionally not exposed.
test("every public server route has a Vercel function file", () => {
  const source = readFileSync(new URL("../server/api.mjs", import.meta.url), "utf8");
  const routes = [...new Set([...source.matchAll(/path === "(\/api\/[a-z0-9/-]+)"/g)].map((match) => match[1]))]
    .filter((route) => !route.startsWith("/api/debug/"));
  const missing = routes.filter((route) => !existsSync(new URL(`..${route}.js`, import.meta.url)));
  assert.deepEqual(missing, []);
});
