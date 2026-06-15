import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { handleApiRequest } from "./api.mjs";

const ROOT_DIR = resolve(import.meta.dirname, "..");
const DIST_DIR = resolve(ROOT_DIR, "dist");
const PORT = Number(process.env.PORT || 8765);
const HOST = process.env.HOST || "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = createServer(async (request, response) => {
  if (await handleApiRequest(request, response)) {
    return;
  }

  serveStatic(request, response);
});

server.listen(PORT, HOST, () => {
  console.log(`Cave Modern Pilates server running at http://${HOST}:${PORT}/`);
});

function serveStatic(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);
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
