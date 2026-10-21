# Render disposable phone-trial security review

Contributor `/root/deployment_review`, reporting centrally to `/root`. Reviewed the Render fallback in `server/config.mjs`, `server/app.mjs`, `web/app.mjs`, and `render.yaml`. Added `tests/render.test.mjs` and this report only; no application source edits, provider account access, deployment, billing, money movement, or identity handling.

## Executed checks

- `node --test tests/render.test.mjs`: **3 passed, zero failed/skipped**.
- `npm test`: **20 passed, zero failed/skipped**, including existing Railway/private gate, authentication, custody and payment-helper tests.

New tests verify:

- Render requires explicit disposable-test acknowledgement, HTTPS origin, private gate credentials and three injected fixture passwords. Missing/invalid values fail closed.
- Render chooses `/tmp/cotton-roots-trial`, binds the service port externally, and marks the instance as synthetic/disposable.
- Injected customer, contractor and owner passwords work on first bootstrap without appearing in login responses.
- Restart with different injected bootstrap values preserves existing fixture credentials and private fixture file rather than silently rewriting them. Old password succeeds and replacement password fails against retained state.
- The synthetic QR kit requires the outer private gate, a logged-in owner, and `fixtures:true`. Anonymous, customer, contractor and `fixtures:false` requests cannot retrieve it.
- Owner kit contains only the expected synthetic marker and bag/station tokens, matches synthetic fixtures, and has no password fields. `/api/me` marks disposable staging.

## Review conclusions

No authorization regression was found in these tested paths. Management UI renders synthetic QR values through text input values, not HTML injection. The kit does not return any account or gate password. Separate Management login remains required after the outer staging gate. Existing payment and upload routes remain unavailable.

`render.yaml` selects a free plan, one instance, generated secret variables, the phone-trial source branch and a minimal healthcheck. These are source declarations, not evidence that Render accepted the blueprint, created a free resource, or guarantees a spending cap. Account authorization and current plan terms must be reviewed before application. No resources were created by this contributor.

## Limits and reported observations

1. **Disposable persistence:** `/tmp` is ephemeral. Orders, accounts, QR tokens and sessions may reset after restart/redeploy/provider replacement. The UI warns signed-in trial users. This is appropriate only for fake phone-testing data; do not present it as persistent staging or use real customer information.
2. **Bootstrap credential rotation:** injected fixture passwords apply only when initializing an empty database. Changing hosting variables while the process retains its database does not rotate accounts. Document intentional reset/reinitialization behavior before giving trial access. Normal logout/restart revokes in-memory sessions.
3. **Custom overlong credentials:** existing login code truncates submitted passwords to 256 characters, whereas injected password validation originally imposed only a minimum. Generated provider passwords are within the supported range, but a custom value over 256 characters could bootstrap an account that cannot log in. Reported to lead; use generated passwords or bound accepted bootstrap length before allowing custom values.
4. **Remote verification pending:** tests simulate proxy headers over local HTTP. Actual Render TLS, forwarded header behavior, health Host, generated values, account permissions, automatic deploy scope, sleeping/cold-start behavior and phone browser access still need real deployment checks. No live Render URL has been verified by this review.
5. **Production gates remain:** this fixture-only test does not implement managed signup/MFA, production custody QR assurance, real payment processing, durable remote audit, production database controls or identity uploads.

Rollback: revert the Render fallback changes and blueprint; stop/delete only an authorized disposable trial service after preserving any needed fake test evidence. No external state changed here.
