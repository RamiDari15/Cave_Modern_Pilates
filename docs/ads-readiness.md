# Ads setup readiness — September 30, 2026

Website work extends PR #1 from the Cave Modern Pilates Facebook & Google Ads Plan. This is preparation, not confirmation that ads or tracking are live.

## Verified locally

- 110 automated tests pass; production Vite build passes.
- Mocked payment integration covers cart, legacy store, gift card and membership success/decline. No real payment was made.
- Discounted $65 intro fixture reports $55.25 in both server and browser; matching event IDs support deduplication.
- Meta failure and malformed tracking data do not turn an already successful payment into a checkout error.
- Registration fires for a newly created studio client, not for linking an existing client.
- Sandbox payments emit no conversion receipts. Customer hashes, recipient details and SMS phone numbers are not included in browser receipts.
- 16 browser checks passed at 390px and 1440px: newbie, class packs, pricing, memberships, signup, privacy and FAQ render without horizontal overflow or JavaScript page errors.
- Newbie CTA adds the $65 intro to the cart. This page suppresses the old banner and signup popup; no home hero video or ad tags load when tracking IDs are absent.
- October promotion uses Central time; BACKTOSCHOOL15 ends October 1, 2026 and cannot restart in 2027.

## Before launch

- Google Ads account and GA4 property do not exist yet, per Rami. Create them, configure conversion goals and enter real IDs/labels.
- Meta dataset 1401680614863486 previously showed Events blocked and remains configured with Health & wellness provider / Core setup. Inspect the applicable restrictions and use Meta's review flow if categorization is inaccurate; do not change labels to bypass restrictions.
- Generate/store the CAPI credential securely. No credential is committed here.
- Confirm the $65 first-month membership credit can actually be honored; this is the plan's default offer and appears on /newbie.
- Website change is not merged or deployed to production. Run live Meta Test Events and Google Tag Assistant after deployment, with one authorized intro purchase, then void it in Mindbody.
- Inspect actual membership/legacy-store provider responses for confirmed totals. Current code omits missing revenue rather than inventing a charge. Mixed-cart intro revenue is allocated proportionally.
- Review/account billing, Instagram connection and video music remain pending. Campaigns must stay off until the live purchase test passes.
- Landing-page extras still outstanding: verified Google review quotes, founder photo, and a fresh three-day class preview. Cached schedule data inspected locally was from June, so it was not presented as upcoming availability; the page links to the live schedule instead. No 4G speed guarantee has been verified.

Google delivery is browser-based in this change. Server-to-server Google conversion delivery is not implemented. SMS consent and mobile numbers are excluded from advertising payloads, preserving the site's SMS policy.
