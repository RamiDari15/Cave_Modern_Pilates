import { copyFileSync, cpSync, createReadStream, existsSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { handleApiRequest } from "./server/api.mjs";

const htmlPages = ["index", "pricing", "newbie", "memberships", "class-packs", "drop-in", "schedule", "about", "contact", "faq", "login", "signup", "account", "terms", "policies"];
const cacheFile = resolve(__dirname, "data/studio-cache.json");
const cleanPagePaths = new Set(htmlPages.filter((page) => page !== "index").map((page) => `/${page}`));
const siteUrl = "https://www.cavemodernpilates.com";
const seoPages = {
  index: ["Women's Pilates & Lagree in Orland Park | Cave Modern Pilates", "Cave Modern Pilates is a women's Pilates and high-intensity, low-impact fitness studio in Orland Park, near Tinley Park, Palos, Mokena, Homer Glen, and Frankfort."],
  pricing: ["Pilates Pricing in Orland Park | Cave Modern Pilates", "Compare Cave Modern Pilates memberships, class packs, drop-ins, and new-client offers at our women's Pilates studio in Orland Park, Illinois."],
  newbie: ["New Client Pilates Offer in Orland Park | Cave Modern Pilates", "Start Pilates in Orland Park with a Cave Modern Pilates new-client offer. Welcoming women from Tinley Park, Palos Hills, Mokena, Homer Glen, and Frankfort."],
  memberships: ["Pilates Memberships in Orland Park | Cave Modern Pilates", "Explore women's Pilates memberships at Cave Modern Pilates in Orland Park, including monthly class plans and unlimited membership options."],
  "class-packs": ["Pilates Class Packs in Orland Park | Cave Modern Pilates", "Buy flexible Pilates class packs at Cave Modern Pilates in Orland Park, serving Tinley Park, Palos, Mokena, Homer Glen, and Frankfort."],
  "drop-in": ["Drop-In Pilates Class in Orland Park | Cave Modern Pilates", "Book one drop-in reformer Pilates class at Cave Modern Pilates in Orland Park. No membership or long-term commitment required."],
  schedule: ["Orland Park Pilates & Lagree Class Schedule | Cave Modern Pilates", "View and book the Cave Modern Pilates class schedule in Orland Park for modern reformer Pilates and high-intensity, low-impact workouts."],
  about: ["Women's Pilates Studio in Orland Park | Cave Modern Pilates", "Meet Cave Modern Pilates, a women-focused Pilates studio in Orland Park created to build strength, confidence, and community through movement."],
  contact: ["Contact Our Orland Park Pilates Studio | Cave Modern Pilates", "Contact Cave Modern Pilates at 31 Orland Square Drive in Orland Park for classes, memberships, private sessions, and studio questions."],
  faq: ["Pilates Membership & Booking FAQ | Cave Modern Pilates", "Get answers about Cave Modern Pilates classes, memberships, booking, cancellations, guest passes, refunds, and women's studio policies."],
  login: ["Login | Cave Modern Pilates", "Sign in to your Cave Modern Pilates account."],
  signup: ["Sign Up | Cave Modern Pilates", "Create your Cave Modern Pilates client account and complete the first-class liability waiver."],
  account: ["Account | Cave Modern Pilates", "View your Cave Modern Pilates account, bookings, credits, and memberships."],
  terms: ["Terms of Service | Cave Modern Pilates", "Read the Cave Modern Pilates terms of service, membership agreement, recurring billing terms, cancellation requirements, and purchase conditions."],
  policies: ["Studio Policies | Cave Modern Pilates", "Review Cave Modern Pilates studio policies for booking, late cancellations, no-shows, safety, privacy, refunds, and the participant liability waiver."]
};

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
    transformIndexHtml(html, context) {
      const page = basename(context.filename || "index.html", ".html");
      const [title, description] = seoPages[page] || seoPages.index;
      const path = page === "index" ? "/" : `/${page}`;
      const canonical = `${siteUrl}${path}`;
      const isPrivate = ["login", "signup", "account"].includes(page);
      const structuredData = JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": ["HealthClub", "SportsActivityLocation", "LocalBusiness"],
            "@id": `${siteUrl}/#studio`,
            name: "Cave Modern Pilates",
            alternateName: ["Cave Pilates", "Cave Modern Pilates Orland Park"],
            url: siteUrl,
            image: `${siteUrl}/og-image.jpg`,
            description: seoPages.index[1],
            email: "support@cavemodernpilates.com",
            telephone: "+1-708-571-5730",
            priceRange: "$$",
            address: {
              "@type": "PostalAddress",
              streetAddress: "31 Orland Square Drive, Suite B",
              addressLocality: "Orland Park",
              addressRegion: "IL",
              postalCode: "60462",
              addressCountry: "US"
            },
            areaServed: ["Orland Park", "Tinley Park", "Palos", "Palos Hills", "Mokena", "Homer Glen", "Frankfort"].map((name) => ({ "@type": "City", name })),
            sameAs: ["https://www.instagram.com/cavemodernpilates/", "https://www.tiktok.com/@cavemodernpilates"]
          },
          {
            "@type": "WebPage",
            "@id": `${canonical}#webpage`,
            url: canonical,
            name: title,
            description,
            inLanguage: "en-US",
            isPartOf: { "@id": `${siteUrl}/#website` },
            about: { "@id": `${siteUrl}/#studio` }
          },
          {
            "@type": "WebSite",
            "@id": `${siteUrl}/#website`,
            name: "Cave Modern Pilates",
            url: siteUrl,
            inLanguage: "en-US",
            publisher: { "@id": `${siteUrl}/#studio` }
          }
        ]
      });
      const tags = [
        `<link rel="canonical" href="${canonical}">`,
        `<meta name="robots" content="${isPrivate ? "noindex, nofollow" : "index, follow, max-image-preview:large"}">`,
        `<meta property="og:title" content="${title}">`,
        `<meta property="og:description" content="${description}">`,
        `<meta property="og:type" content="website">`,
        `<meta property="og:url" content="${canonical}">`,
        `<meta property="og:site_name" content="Cave Modern Pilates">`,
        `<meta property="og:image" content="${siteUrl}/og-image.jpg">`,
        `<meta property="og:image:alt" content="Cave Modern Pilates studio in Orland Park, Illinois">`,
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${title}">`,
        `<meta name="twitter:description" content="${description}">`,
        `<meta name="twitter:image" content="${siteUrl}/og-image.jpg">`,
        `<script type="application/ld+json" id="cave-modern-pilates-jsonld">${structuredData}</script>`
      ].join("\n    ");

      return html
        .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
        .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${description}">`)
        .replace("</head>", `    ${tags}\n  </head>`);
    },
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

      const socialImage = resolve(__dirname, "assets/cave-home-hero.jpeg");
      if (existsSync(socialImage)) {
        copyFileSync(socialImage, resolve(__dirname, "dist/og-image.jpg"));
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
