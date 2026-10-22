# Development work log
All contributions and sub-agent activity must be reported here before integration or deployment.

## 2026-10-22 — remembered account type and session reopening

Lead `/root` added a device-local Customer/Contractor preference. After the first choice, opening the main URL routes that browser directly to the selected app; a visible **Change account type** link clears the preference and returns to the chooser. This preference grants no access and does not replace authentication. Existing secure sessions now have explicit browser coverage proving that a page reload restores the signed-in account. Face ID/passkeys remain unimplemented pending a dedicated credential-enrollment and recovery design. The reported logo sizing issue disappeared after reopening, so no image-size change was made. Validation: syntax checks passed, all 48 server/security tests passed, and the mobile Chromium product workflow passed with the new chooser, reset, and session-reload assertions.

## 2026-10-22 — printable shop drop-off QR

Lead `/root` added the missing synthetic station QR to **Management → Pilot tools**, clearly separated from the sample bag QR. The image encodes only the existing private station token, is owner-only, disables caching, and remains behind staging authentication. Added an adversarial test covering outer-gate denial, account authentication, customer/contractor denial, exact station-token encoding, and separation from the bag token. This is private pilot material; no production station or public launch was activated.

## 2026-10-22 — Management order, complaint, and deadline workspaces

Lead `/root` added separate Management areas for orders ready for pickup and completed orders, customer complaints, and deadline alerts. Deadline warnings begin six hours before the promised return time and switch to elapsed hours/minutes late after the deadline; returned and terminal orders are excluded. Customers can report an order problem using a constrained topic and 10–1000 character message, with a warning not to submit payment or identity data. Reports are ownership-scoped, persisted, visible to Management, and can be resolved or reopened only by Management. Review contributors `/root/mgmt_dashboard_review` and `/root/complaint_alert_tests` made no source edits and centrally reported status definitions, secure complaint-model requirements, time-boundary cases, and authorization risks; lead incorporated and reviewed their recommendations.

Contractor Home and My Jobs now show in-app deadline reminders beginning six hours before the due time, with more urgent three-hour and one-hour states and an elapsed late time after the deadline. The reminder is limited to that contractor's accepted active work and updates on app open/refresh. External SMS and phone push notifications remain unconnected because they require contractor opt-in and an approved notification provider.

## 2026-10-22 — camera-only QR capture

Lead `/root` removed the visible QR-token typing fields from bag and shop-station custody steps. Entering a scan step now immediately requests the rear-facing phone camera, shows a captured confirmation, stops the camera after capture, and provides a camera-permission retry when access is blocked. The underlying token remains hidden and is still validated by the authenticated server against the exact bag owner and station. Browser automation injects synthetic tokens only into hidden scan controls and asserts that no visible token field exists; this does not create a user-facing manual entry route.

## 2026-10-22 — simplified contractor approval

Lead `/root` separated contractor approval from account editing. The contractor table now shows Name, Phone, Approval, Bag, and Account explicitly. **Review for approval** opens a read-only review screen, so Management does not have to edit the contractor's name or phone. Approval still requires the owner to confirm the phone conversation and in-person shop meeting. Password resets, contact corrections, pause, and deletion remain under the separately labeled **Account options** control.

| Date/time | Agent/contributor | Scope | Changes/commit | Tests and evidence | Risk/blocker | Owner approval needed | Reviewer |
|---|---|---|---|---|---|---|---|
| 2026-10-21 | ChatGPT (this chat) | Planning | Added mandatory security and reporting policy | Policy document created; implementation not audited | Live backend and staging pending | See OWNER_APPROVALS.md | Not yet reviewed |

## Current turn — workflow safeguards
- Added `shared/workflow.mjs`, a pure state transition model requiring bag ownership + wall verification at drop-off; initial contractor approval and deadline acknowledgment; measured pounds before contractor wall checkout; wash completion, bag-return and wall check-in; verified Square webhook before payment hold; staff release; exact owner/bag match for pickup.
- Added `tests/workflow.test.mjs` including failure-case tests for skipped steps, incorrect identities, unverified payment and duplicate pickup.
- Validation: `node --test tests/*.test.mjs` — 8 tests passed, 0 failures.
- **Not a deployed backend:** these pure functions must be called from authenticated, transactional server endpoints and mirrored by database constraints/RLS. UI files remain references. No accounts accessed, money moved, or production deployments performed.

