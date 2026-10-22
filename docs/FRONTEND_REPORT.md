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

## 2026-10-22 — Reference-driven product UI completion pass

Contributor `/root/frontend`, reporting centrally to lead `/root`. Reviewed the served source against the original `apps/customer/reference.html`, `apps/contractor/reference.html`, and `docs/BUILD_BRIEF.md`. This was a local source/browser review; no claim of having inspected the deployed provider URL or a real phone.

### Concrete gaps found and addressed

| Previous served UI gap | Implemented behavior |
| --- | --- |
| Flat order-list landing page; no Home/Today | Customer Home and Contractor Today dashboards with server-authorized summary counts, clear next actions, shop guidance and signed-in identity. Dashboard is the normal sign-in/reload landing page. Owner/staff land in protected Management. |
| Reference’s large visual choices missing | Cream/sage rounded illustrated tiles for first bag, service, booking, availability, offers, work guide, jobs and pay. Original references are retained unchanged. |
| Navigation flowed after long content | Fixed bottom navigation with phone-sized tabs; sign-out is in header account action, leaving primary tabs visible. |
| Offers and accepted work mixed together | Distinct Offers and My jobs routes. Only server-visible open offers appear in Offers; only this contractor’s assigned work appears in My jobs. Server remains authorization source. |
| No reusable illustrated SOP | Eight one-action guide screens: instructions, matching bag, weight/checkout, washing, permitted products, fold, second shop visit, pending earnings. Explicit stop-and-contact-management safety guidance. |
| Bag and wall/weight fields shown together | Dropoff: bag scan → station scan → confirmation. Contractor weighing: bag scan → measured weight → confirmation. Back/cancel preserves no client-authoritative custody update. Server mutation occurs only on final validated API call. |
| Weight was only a numeric field | Range slider, ±0.1 lb controls, numeric fallback, live measured→rounded preview. Server still independently validates/rounds weight. |
| Opaque order state text only | Expandable illustrated custody journey, measured weight, invoice amount, detergent preference, rush approval state, server deadline note. |
| Weak booking review | Visual service tile, three-stage booking/review text, explicit per-pound/approved-rush prices and disabled home collection option. No payment collected. |
| Minimal bag and availability displays | Bag claim/first-return detail cards, no automatic fee claim, selected-day count and selection highlight. |
| Earnings was only raw rows | Pending/approved/paid totals plus existing server-provided breakdowns; no invented approved funds. |
| Management lacked at-a-glance overview | Active-order, payment-hold, contractor-review counts alongside existing authorized users/orders/audit and owner-only test codes. |

### Remaining product gaps requiring backend/integration work

- Real persistent signup/profile/recovery, contractor onboarding and legal approval, secure identity-document review, SMS/code expiry, physical station rotation/presence assurance, extra-bag purchases and home collection remain incomplete. UI does not pretend these are active.
- Square payment confirmation, paid-ready pickup and rating depend on disabled payment integration. No client-side paid switch was added. Payout/late-fee execution remains disabled.
- No actual iPhone/Android camera or assistive-technology validation performed; native QR scanning remains capability-detected with manual fallback.
- These changes were tested locally, not verified at provider edge or deployed URL. Lead owns source review/deployment decision.

### Files, verification and rollback

Changed only `web/app.mjs`, `web/style.css`, `tests/browser.mjs` and contributor/central documentation. Authentication/private-gate/session/API security code untouched. `/api/dashboard` was added independently by the backend contributor and is consumed read-only here. No new dependencies, third-party assets, provider connections, expenses or real sensitive data.

`node --check web/app.mjs` passed. The existing isolated Chromium mobile custody browser workflow was rerun after UI changes, including wrong QR recovery, 12.1→12.5 lb, later return, reload persistence and management authorization. Tests now navigate Offers before acceptance and explicit bag→station/weight steps. Lead/test contributor adds independent product layout/guide checks. Dashboard screenshots generated under ignored `test-results/` and visually reviewed at 390px wide. Review initially found tabs clipped by sign-out; moved sign-out to header and sized fixed tabs to phone width. A dashboard response wrapper mismatch was found by source inspection and corrected before readiness reporting.

Rollback: revert this UI patch and the matching browser-navigation edits; backend schema/security/state are unchanged by this contributor.
