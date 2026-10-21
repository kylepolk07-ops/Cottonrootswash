# Outstanding items and handoff

## Available now

Private single-process synthetic staging: separate Customer and Contractor mobile interfaces, Management gated by server role, shared authenticated API, private fixture accounts, SQLite persistence, CSRF and origin checks, custody rules, rounded weights, idempotency, audit, pending earnings, manual QR fallback. See README for test instructions. Source is saved on GitHub branch `staging/railway-private`; no public app deployment or provider account connection occurred.

## Verified

- 17 automated tests passed, no failed/skipped tests in the final run: business rules, custody, authorization, spoofed payment rejection, signed payment helper, idempotency, competing acceptance, restart persistence, request limits, Host/Origin, login throttling, runtime permissions, and audit redaction.
- Headless Chromium phone-size full workflow passed repeatedly, including final lead rerun; no browser exceptions. Screenshots in ignored test-results/. Real device/camera behavior is untested.
- Frozen install, server syntax and dependency audit passed. Runtime app has zero third-party dependencies; audit reported zero vulnerabilities. This is not a penetration test or blanket security assurance.
- CI definition is included; its remote run result has not been verified. Source is pushed on `staging/railway-private`. Managed Postgres migration has not been applied.

## Needed to try on a phone remotely

An authorized private staging host/account and deployment access. No connected hosting tool or verified destination is available. Remote-mode HTTPS origin checks, Secure cookies, private access gate, container packaging and volume requirements are now implemented and locally tested. The actual Railway account/edge/domain/volume still must be authorized and tested; see RAILWAY_STAGING.md. Owner may connect the intended provider securely; never paste credentials into chat. No purchase or public launch is authorized.

## Remaining implementation

- Managed verified signup, email verification/recovery, owner MFA and least-privilege staff roles; currently synthetic fixtures only.
- Managed backend deployment, migration/RLS tests, secret storage, encrypted backups, actual backup/restore exercise, retention, tamper-resistant audit and monitoring. Local SQLite mutation persistence is tested; backup recovery is not.
- Real business due-date calendar/holidays and location time rules; current due dates are explicitly synthetic. First bag 24h deadline is recorded; charges remain disabled.
- Rotating station/box access tokens, SMS consent/access codes, real bag provisioning, offline retry queue and multi-device physical custody checks. Station token knowledge does not prove location.
- Contractor application, legally reviewed agreement, onboarding checklist, eligibility scheduling; private synthetic contractors are preapproved.
- Pickup/wash/return routing; frontend displays unavailable and backend blocks full-service booking.
- Square sandbox hosted checkout and authenticated webhook integration, durable payment/event uniqueness, refunds/chargebacks, invoice reconciliation, payout ledger and one-week arrears scheduling. Signature/reconciliation helper is tested but intentionally unconnected. Payment-pending orders cannot proceed through live UI pickup; paid pickup/rating gates are covered by domain tests only.
- Protected uploads, malware scanning, access/retention review and legal approval before any real identity/tax documents. Upload endpoints remain unavailable.
- Actual iPhone/Android camera tests, accessibility audit, second independent production review, incident/rollback exercises and legal/payment/launch approval.

## Owner decisions

Only staging account authorization is needed to proceed toward a phone-accessible private test. Financial authorization, production launch and real identity collection remain separately approval-gated. No credentials are requested in chat. There is no automatic overnight work scheduler: progress happens while an agent turn is active; saved code and reports persist between turns.

## Railway preparation update

Owner chose Railway preparation and reports no account yet. No paid resources created. Private deployment files and runbook are prepared; account signup/authorization remains the external prerequisite. Container build, volume/restart checks and 17-test suite passed locally; evidence and independent review are recorded in WORK_LOG.md and DEPLOYMENT_REVIEW.md.
