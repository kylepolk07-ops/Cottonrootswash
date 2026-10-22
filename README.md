# Cotton Roots & Co. — private synthetic staging

Two separate mobile web interfaces share an authenticated Node 24 backend, protected Management workspace, and a persistent SQLite pilot database. This remains a private test product, not a public production service. Use synthetic data only.

## Run

```sh
cd /workspace/Cottonrootswash
npm ci --ignore-scripts
npm test
npm start
```

The server binds only to loopback port 3000. Open the Customer path `/customer` or Contractor path `/contractor` through an authorized local development connection. The onboarding interface does not provide a phone-accessible preview. No hosted staging URL has been deployed.

On first local startup random fixture credentials and test QR tokens are written to `.runtime/fixtures.json` with private file permissions. Read this file locally; never commit or share it. Accounts are `customer`, `customer2`, `contractor`, `contractor2`, and `owner`. Management is a separate owner workspace reached after signing in through the Contractor URL. There is no default shared password. Restarting preserves accounts/orders but requires signing in again.

## Private remote staging preparation

Railway deployment configuration and a password gate are now prepared. See `docs/RAILWAY_STAGING.md`. No provider account is connected and no hosted URL exists yet. Remote mode requires HTTPS, persistent `/data`, one replica and random private gate credentials; it fails closed if configuration is incomplete. Local commands below continue to bind to loopback.

## Private phone pilot

The owner upgraded `https://cotton-roots-private-trial.onrender.com` and attached a persistent disk at `/var/data`. The checked-in `render.yaml` now matches that single-instance Starter pilot. Persistent mode requires a private gate password of at least 24 characters; each Customer, Contractor, and owner also has a separate login. See `docs/RENDER_PERSISTENT_PILOT.md`. The database persists on Render's disk, but there is no off-host backup yet, so use synthetic pilot records only.

A noninteractive phone-readable PDF of actual tested screens is available in the task artifacts. Recreate with the scripts in `docs/PHONE_WALKTHROUGH_REPORT.md`. It is a visual walkthrough, not a live app.

## Try the workflow

1. Management: Bag inventory → add each physical bag → open **Show / print QR** and attach that unique label.
2. Customer: My bags → scan the unique bag QR. Acknowledge taking the bag and physically closing the box. The acknowledgment does not verify a physical lock.
3. New order → Drop off → detergent → review. Drop off using the matching bag and shop station QR.
4. Contractor: save today's availability and wash/fold or both preference. Accept the offer and acknowledge its displayed test deadline.
5. Scan bag, record measured weight, scan station to check out. Complete laundering, scan bag on return, and scan station to check in.
6. Stripe Checkout remains sandbox-only. Contractor amounts remain a non-paying test ledger. Live payment, payout, identity uploads, public signup, and home collection remain disabled.

Manual token entry works when camera scanning is unavailable. The owner has confirmed one phone camera path; broader iPhone/Android testing remains outstanding.

## Validation and review

`npm test` runs rules, workflow, API/security, persistence and payment-adapter tests. `npm run check` checks server syntax. See `docs/WORK_LOG.md`, `docs/SECURITY_REVIEW.md`, and `docs/OUTSTANDING_ITEMS.md` for tested scope and remaining release gates. Browser checks use an optional externally installed Playwright; their run instructions are in `tests/browser.mjs` when available. CI covers the dependency-free server/unit suite, not real devices.

The supplied SQL migration is a draft managed-Postgres design, **not applied by this SQLite staging backend**. SQLite serializes each local mutation and persists its idempotent response and audit entry atomically in one row. This is suitable only for a small single-process synthetic test; managed database permissions, scaling, encryption, retention and independent security review are launch blockers.

## Reset and rollback

Stop only this app's process before resetting. Preserve `.runtime` in a private backup if needed, then move it outside the checkout and restart to generate fresh fixtures. Never perform a reset on real user data. Restore a private `.runtime` backup with the server stopped; accounts and sessions must be revalidated. Source changes are reviewable in Git; use a reviewed revert for rollback. Do not publish the app or enable financial/document features without owner approval.
