# Private Railway staging deployment

Status: container and remote-mode code prepared; no Railway account linked or hosted deployment created. Owner must authorize account access and approve any current provider charges. Earlier $5–$10 estimate was not a verified quote; review Railway's current plan, storage and usage billing before approving resources. Do not purchase a domain for this test.

## Account step for owner

Sign up at https://railway.com using the GitHub account that can access `kylepolk07-ops/Cottonrootswash`. Authorize only this repository when possible. Stop before selecting a paid plan/adding billing unless you approve its displayed costs. Never paste credentials into chat. This task has no Railway connector, CLI login or account token available; dashboard authorization does not automatically grant this agent remote API access.

## Deployment configuration for the authorized operator

Use the `staging/railway-private` source branch after it is pushed and verified. Do not enable unprotected public app access or production auto-deployment. Select the repository service using the committed Dockerfile/railway.toml. Startup fails closed until the variables and volume are supplied. A private staging endpoint accessible on a phone needs a generated HTTPS Railway domain, with both interfaces on that origin; the outer private-code form and secure cookie protects all frontend pages, assets and API calls. Only a minimal health probe is ungated. This is password-protected synthetic staging, not public launch approval.

Attach one persistent volume at `/data`, run exactly one replica, and set:

| Variable | Value |
| --- | --- |
| `CRC_DEPLOYMENT` | `railway` |
| `CRC_DATA_DIR` | `/data` |
| `CRC_PUBLIC_ORIGIN` | Exact generated HTTPS origin, no trailing slash/path |
| `CRC_STAGING_USER` | A private test access username |
| `CRC_STAGING_PASSWORD` | Password-manager-generated random secret, at least 24 characters |

Railway supplies `PORT` and `RAILWAY_VOLUME_MOUNT_PATH`; the latter must equal `/data`. Do not invent volume metadata without actually attaching the volume. Keep password in private service variables, never source or chat. Restrict project membership. Don't create a public TCP proxy/direct port: only the Railway TLS HTTP edge should reach this container. Application requests require exact configured Host and `X-Forwarded-Proto: https`. Provider edge header handling and actual TLS still need remote verification. `GET /healthz` permits configured Host, loopback, or the exact `healthcheck.railway.app` probe Host; that probe Host cannot access app routes.

Do not add financial, SMS or identity-provider secrets; those integrations are disabled. Do not use real customer information. The bootstrap initializes volume directory ownership then clears supplementary groups and drops to UID/GID 1000 before application startup. Existing volume contents with incompatible file ownership fail closed; preserve and repair ownership with an authorized operator rather than weakening permissions or deleting data.

## Private test access and readiness

First open `/access` and enter the configured private staging code in the normal web form. The native browser password prompt is no longer used for ordinary visits. Then sign in separately to the Customer or Contractor app. Synthetic account credentials and QR tokens are generated on first startup at `/data/fixtures.json`, mode 0600. Retrieve only through authorized Railway console/SSH, privately, and put them in the owner's password manager. Do not dump them into deployment logs, chat, public artifacts or Git. Management uses the synthetic `owner` account on the Contractor app; outer staging access alone never grants Management access.

After the actual host is connected, verify:

1. Health succeeds without data; both apps/assets redirect to the neutral `/access` form without the staging gate; APIs return 401 and no native password challenge. Wrong Host/HTTP-forwarded-protocol fails.
2. Correct gate loads `/customer` and `/contractor` over actual HTTPS. App session cookies are Secure, HttpOnly and SameSite=Strict. Cross-origin login fails. No direct public container port exists.
3. Separate synthetic customer/contractor/owner accounts reproduce README workflow on a real phone, including rejected wrong bag and rejected customer Management access.
4. Persist a synthetic order, restart/redeploy the service, sign in again and confirm account/order persistence. Sessions deliberately expire on restart. Confirm only one running replica with the attached volume.
5. Test camera permission denial/manual entry, actual iPhone/Android behavior and both phones reading refreshed server state. Payment pending stays pending; no live provider or fake paid toggle is supplied.
6. Set account usage alerts/spending controls supported by the chosen plan; do not claim those exist or cap spending until verified in the account. Perform private backup/restore testing before storing anything beyond disposable fixtures.

A new endpoint is not verified until these checks run against it. Local tests simulate proxy headers; they do not prove Railway edge configuration.

## Repeatable local container checks

```sh
DOCKER_CONFIG=/workspace/scratch/docker-config docker build -t cotton-roots-private-staging:review .
DOCKER_CONFIG=/workspace/scratch/docker-config node tests/container.mjs
```

The test creates and deletes an isolated Docker volume/container and a private temporary environment file. It verifies mounted-volume startup, unprivileged process, remote-mode login, secure-cookie flag, order persistence across restart, and role denial. It incurs no Railway charges and handles synthetic data only. Run `npm test` for adversarial gate/host/origin/configuration tests and the mobile browser script from README for the full local guided flow.

## Rollback

Stop the staging service and preserve the private volume before changing runtime versions. Revert deployment commit through review and redeploy the last tested image. Do not delete the volume or reset fixtures to troubleshoot ownership. Removing a service may leave billable resources; inspect the provider's volume/service settings with the owner before cancellation. No provider resources have been created by the work recorded here.
