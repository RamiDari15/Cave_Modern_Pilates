# Booking API And Cache Strategy

This site treats the booking API as a server-side integration. Public pages render from cached data and never call the API directly from the browser on every visit.

## Public Cache Targets

- Locations, rooms, resources: refresh every 24 hours.
- Staff and instructors: refresh every 24 hours.
- Class descriptions, session types, and programs: refresh every 24 hours.
- Pricing, packages, memberships, and contracts: refresh every 6 to 12 hours.
- Public class schedule: refresh every 5 to 15 minutes.
- Appointment availability: refresh every 2 to 5 minutes.
- Waiver text and version: refresh every 24 hours or immediately after a content change.

## Request Flow

1. A scheduled backend job runs `scripts/sync_booking_api.py` with server-held credentials.
2. The job calls booking API endpoints and saves raw responses under `api_results/`.
3. The job normalizes memberships, class schedule, and location data into `data/studio-cache.json`.
4. Public pages read cache first and render immediately.
5. If a cache record is stale, the backend refreshes it in the background.
6. Webhooks refresh affected records immediately after booking, canceling, purchase, membership, client, or waiver changes.

## Private Client Flows

- Custom login, account creation, client profile, waiver status, dashboard data, bookings, visits, credits, memberships, and contracts should call the backend after authentication.
- Client dashboard data should refresh on login and immediately after booking, canceling, purchase, or waiver signature actions.
- Waiver signature capture should store the signed waiver version, timestamp, and client identifier before refreshing the client profile cache.

## Browser Rule

The browser should request only the local site cache endpoint or static cache snapshot. It should not request booking API credentials, tokens, or raw API endpoints.

## Fallbacks

Use embedded checkout widgets only for payment checkout, unusually complex purchase flows, emergency booking fallback, or account fallback while a custom API flow is incomplete.

## Public Site Data

- `data/studio-cache.json` stores public memberships, schedule preview, location, booking route, and cache policy.
- `/pricing` and `/schedule` render from this cache.
- `src/main.jsx` uses built-in fallback data for direct `file://` preview, then refreshes from `data/studio-cache.json` when served over HTTP.
