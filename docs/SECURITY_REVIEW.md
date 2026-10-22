# Central security contributor report

Contributor: `/root/security_tests`; role: independent backend security reviewer and test author. Lead: `/root`. Scope: API security tests, threat model, optional unconnected Square verification groundwork. No other agents delegated and no account/provider connections made.

## Files changed

- `tests/api.test.mjs`: isolated temporary SQLite fixtures, real HTTP authentication/custody requests, role and ownership checks, CSRF/Origin, request size, static path boundaries, fixture secrecy, restrictive runtime file modes, hostile Host header, logout/throttling, idempotency conflicts and persisted retry, competing acceptance, weight, separate return, unpaid pickup and earnings, audit redaction.
- `server/square-verification.mjs` and `tests/square-verification.test.mjs`: pure unconnected signature verification and trusted invoice reconciliation; no API route, provider call, credentials or payment state changes.
- `docs/SECURITY.md`: data flow/threat model, tested controls, explicit private staging boundaries and release blockers.
- This report.

## Findings and disposition

1. Original backend accepted arbitrary Host headers. Reported DNS-rebinding exposure to lead; lead added loopback Host allowlist. Verified hostile Host receives 403 using native HTTP request. Node fetch ignored the supplied Host override in the first regression check, producing one test-harness failure; corrected the check to native HTTP, then reran successfully.
2. Original runtime creation did not tighten permissions on an already existing directory. Reported to lead; lead added chmod. Tests confirm runtime mode 0700 and SQLite mode 0600.
3. Original in-memory session storage had no cap/expiry cleanup. Reported; lead added 1000-session cap and expired-session cleanup on login. Logout revocation and failed-login throttling tested. Session cap itself not load-tested.
4. Secure cookie flag absent on intentional loopback HTTP staging. This is an explicit production blocker, not a waived production control. Managed auth/MFA/recovery, durable remote audit, multi-process transaction semantics and real-provider verification remain unresolved.
5. Single SQLite state row and process memory are suitable only for private synthetic single-process staging. Audit and idempotency history grow without retention policy; local audit is not tamper resistant. Do not deploy this unchanged for real users.
6. Static station token indicates token knowledge only; physical presence is not proven. Camera/device and rotating-station verification remain untested.
7. No tested route can self-certify payment or upload identity documents. Payment signature helper is unconnected and its event Set is only a caller-supplied replay check; future persistence must atomically enforce event and payment uniqueness before ledger/order transitions.

## Executed evidence

Repeated `node --test tests/api.test.mjs`: initially 2/2, then expanded to 3/3 passing. `node --test tests/square-verification.test.mjs`: 2/2 passing. Final `node --test tests/*.test.mjs`: 13 tests, 13 passed, 0 failed/skipped. The single intermediate Host-header test failure was diagnosed as a fetch harness limitation and corrected; final native HTTP test verifies the actual control. SQLite handles and temporary test data are closed/removed after each test.

This is source review plus automated regression testing, not a penetration test, real-device test, hosted staging validation or production security approval. No real money, actual identity documents or public deployment used. Rollback: revert these reviewable files and stop local staging; no external state needs reversal. Lead must consolidate this report in `docs/WORK_LOG.md` before handoff.

## Follow-up: disposable trial convenience login

Contributor `/root/security_followup` independently reviewed the shorter shared trial-code path after the owner requested easier test credentials. The shortcut remains acceptable only for this disposable, synthetic Render trial because the private-access gate must succeed first and the shortcut is restricted to the `customer` and `contractor` fixture roles. It cannot authenticate `owner`, does not add a Management route, and is disabled when `disposable` is false. Role-specific fixture passwords continue to work.

`tests/staging-shortcut-security.test.mjs` verifies the outer gate rejects an otherwise valid Customer shortcut, the exact lowercase Customer and Contractor fixtures accept the shared code only in disposable mode, owner and case-variant identities are denied, and persistent remote staging denies the shortcut for every role. Both focused tests passed. This convenience must not be carried into production authentication; production still requires managed accounts, recovery, MFA for Management, and removal of synthetic fixtures.

Final review of the richer frontend found browser rendering uses DOM `textContent` through the shared `node()` helper for API-supplied values rather than interpolating order or user data into HTML. The reference prototypes' `localStorage`, demo authentication, and client-authoritative payment state were not copied. The private-access page interpolates only fixed server messages, a signed hexadecimal challenge, and an allowlisted destination. No payment-confirmation or upload route was enabled. The new Contractor dashboard initially returned fields that the ordinary orders route strips; the backend contributor removed `customer_id` and detergent from its summary and added a regression assertion before handoff. The complete 35-test server suite and syntax checks pass after that correction.