## Implemented private staging — central consolidated record

Task: take over the supplied secure build package; build two interfaces with a shared secure staging backend. User explicitly authorized implementation, testing and delegation; attached instructions were treated as project requirements, subordinate to the user's approval boundaries. The starting Git checkout was empty and unborn, with no existing user changes. Imported package references, rules, tests and draft SQL without modifying their contents. No hidden contributors or deployments.

### Lead `/root`

Created `server/app.mjs`, `server/start.mjs`, package/lockfile, ignore rules, CI definition, updated README, package README archive and this handoff. Backend: random private synthetic accounts, scrypt password hashes, expiring HttpOnly/SameSite sessions, CSRF, loopback Host/Origin restrictions, request limits, role/ownership checks, persistent SQLite mutations/audit/idempotent responses, atomic single-process custody, protected management, availability, bag claim, order and pending earnings APIs. Client context never grants role/payment authority. Host allowlist, private runtime file permissions and session cap/expiry cleanup fixed after independent review. No providers or external accounts connected. No raw secrets added to tracked files.

### Frontend contributor `/root/frontend`

Implemented two entry points and shared CSS/browser assets: cream/sage illustrated guided screens, claim/book/dropoff, contractor availability/acceptance/weigh/checkout/return, pending pay and protected Management. Safe text rendering, manual QR fallback and camera cleanup. Supplied isolated repeatable mobile Chromium browser test. Full scope, files, test evidence and limitations: `docs/FRONTEND_REPORT.md`. Lead reviewed assets and reran browser test successfully.

### Security contributor `/root/security_tests`

Implemented API adversarial tests and threat model, reviewed backend independently, reported/followed up Host/permissions/session findings. Added unconnected Square signature/invoice verification helper and tests. No payment route, real money or provider authorization. Full scope, one corrected Host-header test-harness failure and final passing results: `docs/SECURITY_REVIEW.md`. Lead consolidated all reported changes before source handoff.

### Evidence and limitations

Final lead verification: `npm ci --ignore-scripts`, `npm audit --omit=dev --audit-level=high` (zero vulnerabilities), `npm run check`, `npm test` (13 passed; zero failed/skipped), and `PLAYWRIGHT_MODULE=/workspace/scratch/browser-tests/node_modules/playwright/index.mjs node tests/browser.mjs` (PASS). Repeated automated/UI runs completed. CI not executed remotely. Screenshots retained in ignored test-results. One local development server was started by lead; no external deployment. Playwright was installed outside the checkout from npm; system Chromium used. No real device or live camera test, production security audit, RLS migration or backup restore test was claimed.

Reusable installation and startup instructions saved to environment draft; save does not execute/publish or establish future-task restoration. Outstanding work and owner authorization boundaries are in `docs/OUTSTANDING_ITEMS.md`. Rollback: stop this app, revert reviewed source changes; preserve the private .runtime directory before any reset. No external state or charges to reverse. Source changes remain reviewable locally; no automatic push or public launch.

### Source checkpoint and handoff

Initial source checkpoint: local commit `354ca5a` (not pushed). Clean working tree verified after commit. `git diff --cached --check` reported one trailing-space line in the imported `apps/customer/reference.html`; preserved original reference unchanged and recorded the cosmetic finding. It does not affect served app assets. Created `/workspace/cotton-roots-tested-staging.zip` from tracked source only; excludes runtime credentials/database and browser artifacts. Stopped the initial local server before handoff so future starts use the final reviewed code. Final readiness suite exercises a new server with the current source. No hosted endpoint is running.

## Railway private staging preparation

User selected Railway preparation and asked to start. User subsequently confirmed no Railway account exists. Account signup/authorization and approval of provider-displayed charges remain prerequisites. No Railway connector, CLI login/configuration or token binding was available (checked names/presence only). No provider account, paid resources, public app deployment or financial connection created. Existing Git proxy read access to origin succeeded; no new GitHub token requested.

