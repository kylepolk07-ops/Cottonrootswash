# Owner advocate review

Review date: 2026-10-21 (America/Chicago). Review target: the secure served Customer and Contractor apps, using the supplied reference prototypes as the visual and interaction source.

## Owner standard

The preview must feel modern, calm, illustrated, and obvious without training. Each screen should lead with one task, use familiar words, explain what happens next, and keep secondary detail out of the way. Security and test-only limits must remain accurate without making the product read like an engineering tool.

## Problems rejected and corrected

- Sign-in no longer starts with blank username fields. The correct Customer or Contractor username is prepared, capitalization is normalized, autocorrect is disabled, and a failed sign-in gives a plain message in keyboard focus.
- Raw backend status names are translated into customer-facing phrases such as `At the shop`, `Being washed`, and `Finished · payment pending`.
- The booking screen no longer duplicates an illustrated service choice with a technical service dropdown. It presents one available choice and a clearly unavailable future choice.
- Guided order actions lead with the task. Expandable order detail follows it instead of interrupting it.
- Success messages state the result and the next action instead of saying only `Step saved`.
- The mobile tab bar uses icon plus text, an obvious current state, 62 px targets, safe-area padding, and explicit accessible labels.
- Checkboxes, details controls, sign-out, and navigation meet the 44 px touch-target minimum. Narrow 320 px screens use one-column action tiles.
- Disabled future services remain readable and clearly unavailable.

## Paired review

The owner advocate and mobile usability reviewer exchanged findings before editing and agreed on ownership: product language and flow in `web/app.mjs`; responsive/touch styling and recovery assertions in `web/style.css` and the product browser test. There were no unresolved disagreements.

## Six-digit PIN and QR requirement

For the disposable private preview, the access and Customer/Contractor convenience credential should be described as a **6-digit PIN**. This shortcut must stay limited to disposable staging; owner/Management keeps a separate strong password. The shareable QR must contain only the HTTPS `/access` URL and must never contain the PIN, a query secret, account password, or session token.

Before deployment, integration review must confirm the server validates the preview PIN as exactly six numeric digits, not merely a six-character minimum, and that form wording and numeric keyboard hints match that behavior.

## Evidence

- `npm run check`: passed.
- `tests/product-experience-browser.mjs`: passed at 390 × 844 and its paired narrow-screen 320 × 700 check. It covers friendly sign-in recovery/focus, dashboard choices, guided flow, anchored navigation, accessible labels, 44 px targets, and horizontal overflow.
- Real iPhone camera behavior and the deployed Render revision still require owner-side verification.
