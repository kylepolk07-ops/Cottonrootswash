# Development work log
All contributions and sub-agent activity must be reported here before integration or deployment.

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
