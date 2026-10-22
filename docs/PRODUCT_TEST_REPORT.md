# Product experience test report

The richer staging interface has an independent phone-size browser check in `tests/product-experience-browser.mjs`. It starts a temporary backend and database, signs in with generated synthetic fixtures, and removes that isolated data after the run.

The check covers the Customer dashboard and home story, pictogram bag and booking calls to action, visual Drop off versus disabled Pickup & return choices, an order custody timeline, anchored bottom navigation, the Contractor Today screen, distinct Offers and My jobs screens, all eight illustrated guide steps, pay-status summaries, accessible form labels, minimum 44 px visible button targets, horizontal overflow, and uncaught browser errors. Existing `tests/browser.mjs` remains responsible for the full custody workflow, authorization denial, QR mismatch, rounding, availability, return, earnings, and Management audit.

Run with:

```sh
PLAYWRIGHT_MODULE=/workspace/scratch/browser-tests/node_modules/playwright/index.mjs node tests/product-experience-browser.mjs
```

This is a Chromium test at 390 × 844 with the America/Chicago time zone and reduced-motion preference. It does not substitute for the required iPhone Safari, Android Chrome, physical camera, screen-reader, or production integration tests. It uses synthetic data and does not activate payments, payouts, identity collection, messaging, or home routing.
