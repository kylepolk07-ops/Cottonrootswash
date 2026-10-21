# Cotton Roots & Co. — implementation starter

**Two separate interfaces, one shared order contract.**

This is a secure-build starter, not a live multi-phone application. `apps/*/reference.html` are design references only; their browser storage and demo approvals must NOT be used for real customers, payments, or identity documents.

## Completed without owner credentials
- Consolidated product requirements (`docs/BUILD_BRIEF.md`)
- Separate customer and contractor interface reference files
- Shared statuses, half-pound rounding, rates and pickup eligibility (`shared/rules.mjs`)
- Runnable basic tests (`node --test tests/*.test.mjs`)
- Restricted-by-default Postgres/Supabase draft schema and row-level security (`db/migrations/001_core.sql`)
- Configuration key inventory (`.env.example`)

## Next engineering steps, in order
1. Initialize Git repo, provision Supabase **staging**, test accounts and protected roles. Deploy/test migration. Implement server-side API/RPC transitions with actor/ownership checks and idempotent event log. Do not expose service role key to browser.
2. Rebuild visual references as separate deployable frontends using shared API client. Complete authenticated bag claim and custody state machine; implement actual camera scanning and manual fallback. Write end-to-end tests.
3. Add secure restricted contractor document uploads and manager-only review. Lawyer must approve final contract; do not use draft text as executed contract.
4. Connect Square sandbox checkout and verified webhook. Payment confirmation must never come from a client-side toggle; payout ledger changes must be idempotent.
5. SMS/invite/access-code service, opt-in, rate limits and code expiry; physical station QR rotation.
6. End-to-end test on real iPhone and Android; verify wrong bag, wrong user, unpaid, double scan, duplicate webhook and lost connection.
7. Owner approval for production deploy and for enabling real transactions/document uploads.

## Change discipline
One commit/PR per feature, edit only `shared/rules.mjs` for duplicated pricing and statuses, migrate schema with versioned SQL, keep both frontends on shared contract. Never deploy based only on a JavaScript syntax check.

## Local checks
```sh
node --test tests/*.test.mjs
```

## Pending owner actions (not needed for current package)
Provide access by secure integrations to source repository, staging deployment host, database, Square, SMS and secure identity-document storage. Do not paste API secrets into chat.

### Implemented workflow checks
`shared/workflow.mjs` implements an explicit order transition model and `tests/workflow.test.mjs` covers rejected invalid transitions. Run `node --test tests/*.test.mjs`. This is reusable application logic, NOT server-enforced security until integrated into authenticated transactional routes and the production database.
