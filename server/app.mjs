import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { getBookingConfig, handleApiRequest } from "./api.mjs";

const ROOT_DIR = resolve(import.meta.dirname, "..");
const DIST_DIR = resolve(ROOT_DIR, "dist");
const PORT = Number(process.env.PORT || 8765);
const HOST = process.env.HOST || "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4"
};

const server = createServer(async (request, response) => {
  if (await handleApiRequest(request, response)) {
    return;
  }

  serveStatic(request, response);
});

server.listen(PORT, HOST, () => {
  console.log(`Cave Modern Pilates server running at http://${HOST}:${PORT}/`);
  startStudioCacheRefresh();
});

function serveStatic(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);
  const cleanPathname = cleanHtmlPath(pathname);

  if (cleanPathname !== pathname) {
    response.statusCode = 308;
    response.setHeader("Location", `${cleanPathname}${url.search}`);
    response.end();
    return;
  }

  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const candidate = resolve(DIST_DIR, safePath === "/" ? "index.html" : safePath.slice(1));
  const filePath = candidate.startsWith(DIST_DIR) ? candidate : join(DIST_DIR, "index.html");
  const finalPath = resolveHtmlFallback(filePath);

  if (!finalPath || !existsSync(finalPath)) {
    response.statusCode = 404;
    response.end("Not found");
    return;
  }

  response.statusCode = 200;
  response.setHeader("Content-Type", TYPES[extname(finalPath)] || "application/octet-stream");
  createReadStream(finalPath).pipe(response);
}

function cleanHtmlPath(pathname) {
  if (pathname === "/index.html" || pathname === "/index") {
    return "/";
  }

  if (pathname.endsWith(".html")) {
    return pathname.slice(0, -5) || "/";
  }

  return pathname;
}

function resolveHtmlFallback(filePath) {
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    return filePath;
  }

  if (!extname(filePath)) {
    const htmlPath = `${filePath}.html`;

    if (existsSync(htmlPath)) {
      return htmlPath;
    }
  }

  return null;
}

let isSyncingStudioCache = false;

function startStudioCacheRefresh() {
  const disabled = process.env.BOOKING_CACHE_SYNC === "false";
  const { apiKey } = getBookingConfig();

  if (disabled || !apiKey) {
    return;
  }

  const requestedMinutes = Number(process.env.BOOKING_CACHE_REFRESH_MINUTES || 15);
  const refreshMinutes = Number.isFinite(requestedMinutes) ? Math.max(requestedMinutes, 5) : 15;
  const intervalMs = refreshMinutes * 60 * 1000;

  if (process.env.BOOKING_SYNC_ON_START !== "false") {
    runStudioCacheSync("startup");
  }

  const timer = setInterval(() => runStudioCacheSync("interval"), intervalMs);
  timer.unref?.();
}

function runStudioCacheSync(reason) {
  if (isSyncingStudioCache) {
    return;
  }

  isSyncingStudioCache = true;

  const child = spawn("python3", ["scripts/sync_booking_api.py"], {
    cwd: ROOT_DIR,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  let errorOutput = "";

  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    errorOutput += chunk.toString();
  });

  child.on("close", (code) => {
    isSyncingStudioCache = false;

    if (code === 0) {
      console.log(`Studio cache refreshed from Mindbody (${reason}).`);
      return;
    }

    console.warn(`Studio cache refresh failed (${reason}) with exit code ${code}.`);
    if (errorOutput || output) {
      console.warn((errorOutput || output).slice(-1500));
    }
  });

  child.on("error", (error) => {
    isSyncingStudioCache = false;
    console.warn(`Studio cache refresh could not start: ${error.message}`);
  });
}
r