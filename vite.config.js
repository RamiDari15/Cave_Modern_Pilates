import { createReadStream, existsSync, cpSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { handleApiRequest } from "./server/api.mjs";

const htmlPages = ["index", "pricing", "starter", "memberships", "class-packs", "schedule", "about", "contact", "faq", "login", "signup", "account", "terms", "policies"];
const cacheFile = resolve(__dirname, "data/studio-cache.json");

function studioServerPlugin() {
  return {
    name: "studio-server",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (await handleApiRequest(request, response)) {
          return;
        }

        if (request.url?.split("?")[0] !== "/data/studio-cache.json") {
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
    }
  };
}

export default defineConfig({
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