Lead `/root` changed `server/app.mjs` for an outer constant-time private staging credential check, strict HTTPS proxy/Host/Origin rules, Secure cookies, redacted health route. Added validated remote config, persistent `/data` requirement, single-replica guard, configurable Railway PORT/bind, graceful termination, pinned official Node Docker image and build/run configuration. Bootstrap initializes only volume directory ownership, clears supplementary groups then drops to UID/GID 1000. Added remote/config tests, isolated Docker volume/restart test and Railway operator runbook. Existing local workflow remains loopback. Payments/uploads remain unavailable. No real documents or live money used.

Independent contributor `/root/deployment_review` reported centrally in `docs/DEPLOYMENT_REVIEW.md` and added two review tests. Reported missing supplementary-group clearing; lead fixed and verified actual container UID/GID 1000 with empty groups. Reported potential provider probe Host; exact `healthcheck.railway.app` allowed only for minimal GET /healthz, with app-route denial regression. Actual provider edge remains unverified. Reviewed Basic gate is additional synthetic staging isolation, not production MFA or a penetration-test claim.

Executed verification: frozen install and dependency audit (zero vulnerabilities); 17 automated tests passed, zero failures/skips; expanded syntax checks passed; mobile Chromium workflow passed again. Docker build passed using pinned official Node image/checksum. Isolated container test passed: private mounted-volume startup, unprivileged PID 1, no supplementary groups, gated remote-mode login/Secure cookie, synthetic claim/order preserved across container restart, customer Management denied. No TLS edge or actual Railway volume was exercised.

Diagnosed tooling/test failures transparently: Docker's default config attempted to write a read-only home path, fixed via task-specific DOCKER_CONFIG outside checkout. First container harness used fetch, which ignored custom Host and correctly received app denial; switched harness to native HTTP. Next harness retained an ephemeral Docker host port after restart; Docker changed it, so harness now re-reads assigned port. Final test passed with no application guard weakened. All temporary containers, volumes and private env files were removed by the harness.

Outside connections: npm registry and official Docker Hub Node image for local verification, read-only existing Git origin access. No credential values printed or added to source. Rollback: revert deployment feature, preserve private runtime/volume, stop only this app; no external hosting state to reverse. Railway-specific live TLS/proxy isolation, health probes, real phones, billing controls, backups and account authorization remain outstanding in RAILWAY_STAGING.md.

Source checkpoint `b2cfbbe` successfully pushed to `origin` as `staging/railway-private` using existing platform Git authentication. No force push or default-branch overwrite. Remote deployment was not invoked. GitHub CI result remains unverified. Source and runbook are now available for Railway account authorization; local source ZIP refreshed without runtime credentials.

## Phone testing during confirmed Railway outage

User supplied Railway's platform-outage banner, confirmed the incident and requested another way to test without a computer. Lead initially considered a downloaded HTML demo, then recognized unreliable iPhone local-HTML execution and prepared an accurately labeled phone-readable PDF plus an alternate actual-backend hosting option. No offline demo is represented as live shared-state testing. Railway outage remains external; no user network/security changes requested.

Lead `/root`: added `render.yaml` requesting one free Docker web-service plan (provider eligibility/terms not independently verified), generalized remote configuration to explicit `render` disposable mode, and kept Railway persistence requirements. Render mode requires disposable-data acknowledgment, HTTPS origin, private gate and generated role passwords. Roles initialize from secure provider variables on first bootstrap; only hashes remain in database, and raw private fixture file stays mode0600. No password-reading API. Added owner-only synthetic QR test-kit endpoint and Management fields, protected by private gate + authenticated owner + fixtures mode. Customer/contractor cannot retrieve it; no real physical bags/locks controlled. UI identifies disposable data after login. No real payments or identity uploads enabled. Generated-role passwords now capped at 256 to match existing login limit after independent reviewer identified the edge case. Config regression checks cover oversized values. Secrets were not read from any external account or printed/committed.

