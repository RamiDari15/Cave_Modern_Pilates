# Mindbody Auth Release Checklist

This site now has the correct release shape for server-side account features: browser requests hit `/api/*`, API keys stay on the server, and future account tokens should be stored in encrypted HttpOnly cookies instead of browser storage.

## Confirmed Locally

- `GET /api/auth/status` confirms the server can see the booking API config.
- `GET /api/client/required-fields` returns the studio-required client fields.
- Sign-up validation blocks incomplete client payloads before any Mindbody write request.
- Successful sign-up creates an encrypted on-site Cave session after the client record is created.
- Public pages continue to load studio pricing and schedule from the local cache instead of calling Mindbody on every page load.
- `login.html` stays on the Cave site and no longer calls `/usertoken/issue`, because that endpoint is for staff user tokens.

## Must Be Verified Before Launch

- Configure the approved Mindbody OAuth client before treating custom site login as production-ready. The public booking API key alone does not verify client passwords.
- Add the OAuth credential values to production as `BOOKING_OAUTH_CLIENT_ID`, `BOOKING_OAUTH_CLIENT_SECRET`, `BOOKING_OAUTH_REDIRECT_URI`, `BOOKING_OAUTH_SUBSCRIBER_ID`, and `BOOKING_OAUTH_SCOPE`.
- Leave `BOOKING_OAUTH_INCLUDE_SUBSCRIBER_ID=false` unless Mindbody specifically tells you the approved OAuth client requires `subscriberId` in authorize and token requests.
- For account dashboard, on-site booking, and client-owned data calls, make sure the approved OAuth scope includes the Mindbody Public API scope your app was granted, such as `Mindbody.Api.Public.v6`.
- Add the production redirect URI in the Mindbody developer credentials page, for example `https://your-domain.com/api/auth/callback`.
- Test `POST /api/auth/sign-up` only with an approved studio test client because a full valid request can create a real client record in Mindbody.
- After a successful sign-in, verify `GET /api/client/dashboard` returns upcoming bookings, credits, and memberships for that client.
- Check `GET /api/mindbody/readiness` after changing env vars. It reports whether login, booking, purchases, waiver sync, cache refresh, and the Mindbody OAuth authorize request are actually configured without exposing secrets.

## Production Requirements

- Set `BOOKING_API_KEY`, `BOOKING_SITE_ID`, `BOOKING_OAUTH_*`, and a long random `SESSION_SECRET` on the production server.
- Serve the site over HTTPS so production cookies are sent with `Secure`.
- Do not expose the API key in Vite client env vars or browser JavaScript.
- Keep booking, purchase, payment, waiver, and cancellation actions behind server routes.
- Keep public schedule/pricing cache refreshes server-side and scheduled.
- Direct class-pack/drop-in purchases through `/sale/checkoutshoppingcart` need `BOOKING_STAFF_TOKEN` and a saved/tokenized payment method.
- Do not collect raw card numbers on this site unless a PCI-compliant Mindbody-approved tokenization flow is added first.
- Signed waiver sync into Mindbody requires custom client field IDs in `BOOKING_WAIVER_*`; otherwise the site can capture the waiver but cannot write it into the Mindbody profile.
