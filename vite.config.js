import { copyFileSync, cpSync, createReadStream, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { handleApiRequest } from "./server/api.mjs";

const htmlPages = ["index", "pricing", "newbie", "memberships", "class-packs", "drop-in", "schedule", "about", "contact", "faq", "login", "signup", "account", "terms", "policies"];
const cacheFile = resolve(__dirname, "data/studio-cache.json");
const cleanPagePaths = new Set(htmlPages.filter((page) => page !== "index").map((page) => `/${page}`));

function cleanHtmlPath(pathname) {
  if (pathname === "/index.html" || pathname === "/index") {
    return "/";
  }

  if (pathname.endsWith(".html")) {
    return pathname.slice(0, -5) || "/";
  }

  return pathname;
}

function studioServerPlugin() {
  return {
    name: "studio-server",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (await handleApiRequest(request, response)) {
          return;
        }

        const parsed = new URL(request.url || "/", "http://localhost");
        const cleanPathname = cleanHtmlPath(parsed.pathname);

        if (cleanPathname !== parsed.pathname) {
          response.statusCode = 308;
          response.setHeader("Location", `${cleanPathname}${parsed.search}`);
          response.end();
          return;
        }

        if (cleanPagePaths.has(parsed.pathname)) {
          request.url = `${parsed.pathname}.html${parsed.search}`;
          next();
          return;
        }

        if (parsed.pathname !== "/data/studio-cache.json") {
          next();
          return;
        }

        if (!existsSync(cacheFile)) {
          next();
          return;
        }

        response.setHeader("Content-Type", "application/json; charset=utf-8");
        createReadStream(cacheFile).pipe(response);
      });
    },
    closeBundle() {
      const source = resolve(__dirname, "data");
      const target = resolve(__dirname, "dist/data");

      if (existsSync(source)) {
        cpSync(source, target, { recursive: true });
      }

      for (const page of htmlPages.filter((page) => page !== "index")) {
        const sourceFile = resolve(__dirname, "dist", `${page}.html`);
        const targetDirectory = resolve(__dirname, "dist", page);

        if (existsSync(sourceFile)) {
          mkdirSync(targetDirectory, { recursive: true });
          copyFileSync(sourceFile, resolve(targetDirectory, "index.html"));
        }
      }
    }
  };
}

export default defineConfig({
  envDir: ".",
  plugins: [react(), studioServerPlugin()],
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        htmlPages.map((page) => [
          page,
          resolve(__dirname, page === "index" ? "index.html" : `${page}.html`)
        ])
      )
    }
  }
});
