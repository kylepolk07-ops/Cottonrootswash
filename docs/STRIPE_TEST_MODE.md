# Stripe test-mode preparation

The owner selected Stripe because the Cotton Roots account must be under credentials they control. This preparation is **test mode only**. It does not create an account, collect identity/bank information, activate payments, or alter the current payment-pending product flow.

## Implemented and tested

- Explicit `stripe_test` configuration that rejects live keys and incomplete setup.
- Provider-hosted Checkout request construction. Raw card numbers never enter this application.
- Exact server-derived order/customer/amount/currency metadata and an idempotency key.
- Stripe webhook HMAC verification over the untouched request body with timestamp tolerance.
- Reconciliation of completed paid test Checkout sessions against the trusted order, customer, amount, currency and optional stored session ID.
- Duplicate event rejection and rejection of unpaid, open, wrong-customer, wrong-order, wrong-amount, wrong-currency and live-like session data.

Environment variable names, never values:

- `CRC_PAYMENT_PROVIDER=stripe_test`
- `STRIPE_SECRET_KEY` (`sk_test_...` only)
- `STRIPE_WEBHOOK_SECRET` (`whsec_...` for the exact staging endpoint)
- `CRC_STRIPE_TEST_FEE_BPS` (test display estimate, for example `290`)
- `CRC_STRIPE_TEST_FEE_FIXED_CENTS` (test display estimate, for example `30`)

## Interactive sandbox wiring

The authenticated Customer endpoint `POST /api/payments/checkout` creates a Stripe-hosted test Checkout Session only for that customer's returned `payment_pending` order and trusted server-calculated total. The raw-body webhook endpoint is `POST /api/payments/stripe/webhook`. It is outside the private preview cookie gate so Stripe can reach it, but exact Host/HTTPS checks, Stripe's timestamped HMAC signature, stored Checkout Session ID, customer, order, amount, currency and event uniqueness are all required before an order becomes `paid_hold`.

The owner must create a Stripe account they control and use **test mode**. Credentials must be entered directly into Render; never paste them into chat, source, screenshots or logs. Without the explicit provider and complete test configuration, the checkout endpoint fails closed and the existing payment-pending experience remains.

In test mode, the UI clearly labels a configured grossed-up online payment cost as an **estimate** and shows laundry subtotal, estimated cost and test total before leaving for Stripe. It does not change the advertised laundry rate or claim the estimate is an approved surcharge. A live pricing decision still requires verification against Stripe/card-network rules, especially the prohibition on credit-card surcharges for debit/prepaid cards.

The staging state stores the exact checkout session ID and event uniqueness atomically with the order transition. Customer pickup remains blocked until the signed webhook moves the order to paid hold and authorized staff scans the correct bag into the pickup area. Live keys continue to fail closed until separate written approval.

Rollback: omit `CRC_PAYMENT_PROVIDER` and Stripe variables. Existing Square verification groundwork remains unconnected and unchanged.
