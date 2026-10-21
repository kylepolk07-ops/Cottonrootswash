# Frontend contributor report

Contributor: `/root/frontend`, reporting to `/root`. Scope: two mobile frontends and shared browser assets. No external services, credentials, payments, or identity collection connected.

## Reviewable changes

- `apps/customer/index.html` and `apps/contractor/index.html`: separate application entry points, explicit synthetic staging banner, safe shared assets, responsive viewport.
- `web/style.css`: cream/sage/ink palette, rounded illustrated cards, large touch targets, visible keyboard focus, reduced-motion-aware styles, mobile-safe wrapping.
- `web/app.mjs`: authenticated same-origin API client with CSRF header and idempotency keys; server-backed sessions, orders, claim, availability, custody, earnings, and management. No browser storage authorization, no client payment flags, and no HTML insertion of untrusted strings.
- Customer: bag-box/lock acknowledgment, unique bag claim, service/detergent/review booking steps, dropoff QR checks, paid-ready pickup action, optional rating after completed pickup.
- Contractor: deadline review and acknowledgment, two-week availability, work preference, bag/weigh/station checkout, later washing completion/bag/station check-in, pending earnings. Management screens require server-authorized role and show audit trail.
- Native QR scanning when `BarcodeDetector` and camera APIs are available, explicit manual token entry otherwise. Camera is stopped on route change and page exit. Manual fallback remains available after permission denial.
- Full-service home collection is displayed as unavailable because the backend correctly blocks unimplemented routing. Synthetic deadline note is shown alongside every order.
- `tests/browser.mjs`: repeatable isolated fixture browser workflow. No retained staging database modifications. Screenshots are generated to ignored `test-results/`.

## Verification

Executed `node --check web/app.mjs`: PASS.

Executed twice:

```sh
PLAYWRIGHT_MODULE=/workspace/scratch/browser-tests/node_modules/playwright/index.mjs node tests/browser.mjs
```

Both runs PASS in headless system Chromium at 390 × 844, America/Chicago timezone. Exercised actual UI login, claim, booking, wrong QR rejection with recovery, dropoff, page-reload persistence, availability, deadline acceptance, 12.1 lb rounded to 12.5 lb, checkout, washing completion, return bag/station check-in, pending earnings, customer/contractor management 403, owner management audit. No browser exceptions. No horizontal overflow on management screen. Screenshot reviewed for customer layout.

## Limits / remaining verification

- Local synthetic staging only; no hosted staging deployment or real accounts.
- Production signup/recovery, management MFA, Square checkout/webhooks/payouts, SMS/access codes, real document uploads, and home collection routing are not implemented by these frontends.
- Paid-ready pickup/rating UI exists but cannot be reached through an ordinary staging payment because payment integration is disabled; backend/domain tests must cover those gates independently.
- No actual iPhone/Android hardware tests, camera permission/device scans, screen-reader audit, or full accessibility certification performed. Native QR detection is unavailable in some browsers; manual entry is intentional fallback.
- Package visual references remain unchanged. Changes are available as source diff; lead owns central log and final review.

Rollback: restore/remove these five application asset files and browser smoke script from source review. Does not change database or customer records.