Contributor `/root/deployment_review`: independently reviewed Render changes, added `tests/render.test.mjs` (three substantive configuration/injected-auth/QR-kit security tests) and `docs/RENDER_REVIEW.md`; reported password bootstrap length mismatch and one-time initialization semantics. Lead fixed the length mismatch and documented rotation/reset semantics explicitly. See contributor report for all findings and limitations.

Contributor `/root/phone_walkthrough`: generated nine-page phone-proportioned `/workspace/Cotton-Roots-Phone-Walkthrough.pdf` from actual isolated app screens; added reproducible JS/Python generators and central `docs/PHONE_WALKTHROUGH_REPORT.md`. Screenshots show customer booking/dropoff, rejected wrong bag, contractor measured weight/checkout/return, payment pending and Management. Credential guard stopped first capture when newly added synthetic QR fields appeared; generator then omitted that card only in the visual artifact, disclosing omission, and asserted fixture passwords/tokens absent from every screenshot. Final capture passed; PDF clearly says noninteractive/hosted link pending. Lead checked page count/text and visually reviewed cover. No browser mock auth or invented app success used. Artifact contains no real data and no new provider account.

Verification: expanded automated suite 20/20 passed, zero failures/skips; expanded syntax checks passed; actual mobile-size browser workflow rerun passed. Container build passed on pinned official Node image; Render-mode test passed injected credentials, disposable metadata, owner-only synthetic codes, unprivileged process, warm restart persistence, and expected synthetic order reset after container replacement with stable injected sign-in. Railway-mode container regression also verified before final handoff. These local tests do not establish actual Render edge/TLS, plan availability or deployment readiness. All isolated containers/volumes/env files removed. Dependencies unchanged; no paid resources, financial connections, public app launch or identity collection.

Runbook/rollback: `docs/RENDER_TRIAL.md`; retain Railway setup, no cancellation or volume deletion. Revert reviewed alternative-trial commit to remove Render mode; remove visual artifact/scripts separately without database impact. Account signup/authorization is still required for any hosted phone interaction. No new claim of a working remote URL is made. Source will be saved on a separate review branch `staging/phone-trial` using existing Git proxy authorization, preserving `staging/railway-private`.

## Owner cannot pass native private-access prompt

Owner reports repeated login failure at the iPhone in-app browser Basic prompt after instructions; screenshots identify the failing layer. No credential values requested or received, no credential reset or access control bypass. Original cause is unconfirmed because agent cannot inspect the active Render variable values or account and workspace outbound proxy blocks the hosted hostname. Owner's prior screenshot reports service Live on Free at cotton-roots-private-trial.onrender.com, commit dd0a980; this establishes provider deployment status only.

Lead `/root` replaced automatic HTTP Basic challenges with a mobile normal-code form at `/access`; server-side signature-protected challenge, matching __Host-CSRF cookie, strict Origin, request limits, constant-time secret check, bounded one-time challenge/session stores, 20 attempts/minute, safe destination whitelist, 8h Secure/HttpOnly/SameSiteStrict __Host private-session cookie. Normal app pages/assets redirect to form, APIs return 401 with machine-readable private-access code; frontend redirects on gate expiry. Existing explicitly supplied valid Basic credentials still work for operator regression checks, and a stale bad Basic header cannot override a valid gate cookie. No generated passwords returned in responses or embedded in source. The outer code never grants Customer, Contractor or Management account access. No payment, upload, financial or public registration scope changed.

Independent contributor `/root/deployment_review` added tests/private-access.test.mjs, updated old redirect/challenge assertions to the intentional form behavior, and reported centrally in docs/ACCESS_REVIEW.md. Initially reported unauthenticated GET nonce-map allocation could exhaust1000 slots; lead replaced that allocation with stateless HMAC-signed expiring challenges and bounded consumed-POST tracking. Tests cover1050 GETs retaining a valid earlier form, forged signatures and matching forged cookie/form, replay, expiry, cross-process challenge keys, strict origin/host, CSRF, bad code, cookie flags, role separation, stale Basic, request size/rate. Shared proxy-IP quotas remain a small synthetic-trial limit; no production robustness claim.

