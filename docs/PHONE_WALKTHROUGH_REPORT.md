# Phone visual walkthrough contributor report

Contributor `/root/phone_walkthrough`, reporting centrally to `/root`. User wanted a way to test during Railway's deployment outage; assigned scope was a downloadable phone-readable visual preview of the actual implemented screens. No subagents delegated, no external deployment/account/payment or real identity data used. Backend and application code were not changed by this contributor.

## Deliverables

- `/workspace/Cotton-Roots-Phone-Walkthrough.pdf`: nine phone-proportioned pages (390 × 844 points), eight actual app screenshots plus a cover explaining scope. About 460 KB. The PDF is deliberately labeled **not interactive**, **synthetic data**, and **hosted test link pending**.
- `scripts/phone-walkthrough.mjs`: reproducible isolated fixture browser flow and credential-safe screen capture.
- `scripts/phone-walkthrough.py`: cream/sage phone PDF layout using the captured screens; verifies page count and noninteractive disclaimer.
- Ignored `test-results/walkthrough/`: screenshots, capture metadata, and rendered visual-review samples. No fixture data/database retained.

## Executed evidence

```sh
PLAYWRIGHT_MODULE=/workspace/scratch/browser-tests/node_modules/playwright/index.mjs node scripts/phone-walkthrough.mjs
```

Final run PASS: actual customer claim/book/drop-off, wrong-bag rejection and recovery, customer Management denial, contractor availability/deadline acceptance, measured 12.1 rounded to 12.5, shop checkout, later completion/bag return/station check-in, payment-pending result, pending earnings, contractor Management denial, and owner Management screen. No browser page exceptions. Uses headless Chromium at 390 × 844, America/Chicago timezone, temporary SQLite data and temporary accounts removed after execution. Screenshots do not display password or QR-token values; capture asserts both input values and visible body text exclude all fixture passwords/tokens.

The parent concurrently added an owner test-kit card with sample QR fields. The first generation attempt correctly stopped at the capture credential guard. The final generator omits that card from the Management preview only; the caption discloses its omission. No actual app route or authentication behavior is altered. A subsequent full run passed and generated the PDF. Cover/page count checked with pypdf; cover, one content page and Management capture inspected visually after PDF rasterization with pdftoppm. Fonts and layout were readable with no cover overflow.

## Boundaries

This artifact lets the owner review screen layout and guided steps on a phone. It is not a live app, interactive HTML demo, multi-phone backend test, iPhone Safari/camera test, production security approval, or hosted staging URL. No payments can be made in the artifact. Interactive testing still needs a working privately hosted deployment. PDF generated from local live server snapshots, not invented prototype mockups.

## Runtime prerequisites and rollback

Generator needs Node 24+, existing app files, Playwright, system Chromium, Python reportlab/Pillow/pypdf, and DejaVu fonts in standard Linux font path. Uses already installed local tooling; no new packages installed for this contribution. PDF/script deletion rolls back this visual deliverable without touching app records or external resources. Parent owns central WORK_LOG and Git checkpoint/push.
