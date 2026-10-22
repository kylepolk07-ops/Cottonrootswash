# Product and UX gap report

Review date: 2026-10-21 (America/Chicago). Scope: compare the supplied Customer and Contractor reference prototypes, `docs/BUILD_BRIEF.md`, and the currently served secure staging interface. The references define presentation and flow; their browser storage and demo authorization are not implementation guidance.

## Product finding

The served build contains the important secure workflow primitives, but presents them as a compact engineering test harness. It does not yet communicate the intended Cotton Roots product: a calm home screen, clear choices, visible progress, and one illustrated task at a time. The next staging release should preserve the existing server authorization and state machine while adopting the reference information architecture and step-by-step interaction.

## Priority 0 — make the trial feel like the intended product

### Shared shell

- Add a real signed-in landing screen instead of opening on a long record list.
- Use the cream, deep green, sage, and ink system from the references with pictogram choice tiles, status tags, spacious cards, and a persistent mobile tab bar.
- Replace internal state names with plain customer language while keeping the exact server state underneath.
- Show a short greeting, the single next action, and a progress summary before secondary details.
- Keep every mutation on a focused screen with a clear Back action, disabled/busy feedback, success confirmation, and no destructive hidden gestures.
- Keep the synthetic-data banner visible but visually secondary to the product.

### Customer screens

1. **Home** — greeting; current laundry status; next action; quick tiles for New Order, My Laundry, and My Bags.
2. **New Order** — illustrated Drop Off choice at $2.50/lb; show Pickup/Wash/Return at $3.00/lb as clearly unavailable until routing exists; detergent as visual choices; standard/rush explanation; final review card.
3. **My Laundry** — one card per order with service, bag, due date, weight, price estimate/final total when supported, and a visual custody/status timeline. Emphasize the one available next action.
4. **Bag setup** — explain bringing laundry in the customer's own bag, moving it to a tagged Cotton Roots bag, scanning the under-lid code, scanning the bag, physically closing/locking the box, and the 24-hour return clock. Keep explicit language that the checkbox is an acknowledgment rather than electronic lock proof.
5. **Shop drop-off** — separate illustrated Bag scan and Wall scan steps, followed by a Dirty Bin instruction and saved confirmation.
6. **Pickup and rating** — retain only for paid-and-ready orders; show wrong-bag and already-picked-up failures clearly; show a thank-you screen and one optional rating after success.

### Contractor screens

1. **Today** — dashboard tiles for My Days, Offers, My Jobs, My Pay, and Wash Guide; show counts and the nearest deadline.
2. **My Days** — reference-style 14-day tap calendar with selected/unselected states, today marker, and service preference.
3. **Offers** — distinct from active jobs; each card must show service, bag, deadline, and an acknowledgment before Accept. An unavailable or missing deadline must block acceptance.
4. **My Jobs** — active-job cards should show progress and the next required task. The job wizard should present exactly one pictogram instruction per screen.
5. **First shop visit** — Bag scan → weight slider/value entry with live rounded-up half-pound preview → confirm weight → Wall scan → checked-out confirmation. Never request a weight photo.
6. **Return visit** — laundering-complete confirmation → same Bag scan → Wall scan → checked-in confirmation. Clearly state that returned/finished does not mean paid or released.
7. **Wash Guide** — a read-only illustrated SOP for checking the order, sorting, washing, drying, folding, protecting privacy, and returning the correct bag.
8. **My Pay** — totals and separate Pending, Approved for Payout, and Paid sections; state $1.00 per approved pound, contractor-paid machine costs, and one-full-week arrears. Disabled payout integration must be stated plainly.

### Management screens

- Lead with summary counts for applications, active orders, payment holds, exceptions, and pending payouts.
- Provide grouped/filterable order cards with customer-safe identifiers, custody, contractor, deadline, weight, payment, release, and exception status.
- Keep applicant approval separate from job handling; production documents must remain absent until protected storage and legal review exist.
- Present audit entries as readable event rows, with raw JSON available only as secondary diagnostic detail.
- Keep synthetic bag/station codes inside the owner-only test kit and label them as fake.

## Priority 1 — backend-supported product depth

These items can be implemented with synthetic data and the existing private staging constraints:

- Server-computed customer price estimates and final totals from service, approved rush status, and rounded weight.
- Structured custody timeline returned by the authorized order API.
- Contractor dashboard counts, separate offer/active-job collections, and earnings totals grouped by status.
- Read-only SOP content and richer status labels.
- Management summary counts and exception filters.
- Synthetic first-bag deadline display and overdue warning without charging a fee.
- Clear empty, loading, success, and recoverable error states.

## Blocked production integrations

The interface may explain or preview these items, but must not pretend they work:

- Customer signup, verification, recovery, and production owner MFA.
- SMS bag-box access codes and rotatable physical station codes.
- Home pickup routing, addresses, driver eligibility, and actual deadlines.
- Square hosted checkout, signed webhooks, refunds, paid/ready release, and financial reconciliation.
- Contractor applications containing driver license, insurance, W-9, or agreements; protected uploads, malware scanning, retention rules, and legal text are prerequisites.
- Real payout approval/batching, bank details, and money movement.
- Push/SMS notifications, production monitoring, backups, managed database/RLS, and multi-instance concurrency.
- Public launch, real identity collection, and real payments without owner approval.

## Owner phone test checklist

Use synthetic codes only. Pass means the screen is understandable without reading technical documentation.

### Customer

- [ ] Sign in with lowercase `customer` and the private test code.
- [ ] Home clearly shows what to do first.
- [ ] Claim the sample bag through the under-lid, bag-scan, and lock-acknowledgment steps.
- [ ] Confirm the claimed bag and 24-hour first-return message appear.
- [ ] Book Drop Off, choose detergent, review, and create the order.
- [ ] Drop off using the matching sample bag and station codes; try one wrong code first and confirm it is rejected clearly.
- [ ] Confirm My Laundry shows the updated custody/status, deadline, and later rounded weight.
- [ ] Confirm payment remains pending and no screen claims money moved.

### Contractor

- [ ] Sign in with lowercase `contractor` and the same private test code.
- [ ] Set at least one available day and confirm it remains selected after refresh.
- [ ] Review an offer, read its deadline, acknowledge it, and accept it.
- [ ] Complete first visit in order: bag → measured weight → rounded preview → wall station.
- [ ] Leave the app, return, and confirm the job still shows Washing with the correct next step.
- [ ] Complete second visit in order: laundering complete → matching bag → wall station.
- [ ] Confirm the job is Returned/Payment Pending rather than Paid.
- [ ] Confirm My Pay shows pending earnings and states that no payout occurred.

### Management and access control

- [ ] Confirm Customer and Contractor accounts cannot see Management.
- [ ] Sign in separately as owner and confirm Management shows orders, users, test kit, and audit activity.
- [ ] Confirm synthetic codes are visible only to the owner account.
- [ ] Confirm no real payment, payout, identity upload, or public signup action is available.

## Acceptance bar for the next staging release

- The Customer and Contractor apps each have a distinct dashboard and mobile navigation.
- The main bag, booking, offer, and custody flows use one illustrated action per screen.
- All existing authorization, ownership, sequence, idempotency, and payment-spoofing tests still pass.
- A phone-size automated browser run completes the full synthetic workflow without horizontal overflow or browser errors.
- Owner phone review completes the checklist above; real camera scanning remains a separately recorded device check.
