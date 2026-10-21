# Independent private staging deployment review

Contributor `/root/deployment_review`, reporting centrally to `/root`. Scope: uncommitted Railway deployment preparation, private HTTP gate, TLS-proxy request handling, persistence configuration and privilege drop. No accounts accessed, hosting created, source deployed, financial connection, payments or identity documents. Application files were reviewed without modification. Contributor added only this report and `tests/deployment-review.test.mjs`.

## Executed evidence

`node --test tests/deployment-review.test.mjs`: **2 passed, zero failed/skipped**. Tests use isolated SQLite fixtures and real local HTTP transport with explicit remote Host/proxy headers. Temporary data is removed.

Verified:

- Both frontend entries, shared assets and APIs require the outer private staging credential. Supplying the gate does not bypass the separate app session.
- Incorrect/missing gate produces a Basic challenge without fixture credentials or tokens.
- Health response is exactly `{ok:true}` and exposes no account/order data.
- Host spoofing and `X-Forwarded-Host` do not bypass exact remote host. App routes reject loopback Host in remote mode.
- Missing/wrong/multiple/uppercase forwarded protocol values are rejected; only exact `https` is accepted.
- Cross-origin and HTTP-origin login requests are rejected. Expected HTTPS Origin succeeds.
- Login and logout cookies include Secure, HttpOnly and SameSite=Strict. HTTPS app responses include HSTS.

## Findings reported to lead

1. **Privilege drop:** initial bootstrap changed primary UID/GID without clearing supplementary groups. Lead added `process.setgroups([])` before dropping GID/UID; verified in the updated source. The final container must still be checked for UID/GID 1000 and no retained privileged supplementary groups.
2. **Healthcheck platform Host:** Railway may send health probes with `Host: healthcheck.railway.app`. Initial host validation permits only configured origin or loopback and would reject that provider Host. Confirm current Railway behavior/documentation or permit that exact Host exclusively for GET `/healthz`; never use it as an app-route allowlist entry. Actual Railway edge healthcheck remains unverified until hosting authorization.
3. **Proxy trust boundary:** `X-Forwarded-Proto` is trusted only for the dedicated remote deployment. Ensure Railway terminates HTTPS and the container HTTP port has no separate direct public/TCP exposure. Header spoof tests protect host rules but do not prove the provider network configuration.
4. **Private gate entropy:** generate a random staging gate password (24+ characters), store it in hosting variables, and share only through a secure channel. Minimum length cannot establish password unpredictability. Basic gate is an additional synthetic-test barrier, not production MFA/identity.
5. **Persistent storage:** config requires `/data` volume metadata and one replica, bootstrap prepares directory ownership, and the app uses that path. Actual Railway volume attachment, restart restoration and backup recovery must be tested remotely. Existing root-owned data files may fail closed rather than migrate automatically; do not weaken file modes to work around ownership.

## Remaining release limits

No real TLS handshake, Railway health probe, container network isolation, remote replica count, volume restore, billing limit or account authorization verified by this review. These checks supplement prior API/domain/browser tests; they do not constitute a penetration test or production approval. Real provider payments, public launch and identity collection remain disabled.

Rollback: revert the deployment configuration and remote-mode changes; preserve any private volume data. No external state was changed by this contributor.
