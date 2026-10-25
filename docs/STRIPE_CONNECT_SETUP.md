# Washing Specialist payout onboarding

Cotton Roots uses Stripe-hosted Connect onboarding so tax identifiers, identity documents, and bank account numbers are entered directly on Stripe. The Cotton Roots database stores only the Stripe connected-account ID and completion status.

## Enablement

1. Activate Stripe Connect in the live Stripe account and choose Express connected accounts.
2. Ensure the live server key can create/read **Accounts** and create **Account Links**. Keep the key only in Render.
3. Add `CRC_STRIPE_CONNECT=1` to the Render service and deploy.
4. Test with a real owner-reviewed Washing Specialist before accepting public applications.

The app blocks accepting work until Stripe reports that details are submitted, payouts are enabled, and no current requirements remain. Management phone and in-person approval remain separate requirements.

Stripe Connect collects tax and identity information required for the connected account. If Cotton Roots requires a driver's-license image in every case rather than only when Stripe requests an identity document, enable a separate Stripe Identity document-verification flow before launch. Never upload licenses, Social Security numbers, or bank details into the Cotton Roots app or Render disk.

Automated transfers are a separate step. This onboarding change prepares the connected account and bank destination; it does not send money automatically. Venmo remains outside the automated flow and should be used only as a manually documented exception.