Browser validation was not assumed: lead initially overstated browser results in commentary, then immediately corrected the claim. Two first harness attempts to intercept a synthetic external HTTPS origin hit workspace network restrictions. An HTTP loopback gateway could not validate Secure __Host-cookie browser behavior. Final browser harness uses an isolated localhost TLS certificate trusted only by exact ephemeral public-key pin in that test Chromium instance, with simulated provider Host/proxy/Origin. No global trust settings or third-party TLS verification changed. The real browser test caught no-referrer making form Origin null; access HTML now uses same-origin Referrer-Policy while API checks remain strict. It also caught favicon redirect issuing a replacement CSRF cookie; favicon now returns204 and valid GET form challenges are reused across tabs. These were fixed before pushing. Final mobile-size browser run passed wrong-code feedback/recovery, secure private cookie, contractor destination, separate customer login, reload and Management denial. Not an actual iPhone or deployed-provider TLS verification.

Tests and browser harness cleanup remove isolated fixtures, certificates and cookies. Root additionally updates access instructions and expanded syntax check. Rollback: revert this reviewed staging feature while preserving any synthetic test notes; no secrets or provider resources changed. Owner will open /access after Render reports new commit Live, use the existing private code value, then separately sign into app. Active code correctness and actual owner phone sign-in still require owner-side verification. Source update is authorized staging bugfix, not public launch; no costs activated.

Additional full-flow failure was diagnosed before push: at UTC00:21 while Texas remained on the prior evening, server job acceptance used UTC today's date while the UI saved today's local shop date, so the browser could not proceed to weighing. Added shared/calendar.mjs with canonical America/Chicago shop-date and DST-safe 14-day sequence; both server acceptance and browser availability use it. Added deterministic UTC-midnight/local-midnight/winter/DST tests; API fixtures now use shop-day keys. No deadline promises or fees were changed. Full local browser custody workflow passed after correction. This is separate from the unconfirmed original native-prompt failure.

Final evidence for this update: npm test29/29 passed, zero failed/skipped; npm run check passed; existing mobile-size full custody browser test passed; private-code TLS-loopback browser test passed; pinned Docker build and Render disposable container checks passed. Failed harness attempts and the fixed timezone failure remain documented rather than represented as successful runs. Original native-prompt credential/browser cause and actual owner iPhone login are still unverified. Source updates prepared for staging/phone-trial; actual deployment progress must be checked in Render.
# 2026-10-21 — Disposable trial sign-in repair

- Allowed the private Render access code to authenticate the synthetic Customer and Contractor fixtures after the outer private gate.
- Kept owner/Management on its separate password and limited the convenience path to disposable staging.
- Updated the login instructions and added regression coverage for both allowed trial roles and denied owner access.

# 2026-10-21 — Shorter disposable access code

- Added a six-digit numeric PIN option for disposable Render testing, while accepting the existing generated long value during migration so deployment cannot lock out the owner. The access form remains rate limited and the shortcut remains unavailable to Management or persistent staging.
- The same code remains limited to Customer and Contractor; owner/Management passwords retain the 24-character minimum.

# 2026-10-21 — Phone link QR

- Added a scannable QR for the private Render trial URL. It contains only the stable `/access` web address and never contains the private PIN or any account credential.

# 2026-10-21 — Backend product depth

- Contributor `/root/backend_product` added role-scoped dashboard summaries for the richer Customer, Contractor and Management experiences without exposing cross-account data.
- Replaced the guessed three-day booking deadline with the build brief's Texas weekday/2 PM schedule, set only after verified shop drop-off. Added schedule, DST and API authorization tests.
- Payment, payout, identity, home collection, holidays and notifications remain explicitly unconnected. Evidence and limits are in `docs/BACKEND_PRODUCT_REPORT.md`.

# 2026-10-21 — Independent product experience coverage

