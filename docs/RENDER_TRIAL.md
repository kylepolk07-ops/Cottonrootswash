# Alternate phone testing: Render disposable private trial

Railway reported an outage in the owner's screenshot. The owner created the free disposable Render service `cotton-roots-private-trial`; this fallback uses the existing apps and backend rather than browser-only demo authorization. No payment or paid resource was authorized.

## Immediate visual review

`/workspace/Cotton-Roots-Phone-Walkthrough.pdf` is a downloadable phone-friendly **noninteractive** tour of the real application screens, generated from isolated browser fixtures. It can be viewed without hosting, new accounts or payments. It does not test shared live server state on the owner's phone. Recreate with scripts/phone-walkthrough.mjs and scripts/phone-walkthrough.py as described in PHONE_WALKTHROUGH_REPORT.md.

## Hands-on testing from a phone

An authorized hosting account is still necessary for live, shared Customer/Contractor testing. This branch includes a `render.yaml` Blueprint requesting Render's free web-service plan. Current availability, free-account eligibility, pricing, region and dashboard behavior must be checked by the account owner. Never silently change it to a paid plan. Stop if billing authorization or an upgrade is requested.

1. On a personal device, sign up/sign in at https://dashboard.render.com with GitHub. Authorize access only to `kylepolk07-ops/Cottonrootswash` if possible.
2. Use **New → Blueprint** (wording may vary). Select that repository and source branch `staging/phone-trial`, containing `render.yaml`. Review requested resources before applying. It requests one free Docker web service and no paid disk, database or additional services.
3. Verify service plan is free and one instance; keep the generated environment values secret. If Render cannot accept the configuration or offers a paid alternative, stop and record the error rather than buying resources. No live phone test is claimed until deployment actually succeeds.
4. The Blueprint generates private values for `CRC_STAGING_PASSWORD`, `CRC_CUSTOMER_PASSWORD`, `CRC_CONTRACTOR_PASSWORD`, `CRC_OWNER_PASSWORD`. Change the disposable `CRC_STAGING_PASSWORD` to a private six-digit PIN. Existing generated long values remain accepted during this transition. View values only in authorized Render Environment settings and never paste them into chat/logs/source.
5. Open `/access` and enter `CRC_STAGING_PASSWORD`; no outer-gate username is required. A Secure/HttpOnly cookie remembers private access for eight hours or until restart. Customer and Contractor reuse that code with usernames `customer` and `contractor`. Owner Management uses username `owner` and its separate generated password on `/contractor`.
6. Open `/trial-qr` on a computer to display the phone-link QR. It contains only the stable `/access` URL and never a PIN, password, or bypass token.
7. Owner Management shows **Synthetic test codes** for the sample bag and station. Copy those codes privately for the test customer/contractor manual scan fields. Other roles cannot retrieve this kit. All bags, accounts and orders are fake.

## Disposable data and runtime safeguards

Render mode explicitly requires `CRC_EPHEMERAL_TEST=1`. This trial has no persistent disk: data in `/tmp/cotton-roots-trial` may disappear on a redeploy/replacement, and free services may sleep. It is unsuitable for real orders. The app labels this disposable trial after login. A warm restart can preserve files; do not assume every restart clears records. Simultaneous phones use the same service until a reset; browser refresh loads current authorized state.

`RENDER_EXTERNAL_URL` supplies the exact HTTPS public origin, unless explicitly overridden by `CRC_PUBLIC_ORIGIN`. Startup rejects missing/untrusted-scheme/path credentials in origin, absent private gate, absent generated role passwords, or missing disposable acknowledgment. All app pages/assets/APIs remain behind the outer gate and separate role sessions. The redacted health endpoint and URL-only QR display are the only ungated routes. Docker drops privileges and serves only synthetic fixtures. HTTPS Host/Origin/proxy and actual Render health/network behavior must still be verified against the deployed service. Do not configure an alternate direct TCP port.

Fixture passwords initialize only on the first database bootstrap and have length 24–256 characters. Changing an environment password while retaining the old database does not rotate stored account credentials. For deliberate password rotation/reset in this disposable trial, preserve any needed synthetic test notes and replace the disposable instance with fresh state using an authorized operator; do not claim a simple env edit rotates accounts. Outer gate password updates apply after service restart. Never reset a real database with these instructions.

## Acceptance checks before owner trial

- HTTPS loads both apps only after the private access form; a session alone cannot bypass the outer gate.
- Customer/contractor see only authorized records; customer and contractor cannot access Management or sample code API.
- Owner can retrieve synthetic codes without shell access; no endpoint returns generated account passwords.
- Complete claim/book/dropoff → availability/accept/weigh/checkout → washing/return/checkin across two test accounts; earnings and payment remain pending.
- Confirm actual phone browser, camera denial/manual fallback and service wake-up behavior. There is no real payment provider, identity upload, account recovery or production MFA.
- Inspect actual deployment logs without disclosing secrets; ensure no paid resources or public data routes were introduced. Verify Render's current TLS/proxy and health checks; local simulated headers cannot prove its edge behavior.

Local evidence commands:

```sh
npm test
npm run check
DOCKER_CONFIG=/workspace/scratch/docker-config docker build -t cotton-roots-private-staging:review .
DOCKER_CONFIG=/workspace/scratch/docker-config node tests/container.mjs --render
```

`--render` verifies injected private test credentials, outer gate, unprivileged process, owner-only QR kit, restart persistence and expected loss of synthetic orders after a fresh container replacement. It does not access Render or incur provider charges. All test containers/volumes/private env files are removed.

Rollback: stop/remove only the disposable Render service after preserving test feedback and confirm resource removal in its account. Source changes are reviewable in Git. Do not cancel Railway or delete its volume as part of this fallback. No real money, identity documents, legal agreements or public launch is authorized.
