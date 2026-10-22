# Independent private-access form review

Contributor `/root/deployment_review`, reporting centrally to `/root`. Scope: new `server/private-access.mjs`, its integration in `server/app.mjs`, and regression tests for replacing the iPhone native Basic prompt. The original iPhone prompt failure cause remains unconfirmed; this review verifies the replacement controls, not a diagnosis of the phone/provider behavior. No app/backend files were edited by this reviewer.

## Contributor changes

- Added `tests/private-access.test.mjs`: seven tests covering real HTTP integration plus isolated clock-controlled gate/session, signed-challenge and browser-incidental-request regressions.
- Updated `tests/deployment.test.mjs` and `tests/deployment-review.test.mjs`: unauthorized app/asset GETs now must redirect to `/access`; APIs still return 401. All such responses must omit `WWW-Authenticate` so a native Basic dialog is not automatically triggered. Invalid old Basic on app GET also redirects. Valid explicit Basic remains tested for operator clients.
- Added this report. No credentials printed, provider accounts accessed, deployments created, money moved or identity documents collected.

## Executed evidence

`node --test tests/private-access.test.mjs tests/deployment.test.mjs tests/deployment-review.test.mjs`: **8 passed**, zero failures/skips.

Initial `npm test`: **24 passed**, zero failures/skips. After the signed-challenge correction, `node --test tests/private-access.test.mjs`: **6 passed**, and final `npm test`: **26 passed**, zero failures/skips.

Verified controls:

- Only the neutral `/access` form and its CSS are public. Customer/Contractor pages, application assets, runtime files, encoded/traversal-like paths and APIs cannot bypass the gate.
- Exact remote Host and HTTPS proxy protocol remain required even for the public form.
- Prelogin hidden CSRF must match the secure HttpOnly cookie and a valid unexpired HMAC-signed challenge. Missing/wrong cookies, forged tokens, missing/foreign Origin and replay after either success or failure are rejected.
- Incorrect private code does not grant a gate cookie and does not reintroduce a Basic challenge.
- Successful form submission issues an opaque `__Host-crc_access` cookie with Secure, HttpOnly, SameSite=Strict, Path=/ and no Domain. The code itself is absent from the cookie and response.
- Destinations are restricted to `/customer` or `/contractor`; external and protocol-relative destinations resolve to the Customer path.
- Ten-minute challenges and eight-hour gate sessions expire; tests advance an injected clock instead of waiting or weakening production expiry.
- Forged opaque sessions fail. Valid gate cookie takes precedence over stale invalid Basic credentials cached by a browser.
- Gate access alone cannot authenticate an application account. An app session alone cannot bypass the gate. A signed-in customer still receives 403 from Management.
- Form format and 8192-byte request limit are enforced. Wrong-code attempts hit the 20-per-minute rate limit; the limiter resets after its window.

## Review findings and limits

No authorization bypass was found in the tested paths. The module uses constant-time digest comparison, opaque random tokens, server-side expiry and no client role/payment authority. HTML interpolation contains only server-generated random CSRF, constant errors and whitelisted paths. No supplied private code is reflected. Provider/phone verification still belongs to the lead; simulated HTTP tests do not establish successful iPhone use. Lead reported two initial browser harness attempts failed workspace networking before application requests; a loopback gateway harness is being used separately. Those harness failures are not evidence of a deployed app or TLS failure, and this report claims neither deployed TLS nor actual iPhone verification.

**Reported liveness finding fixed:** the initial GET `/access` allocated one entry in a global 1000-challenge map. Lead replaced that allocation with stateless HMAC-SHA256 challenges containing a random nonce and signed expiration. The process generates a private signing key at startup; cookies/form values cannot forge its signature. Only consumed POST challenges occupy replay state, after the POST rate check. The signed timestamp must be a safe integer, within the next ten minutes and unexpired; comparison uses constant-time digests. New tests fetched 1050 forms without exhausting issuance and successfully submitted an earlier unexpired form. Tests also reject matching forged form/cookie pairs with altered nonce, signature, timestamp, excessive future expiry, malformed values and a challenge from a different process signing key. Existing success/failure replay and clock-expiry tests still pass. No new authorization bypass found.

**Browser form findings fixed:** lead's local browser run found that the inherited `Referrer-Policy: no-referrer` could make the native form POST send an unusable Origin, and a favicon request redirect could replace the CSRF cookie behind the displayed form. The access HTML now sets `Referrer-Policy: same-origin` while retaining exact Origin validation. Favicon GET returns an empty 204 with no cookies, redirects or data. A valid unconsumed signed CSRF cookie is reused on later access-form GETs, including different app-tab destinations; a consumed token is replaced. The new regression test confirms all these behaviors and submits the original visible form after favicon and repeated tab GETs successfully. The same-origin referrer policy also persists on recoverable form errors. Latest targeted run: `node --test tests/private-access.test.mjs`, **7 passed**, zero failures/skips. No authorization regression was found in this source follow-up.

Lead reports a successful local Chromium browser run using ephemeral localhost TLS and trust pinned only to that test certificate's exact public key. Its gateway simulates the remote Host/Origin. This is local browser evidence, not real-provider TLS or actual iPhone verification; this reviewer did not rerun the separate browser harness.

Remaining availability limits: the replay/session stores are deliberately bounded for private staging; POST rate quotas keyed to socket address may be shared across testers behind a provider proxy. Do not trust forwarded addresses merely to evade that limit. This remains a private synthetic single-process test, without a denial-of-service resilience guarantee.

Gate sessions are in memory and reset on process replacement; the remote trial is already explicitly disposable. Account logout and outer gate lifetime are separate. The added form does not add production MFA, recovery, managed auth, real payment processing or identity upload permission. No production-readiness or blanket security claim is made.

Rollback: revert the private-access module/integration and corresponding test changes through the reviewed source change. Keep the private staging secret unchanged unless rotation is explicitly authorized. Do not publish without the private gate or weaken separate account/Management authorization to resolve a phone UX problem.