- Added a separate mobile Chromium check for the richer Customer dashboard, pictogram service choices, custody timeline, Contractor Today screen, distinct Offers/My jobs screens, pay summaries, and complete eight-step work guide.
- The check also rejects undersized visible buttons, unlabeled visible form controls, horizontal mobile overflow, and uncaught browser errors.
- It uses temporary synthetic fixtures and leaves the full custody/security flow in the existing browser suite. Actual iOS, Android, camera, and screen-reader testing remain outstanding.

# 2026-10-21 — Independent security follow-up

- `/root/security_followup` reviewed the shared disposable test-code shortcut and richer interface work for role escalation, private-gate bypass, unsafe HTML rendering, and accidental payment/identity enablement.
- Added two focused HTTP tests proving the shortcut is gated, limited to exact Customer/Contractor fixtures in disposable mode, denied for owner/Management, and disabled for persistent staging.
- Confirmed the completed richer frontend renders API values through text nodes and did not copy prototype `localStorage`, demo auth, or client payment flags. No payment-confirmation or identity-upload route was enabled.
- Flagged excess Contractor dashboard disclosure during concurrent review; the backend contributor removed `customer_id` and detergent from that summary and added a regression check. Final server suite: 35/35 passed plus syntax checks.

## 2026-10-22 — Reference-driven mobile product UI pass

Contributor `/root/frontend`, assigned by lead `/root`, reviewed current served source against the imported Customer/Contractor visual references and BUILD_BRIEF. Concrete gap list and implementation/limits are centralized in `docs/FRONTEND_REPORT.md` (2026-10-22 addendum). No hosted-provider inspection claim.

Changed `web/app.mjs`, `web/style.css`, and matching `tests/browser.mjs` navigation. Added default Home/Today dashboards with backend-authorized counts, illustrated large choice tiles, reference-style fixed bottom navigation, distinct Offers/My jobs, eight-step illustrated SOP, sequential bag→station and bag→weight confirmation screens, slider/numeric/live-rounded weight, custody timeline, pricing/detergent/rush details, booking review, bag/availability summaries, earnings totals and Management overview. Owner/staff normal landing stays protected Management. No browser storage authorization, payment bypass, identity upload or client-certified paid state added. Original references and server auth/security untouched.

Verified syntax and repeatedly ran isolated mobile Chromium full custody workflow; after changed screen sequence it passed wrong-QR recovery, bag claim/booking/dropoff, availability/deadline acceptance, weight rounding, checkout/wash/later return, pending earnings, reload state and server Management denial. Independently generated Home/Today screenshots using synthetic fixtures and reviewed phone layout; corrected clipped bottom tabs and read-only dashboard wrapper handling. Product test contributor `/root/test_expansion` is notified of all route/label changes and reports separately. Real devices, physical scanning, assistive technology, provider deployment and payment-dependent pickup remain unverified. No third-party connections/dependencies/costs or actual sensitive data. Rollback: revert UI/test-navigation changes; no backend state/schema change from this contributor.

## 2026-10-21 — Paired owner-advocate and mobile usability review

- `/root/owner_advocate` and `/root/mobile_pair` challenged the richer interface against the owner's requirement for a modern, simple, illustrated, step-by-step product.
- Agreed fixes cover forgiving sign-in, plain status labels, one-choice booking, one-task-first wizards, action-specific next-step confirmations, icon-assisted bottom navigation, focused feedback, readable disabled choices, 44px interactive targets, and 320px narrow-screen layout.
- The requested preview QR is explicitly URL-only and never contains or bypasses the requested six-digit PIN. Actual PIN security is validated separately before any completion claim.
- Full findings and remaining real-device limits are in `docs/MOBILE_USABILITY_REPORT.md`.

# 2026-10-21 — Owner advocate and paired mobile review

- A dedicated owner advocate compared the rebuilt app with the supplied reference prototypes and rejected technical copy, blank/case-sensitive trial usernames, raw backend statuses, duplicate service controls, detail-first wizards, generic success messages, and text-only cramped navigation.
- Paired with the mobile usability reviewer before editing. Product language/flow changes are in `web/app.mjs`; mobile touch, focus, navigation and narrow-screen changes are in `web/style.css` and the independent product browser test.
- `npm run check` and the product experience browser suite passed. The review requires the disposable six-digit PIN to be exactly numeric and the shareable QR to contain only the HTTPS access URL; Management retains its separate strong password.
- Full rationale and remaining real-device limit: `docs/OWNER_ADVOCATE_REPORT.md`.

