# Cave Modern Pilates React Website

A multi-page React/Vite website for Cave Modern Pilates with a Beachhouse-style home hero, separate nav pages, and a server-side booking API cache sync.

## Pages

The public site uses clean URLs in production:

- `/` is the React home entry: hero video, pricing preview, app-coming-soon block, and footer.
- `/pricing`, `/newbie`, `/memberships`, and `/class-packs` render store pricing from `data/studio-cache.json`.
- `/schedule` renders class schedule data from `data/studio-cache.json`.
- `/about`, `/contact`, `/faq`, `/login`, `/signup`, `/account`, `/terms`, and `/policies` are separate React routes.
- Shared app code lives in `src/main.jsx`, `src/studioCache.js`, and `src/styles.css`.

Vercel clean URLs are enabled in `vercel.json`, and the Node server redirects legacy `.html` paths to their clean equivalents.

## Local Development

Install dependencies once:

```bash
npm install
```

Run the React dev server:

```bash
npm run dev
```

Build production files:

```bash
npm run build
```

Run the production-style server locally:

```bash
npm start
```

## Booking API Sync

The browser does not call the booking API directly. Run the sync script server-side:

```bash
python3 scripts/sync_booking_api.py
```

Put credentials in an ignored `.env` file first:

```bash
BOOKING_API_KEY=your_key_here
BOOKING_SITE_ID=5753835
SESSION_SECRET=use_a_long_random_secret
PUBLIC_BASE_URL=https://cavemodernpilates.com
```

The script writes:

- `data/studio-cache.json` for public pages.
- `api_results/*.json` for raw API responses and debugging.

`api_results/` and `.env` are ignored by Git.

The production-style server can also refresh the public cache on an interval:

```bash
BOOKING_CACHE_SYNC=true
BOOKING_SYNC_ON_START=true
BOOKING_CACHE_REFRESH_MINUTES=15
```

Use a 5-15 minute interval for public schedule data. This starter refreshes pricing, contracts, staff, and location data with the same job; split those into slower scheduled jobs later if traffic grows.

## Account API Proxy

Client sign-up and account dashboard requests go through the Vite dev server proxy:

- `POST /api/auth/sign-in`
- `POST /api/auth/sign-up`
- `GET /api/auth/status`
- `GET /api/client/required-fields`
- `GET /api/client/dashboard`

The proxy and production server read `BOOKING_API_KEY`, `BOOKING_SITE_ID`, and `SESSION_SECRET` from `.env`, so API credentials and account tokens are never bundled into browser JavaScript.

Sessions are stored in encrypted, HttpOnly cookies. Browser JavaScript receives only a safe public session object.

Mindbody Public API v6 user tokens are staff tokens, not client password login tokens. `/login` starts Mindbody OAuth through `/api/auth/start`; Mindbody posts the authorization code to `/api/auth/callback`; the backend exchanges that code at `https://signin.mindbodyonline.com/connect/token` and stores the returned access token in an encrypted HttpOnly cookie. See `docs/mindbody-auth-release-checklist.md`.

The sign-up form sends the liability waiver with the new client payload. To store waiver signatures in Mindbody, create custom client fields in Mindbody and set the field IDs:

```bash
BOOKING_WAIVER_CUSTOM_FIELD_ID=
BOOKING_WAIVER_SIGNATURE_FIELD_ID=
BOOKING_WAIVER_DATE_FIELD_ID=
BOOKING_WAIVER_VERSION_FIELD_ID=
```

The sign-up form includes the required client fields returned by the studio API:

- address
- state
- city
- postal code
- mobile phone
- email

## Production Publish Checklist

1. Add the production environment variables from `.env.example` to Vercel.
2. In Mindbody developer credentials, add the production redirect URI exactly: `https://your-domain.com/api/auth/callback`.
3. Keep `BOOKING_OAUTH_SCOPE` limited to the approved scopes shown in the Mindbody OAuth client.
4. Run `GET /api/mindbody/readiness` after deploy. It reports login, booking, checkout, waiver sync, cache refresh, and OAuth preflight status without exposing secrets.
5. Run `npm run sync` or enable `BOOKING_CACHE_SYNC=true` so pricing and schedule refresh from Mindbody automatically.
6. Create Mindbody custom client fields for waiver storage and set the `BOOKING_WAIVER_*` IDs.
7. For direct on-site purchases, confirm the studio has a Mindbody-supported saved-card/tokenized payment flow or set `BOOKING_STAFF_TOKEN` for service checkout. Do not collect raw card numbers in this app.
8. Test with a real approved studio test client: sign in, create account, save waiver, book a class, view account dashboard, and attempt each pricing category.
