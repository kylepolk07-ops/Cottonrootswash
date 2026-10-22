# Render persistent pilot

This is the next step after an owner has upgraded the existing service. It preserves the private Customer/Contractor/Management trial on one Render instance. It is not a public launch, managed database, backup service, or live payment approval.

## Owner dashboard steps

In `cotton-roots-private-trial` in Render, create one persistent disk:

- Name: `cotton-roots-data`
- Size: `1 GB`
- Mount path: `/var/data`

In Environment, set these exact non-secret configuration names:

- `CRC_DATA_DIR` = `/var/data`
- `RENDER_DISK_MOUNT_PATH` = `/var/data`

Remove `CRC_EPHEMERAL_TEST`. Replace `CRC_STAGING_PASSWORD` with a new private value of at least 24 characters. The prior six-digit preview PIN is deliberately rejected once persistent storage is enabled. Keep role passwords and Stripe in test mode. Never paste a secret into chat or source control.

Save and deploy. The service starts only if both mount variables point to `/var/data`; otherwise it fails closed rather than writing customer data to temporary storage.

## What to test after deployment

1. Sign in as Customer and claim a synthetic bag.
2. Restart the service from Render.
3. Sign in again and confirm the bag still appears.
4. Do not enter real customer data or enable live Stripe keys.

## Before public launch

Move from single-instance SQLite to a managed database, set up tested off-host backups and restore drills, add real account signup/recovery, inventory QR generation, notifications, policies, monitoring, production access controls, and receive explicit owner approval for live Stripe payments.