# 2026-10-21 — Stripe test-mode groundwork

- Added test-only Stripe configuration, hosted Checkout request construction, raw webhook signature verification and strict completed-session reconciliation.
- Wired customer-owned hosted test Checkout and exact raw-body `/api/payments/stripe/webhook`; session/event idempotency is persisted with the synthetic order. Live keys fail closed and unconfigured staging retains payment-pending behavior.
- Added a clearly labeled configurable test payment-cost estimate. It does not alter advertised laundry rates or represent an approved live surcharge. No real payment, banking or identity collection was enabled.
- Kept the existing Square helper unchanged for reviewable rollback; see `docs/STRIPE_TEST_MODE.md`.

# 2026-10-21 — Owner-displayed synthetic bag QR security review

- Added independent coverage for the owner-only synthetic bag QR used to practice the first-bag claim from a phone while the QR is displayed on the computer.
- Verified the endpoint stays behind both private access and owner authentication, is unavailable to Customer/Contractor, encodes exactly the existing synthetic bag token, returns no-store/nosniff SVG, and includes no unrelated fixture credentials or identity data.
- Full server suite passed 42/42. The QR is synthetic staging only; scanning is an authenticated acknowledgment rather than proof of physical custody or lock state.
# 2026-10-22 — Bag registration and protected box access

Added an owner-only synthetic bag QR for staging and a mobile Customer flow that retrieves the reusable physical box code, scans the unique QR attached to the selected bag, confirms the box was closed, and registers that bag to the signed-in customer. The physical code is supplied only through `CRC_BOX_LOCK_CODE`; its value is absent from source, QR contents, read APIs, Management output, and audit details. Camera monitoring remains an external physical control. Automated checks cover private-gate enforcement, roles, non-disclosure, idempotency, exact QR contents, missing configuration, and invalid code formats. `npm run check` and all 44 automated tests passed.

Added a self-hosted QR decoder fallback for iPhone browsers that do not implement `BarcodeDetector`. Scan fields now show an explicit **Open camera** action whenever camera access is available, prefer the rear camera, stop all camera tracks after capture/cancel, and retain manual entry when camera permission is unavailable. The decoder is served from the pinned npm package under the existing private gate and same-origin content policy. Syntax checks and all 44 automated tests passed; an actual iPhone camera test remains required.

Prepared an optional Render persistent-pilot configuration after the account owner upgraded the existing web-service tier. The service stays disposable unless both `CRC_DATA_DIR` and `RENDER_DISK_MOUNT_PATH` explicitly equal `/var/data`. Persistent mode rejects the six-digit preview PIN and requires a 24-character private gate credential, preventing the disposable convenience login from silently carrying into saved storage. No disk, secrets, billing action, public launch, live payment, or actual customer data was created by this change. Operator steps are in `RENDER_PERSISTENT_PILOT.md`.

Added owner-only pilot-account creation in Management for private process testing. The owner may create unique Customer or Contractor usernames with a 12–256 character temporary password; it is returned only in the successful creation response, while stored records retain only a password hash. Management lists and audit output do not disclose the password. Contractors begin unapproved and require owner approval before accepting work. Automated authorization, login, and non-disclosure coverage was added; the full suite passed.

Started account and bag-life-cycle management for the private pilot. Customers and contractors can save contact details in their Profile screen; owners can deactivate or reset a pilot account through protected Management APIs; customers can request a worn-bag exchange; and Management APIs can create inventory bags and retire/replace an assigned bag while retaining the replacement history. Payment card details remain excluded from application state and will stay in Stripe. Full Management screens for inventory and account editing remain the next interface slice.

