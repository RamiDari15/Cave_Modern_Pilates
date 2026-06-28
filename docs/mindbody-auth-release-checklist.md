# Mindbody Auth Release Checklist

This site now has the correct release shape for server-side account features: browser requests hit `/api/*`, API keys stay on the server, and future account tokens should be stored in encrypted HttpOnly cookies instead of browser storage.

## Confirmed Locally

- `GET /api/auth/status` confirms the server can see the booking API config.
- `GET /api/client/required-fields` returns the studio-required client fields.
- Sign-up validation blocks incomplete client payloads before any Mindbody write request.
- Successful sign-up creates an encrypted on-site Cave session after the client record is created.
- Public pages continue to load studio pricing and schedule from the local cache instead of calling Mindbody on every page load.
- `/login` stays on the Cave site and no longer calls `/usertoken/issue`, because that endpoint is for staff user tokens.

## Must Be Verified Before Launch

- Configure the approved Mindbody OAuth client before treating custom site login as production-ready. The public booking API key alone does not verify client passwords.
- Add the OAuth credential values to production as `BOOKING_OAUTH_CLIENT_ID`, `BOOKING_OAUTH_REDIRECT_URI`, `BOOKING_OAUTH_SUBSCRIBER_ID`, and `BOOKING_OAUTH_SCOPE`. Add `BOOKING_OAUTH_CLIENT_SECRET` only if Mindbody changes the OAuth client to confidential.
- Leave `BOOKING_OAUTH_INCLUDE_SUBSCRIBER_ID=false` unless Mindbody specifically tells you the approved OAuth client requires `subscriberId` in authorize and token requests.
- For OAuth account lookup, make sure the approved OAuth scope includes the Mindbody Public API scope your app was granted, such as `Mindbody.Api.Public.v6`.
- Mindbody confirmed OAuth consumer tokens are only functional for `GET /client/clientcompleteinfo`. Add `BOOKING_SOURCE_NAME` + `BOOKING_SOURCE_PASSWORD` from Public API Source Credentials before testing booking, purchasing, cancellation, dashboard detail calls, or waiver profile sync. The backend calls `POST /usertoken/issue` and caches the returned user token. Staff credentials or a static user token are fallback options only if Mindbody Support explicitly provides them.
- Add the production redirect URI in the Mindbody developer credentials page: `https://www.cavemodernpilates.com/api/auth/callback`.
- Test `POST /api/auth/sign-up` only with an approved studio test client because a full valid request can create a real client record in Mindbody.
- After a successful sign-in, verify `GET /api/client/dashboard` returns upcoming bookings, credits, and memberships for that client.
- Check `GET /api/mindbody/readiness` after changing env vars. It reports whether login, booking, purchases, waiver sync, cache refresh, and the Mindbody OAuth authorize request are actually configured without exposing secrets.

## Production Requirements

- Set `BOOKING_API_KEY`, `BOOKING_SITE_ID`, the approved `BOOKING_OAUTH_*` values, `BOOKING_SOURCE_NAME`, `BOOKING_SOURCE_PASSWORD`, and a long random `SESSION_SECRET` on the production server.
- Serve the site over HTTPS so production cookies are sent with `Secure`.
- Set `PUBLIC_BASE_URL` and `BOOKING_OAUTH_REDIRECT_URI` to the final production domain: `https://www.cavemodernpilates.com` and `https://www.cavemodernpilates.com/api/auth/callback`.
- Do not expose the API key in Vite client env vars or browser JavaScript.
- Keep booking, purchase, payment, waiver, and cancellation actions behind server routes.
- Keep checkout PCI-safe. The website must never collect full card numbers or CVV. It only accepts saved-card last-four references today, with room to swap in a Mindbody-approved tokenized payment provider later.
- Keep public schedule/pricing cache refreshes server-side and scheduled.
- Direct class-pack/drop-in purchases through `/sale/checkoutshoppingcart` need the server-side Source Credentials user token and a saved/tokenized payment method.
- Membership purchases through `/sale/purchasecontract`, class booking through `/class/addclienttoclass`, and waiver sync through `/client/updateclient` also need the server-side Source Credentials user token.
- Do not collect raw card numbers on this site unless a PCI-compliant Mindbody-approved tokenization flow is added first.
- Signed waiver sync into Mindbody requires custom client field IDs in `BOOKING_WAIVER_*`; otherwise the site can capture the waiver but cannot write it into the Mindbody profile.

## Release Smoke Test

- Open `/`, `/pricing`, `/newbie`, `/memberships`, `/class-packs`, `/schedule`, `/about`, `/contact`, `/faq`, `/login`, `/signup`, `/account`, `/terms`, and `/policies` without `.html`.
- Confirm legacy `.html` paths redirect to clean URLs.
- Confirm `/api/auth/status` reports `configured: true`, `oauthConfigured: true`, and the exact production redirect URI.
- Confirm `/api/mindbody/readiness` is green for public cache, client login, client API access, create client, book classes, waiver sync, and session security.
- If OAuth is green but booking or buying is not, verify `BOOKING_SOURCE_NAME` and `BOOKING_SOURCE_PASSWORD` are set exactly in Vercel. OAuth alone is not enough for those actions.
- Confirm checkout readiness is green only after Mindbody payment/saved-card requirements are configured, then test with a client that already has a saved studio card.
- Sign in with a real test client, verify `/account` shows bookings, credits, and memberships in readable cards.
- Try booking a real future class from `/schedule`.
- Try a newbie offer, class pack, and membership purchase with a test client that has a Mindbody-supported saved payment method.
