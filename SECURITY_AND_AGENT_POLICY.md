# Mandatory security, agent accountability and change-control policy

Applies to every human contributor, AI coding agent, sub-agent, deployment workflow and integration used on Cotton Roots. No agent may silently delegate work outside an authorized, logged workflow or conceal changes, failed tests, vulnerabilities, expenses, access requests or incomplete tasks.

## Single reporting channel
- Project lead maintains `docs/WORK_LOG.md`. Each agent reports identity/role, assigned scope, files changed, commands/tests run and results, risks and limitations, outside connections used, and pending decisions. A subordinate agent reports to the lead before merge. Unreported work must not ship.
- Every change uses a versioned source-control commit or equivalent reviewable diff, linked to a task, with author, reviewer, rationale, tests and rollback instructions.
- No agent shall claim to have tested, deployed, verified security, accessed an account or finished work unless supported by reproducible evidence. Escalate failures and suspicious behavior immediately. Don't put credentials, tax IDs or private user data in agent chats, logs or commits.
- Owner can inspect status, change history and unresolved blockers. Do not imply unseen/background agents are actually running unless orchestration has been explicitly started by the authorized tool/workflow.

## Security gates (release blockers)
- Threat model and data-flow diagram: customer, contractor, staff, owner, third parties; enumerate sensitive data, custody, QR and payments.
- Strong authentication, verified account recovery, management MFA, least-privilege server-side role enforcement and row-level authorization, deny by default. Separate test/production environments and accounts. Never use UI hiding/localStorage as authorization.
- Harden public APIs: input validation, output escaping, CSRF protection when applicable, secure sessions/cookies, CORS restrictions, rate limits, request size limits, safe upload allowlist/content sniffing/malware scanning, no public W-9/DL URL access, documented retention/deletion policy.
- HTTPS, modern security headers, encrypted data at rest in managed services, secrets manager, key rotation, least privilege for integration credentials. Never store raw payment card data.
- Bag and wall QR: opaque unguessable identifiers/tokens, authenticated account-to-bag ownership and allowed state transitions, server-generated scan timestamps; replay/duplicate detection, no personal information in QR; a static wall QR alone is not proof of physical presence. Consider rotating or additional on-site verification if location assurance is needed.
- Payment: Square-hosted/tokenized flow, server-verified signed webhooks, idempotent payment events, reconcile amounts and order IDs. No pickup release or contractor 'approved earnings' from client-side paid flags. Restrict refund/void/adjustment actions, log them.
- State machine and transactions for claim/dropoff/contractor checkout/return/payment/pickup; prevent wrong-bag pickup, paid-ready bypass, double checkout and concurrent conflicting custody updates. Deadline/late fee actions are review-only until legal/owner authorization.
- Monitoring: tamper-resistant audit trail with actor, timestamp, prior/new status, reason and request ID for custody, weight, payment, payout, onboarding and administrative actions. Backup/restore tests, alerting, incident response, disaster recovery and documented rollback.
- Dependencies: lockfiles, automated lint/typecheck/unit/integration/e2e tests, dependency and secret scans, migrations reviewed and reversible, branch protection, staging verification on different devices/accounts. Periodic penetration test/security review before handling real DL/W-9 or payment-linked accounts.

## Release and authority boundaries
- Build locally and deploy staging using fake, non-sensitive fixtures first. No sharing real credentials with AI or committing them. Use provider auth/secret injection where possible.
- Owner approval required before public launch, paid subscriptions/purchases, connections to financial services or processing real money, collection of actual sensitive identity/tax documents, and legal agreement activation. Human legal review of independent contractor classifications, releases, penalties and payout terms.
- Security-critical changes need a second review; break-glass access logged, time-limited and reviewed. If a control is unavailable, stop that sensitive feature instead of weakening the gate silently.

## Minimum acceptance scenarios
- Unauthenticated/customer/other-contractor cannot see or alter another account, W-9, DL, job, weight, payout or feedback.
- Forged or repeated QR and wall scans rejected; wrong-bag and unpaid pickup blocked; two checkout attempts cannot both succeed.
- Payment webhook duplicate/replay/forgery cannot approve earnings twice; chargeback/refund reconciliation reflected without silent data loss.
- File upload rejects disallowed files and enforces size/permissions; audit trail remains available after updates; backup restores are tested.
- Real device UX and accessibility: one-action-at-a-time guided screens, errors recover cleanly, permissions denied gracefully.