Separated owner Management from the Contractor navigation. Management now opens as its own illustrated hub with Customers, Contractors, Bag Inventory, Money, and Pilot Tools workspaces. Customer and contractor account tables are separate; the Money view is an explicitly non-paying test ledger. Added a versioned first-sign-in pilot agreement gate for newly created Customer and Contractor accounts. All required conditions must be checked; the server blocks operational APIs until acceptance and records the version and timestamp. Added green-and-gold Cotton Roots header branding. Legal language remains a pilot draft requiring Texas review, and no live payout or card storage was enabled.

## 2026-10-22 — Multi-agent pilot-readiness review

Five focused reviewers audited security, Management usability, end-to-end workflows, deployment persistence, and payment/contractor boundaries, reporting centrally to the lead. The review found and the lead fixed immediate pilot blockers: every active inventory bag now has an owner-only printable QR; retired bag tokens cannot be reclaimed; active orders block bag exchange; pausing or resetting an account revokes its sessions; agreement acceptance records the exact role-specific conditions; temporary passwords and the reusable box code are no longer copied into persistent idempotency results; repeat Stripe test checkouts are blocked; and all requests are serialized around the single pilot state document to prevent asynchronous rollback from erasing concurrent work. The Render Blueprint now declares the actual Starter disk at `/var/data`, and the private gate no longer incorrectly requests a six-digit PIN in persistent mode.

Validation: frozen dependency install, syntax checks, 46/46 server tests, the full mobile custody browser suite, and the independent mobile product suite all passed. The Management browser check now opens Customers, Contractors, Bag Inventory, Money, and Pilot Tools separately. Remaining release gates include off-host backup/restore, managed authentication/MFA, full legal agreements, durable accounting/payout records, Stripe Connect financial onboarding, rotating physical-station proof, and broader real-device testing. No live payments, payouts, public launch, or identity-document collection was enabled.

Management can now delete an unused Customer or Contractor test account from its Edit screen. Accounts with an assigned bag or any order/job history cannot be deleted because that would break the custody and financial record; Management directs the owner to pause those accounts instead. Deletion revokes active sessions and is covered by API regression tests.

Management bag inventory now produces a print-ready 3.5 × 2.25 inch tag for every active bag. Each tag contains the unique registration QR, a large bag ID, cut border, and write-in fields for name/initials, phone last four digits, and short notes. Full address and full phone number are intentionally omitted from the visible physical tag. The raw owner-only QR endpoint remains available for automated verification.

Customer accounts are active automatically after successful account setup and required agreement acceptance. Only contractors require owner review. Management labels them Pending review until the owner records both a phone conversation and an in-person shop meeting; the server rejects approval unless both confirmations are supplied and records the approval time and owner.

The main Management navigation action now always resets the selected Management workspace to Home, so an owner can leave Customers, Contractors, Bags, Money, or Pilot Tools without refreshing the browser. The existing in-workspace Management Home control remains available and is covered by the mobile browser flow.

Added a transparent forest-green and antique-gold Cotton Roots basket/cotton brand mark to both served apps, with accessible alternate text and a compact mobile header treatment. Refined the private pilot's backgrounds, cards, choices, buttons, inputs, status strip, statistics, and Management tables for a consistent modern boutique presentation while preserving the large step-by-step controls.

The root app now opens with an illustrated Customer-or-Contractor chooser instead of assuming Customer. Each choice has a large touch target plus an accessible information disclosure explaining the account and contractor approval process. The private gate defaults to this chooser. Individual app headers emphasize the larger Cotton Roots & Co. identity without repeating the selected role as a large heading.

The physical bag tag now states that its unique QR is used to register the bag and to check it in and out, matching the custody workflow.

API requests now retry one time with the same idempotency key when Render returns a temporary 502, 503, or 504 HTML response during a service restart. If the restart continues, the app gives a specific wait-and-retry message instead of the vague “service did not respond” error. This protects first-login agreement acceptance and other safe idempotent actions during deployment transitions.

At the owner's request, persistent Render staging now uses individual account login only. The extra shared private access-code screen is disabled through `CRC_ACCOUNT_LOGIN_ONLY=1`; the Customer/Contractor chooser and login forms are directly reachable, while every application API and Management resource still requires an authenticated role session. Account-login-only mode is rejected on disposable Render storage.
