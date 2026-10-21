# Cotton Roots & Co. — private synthetic staging

Two separate mobile web interfaces share an authenticated Node 24 backend and a persistent SQLite staging database. This is a local test product, not a public deployment or production service. Use synthetic data only.

## Run

```sh
cd /workspace/Cottonrootswash
npm ci --ignore-scripts
npm test
npm start
```

The server binds only to loopback port 3000. Open the Customer path `/customer` or Contractor path `/contractor` through an authorized local development connection. The onboarding interface does not provide a phone-accessible preview. No hosted staging URL has been deployed.

On first startup random fixture credentials and test QR tokens are written to `.runtime/fixtures.json` with private file permissions. Read this file locally; never commit or share it. Accounts are `customer`, `customer2`, `contractor`, `contractor2`, and `owner`. Management is on the Contractor app after signing in as `owner`. There is no default shared password. Restarting preserves accounts/orders but requires signing in again.

## Private remote staging preparation

Railway deployment configuration and a password gate are now prepared. See `docs/RAILWAY_STAGING.md`. No provider account is connected and no hosted URL exists yet. Remote mode requires HTTPS, persistent `/data`, one replica and random private gate credentials; it fails closed if configuration is incomplete. Local commands below continue to bind to loopback.

## Phone testing during a hosting outage

Render fallback configuration is in `render.yaml` on `staging/phone-trial`; see `docs/RENDER_TRIAL.md`. It requests a free disposable synthetic trial and still needs owner account authorization/current-plan review. Data may reset. Generated private role passwords remove the need for shell access. Owner Management supplies sample bag/station codes for the phone workflow; passwords are never returned by the API. No Render deployment has been created or verified.

A noninteractive phone-readable PDF of actual tested screens is available in the task artifacts. Recreate with the scripts in `docs/PHONE_WALKTHROUGH_REPORT.md`. It is a visual walkthrough, not a live app.

## Try the workflow

1. Customer: My bags → claim the synthetic bag using `bagToken` from the private fixture file. Acknowledge taking the bag and physically closing the box. The acknowledgment does not verify a physical lock.
2. New order → Drop off → detergent → review. Drop off using the matching bag and `stationToken`. Tokens stand in for physical QR codes in this private test.
3. Contractor: save today's availability and wash/fold or both preference. Accept the offer and acknowledge its displayed **synthetic test deadline**.
4. Scan bag, record measured weight, scan station to check out. Complete laundering, scan bag on return, and scan station to check in. Customer sees updated weight/status after refresh.
5. Order remains **payment pending** and earnings pending. Payment, payout, home collection, identity uploads, SMS, signup/recovery and live checkout are deliberately unavailable. Nothing can self-mark an order paid. Domain tests exercise paid/released/pickup/rating conditions, but the local UI does not fake a payment provider.
6. Owner: Management → inspect users, orders, and server audit. Production MFA and managed authentication are outstanding.

Manual token entry works when camera scanning is unavailable. Browser QR detection is device-dependent; real iPhone/Android camera tests remain outstanding.

## Validation and review

`npm test` runs rules, workflow, API/security, persistence and payment-adapter tests. `npm run check` checks server syntax. See `docs/WORK_LOG.md`, `docs/SECURITY_REVIEW.md`, and `docs/OUTSTANDING_ITEMS.md` for tested scope and remaining release gates. Browser checks use an optional externally installed Playwright; their run instructions are in `tests/browser.mjs` when available. CI covers the dependency-free server/unit suite, not real devices.

The supplied SQL migration is a draft managed-Postgres design, **not applied by this SQLite staging backend**. SQLite serializes each local mutation and persists its idempotent response and audit entry atomically in one row. This is suitable only for a small single-process synthetic test; managed database permissions, scaling, encryption, retention and independent security review are launch blockers.

## Reset and rollback

Stop only this app's process before resetting. Preserve `.runtime` in a private backup if needed, then move it outside the checkout and restart to generate fresh fixtures. Never perform a reset on real user data. Restore a private `.runtime` backup with the server stopped; accounts and sessions must be revalidated. Source changes are reviewable in Git; use a reviewed revert for rollback. Do not publish the app or enable financial/document features without owner approval.
