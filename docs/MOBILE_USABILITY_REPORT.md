# Mobile usability pair review

Review date: 2026-10-21 (America/Chicago). Reviewers: `/root/mobile_pair` paired with `/root/owner_advocate`.

## Owner-centered decisions

- Kept the supplied cream, sage, ink, illustrated-card direction while adding a clearer modern mobile shell.
- Made sign-in forgiving of capitalization and phone autocorrect, prefilled the correct Customer or Contractor username, and replaced engineering-oriented login copy with plain private-preview language.
- Converted raw order states to human status labels and replaced generic success messages with the specific next step.
- Kept each scan/weight mutation as a focused sequence. Optional order details now follow the active task instead of leading it.
- Removed the duplicate service selector from booking: Drop Off is the single enabled visual choice and unavailable Pickup & Return is clearly labeled.
- Added icon-assisted bottom navigation with a visible current state while keeping text labels for accessibility.
- Moved error/success feedback into focus and view so a failed button does not appear unresponsive.

## Mobile fixes and checks

- Bottom tabs have at least 62px height and safe-area padding; the app retains bottom content clearance.
- Sign out, buttons, checkboxes, and expandable order details provide at least 44px touch targets.
- Disabled service choices retain readable contrast instead of fading the whole tile.
- Narrow screens switch two-column action tiles to one column and retain no horizontal overflow.
- Keyboard focus remains visible. Notices receive a visible outline when focused.
- Automated checks cover 390×844 and 320×700 viewports, visible control labels, touch targets, overflow, anchored navigation, and the complete reference-style dashboard/guide/pay experience.

## Six-digit preview PIN and QR

The owner requested a six-digit disposable preview PIN and a QR code. The paired UI language must call it a **6-digit PIN**. The QR may contain only the preview URL; it must never contain or bypass the PIN. Backend validation, rate limiting, and owner-only QR presentation are reviewed separately. This report does not claim that requirement is complete until those tests pass.

## Remaining device checks

Actual iPhone and Android camera permission behavior still needs hands-on testing. Real payments, identity documents, home pickup, and public signup remain disabled and must not be represented as working.
