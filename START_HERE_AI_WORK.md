# Cotton Roots — AI Work task

Use this repository as the source of truth. Deliver a functioning STAGING build, not more unrelated HTML prototypes. Work independently on nonfinancial preparation and tests. Ask the owner only when access, security/legal approval, financial connection, or external publication is unavoidable. Do not claim live integration before verifying it.

## User experience
Keep TWO separate mobile-first apps: customer and contractor. Management is an access-controlled area on the staff side. Preserve the clean cream/sage/black pictogram design. One question/action per screen, large buttons, low reading burden. One-time signup; owner gets management/test access without contractor application. Test mode must be clearly separated from production.

## Build sequence and acceptance tests
1. Create maintainable shared TypeScript/domain contract, two frontends, secure backend, database migrations, and reproducible local dev commands. Reuse existing visual reference files but remove localStorage as source of truth and demo authorization in production.
2. Account/RBAC: owner, staff, approved contractor, customer. Contractors apply once; owner approves onboarding once, not each offered job. Do not collect real IDs/W-9s until protected upload, retention and access review exist.
3. Bag box: code request for first/extra bag; scan QR inside lid means 'I am taking a bag'; scan unique bag QR claims it to account; explicit 'I shut and locked the box' acknowledgment; first bag must return with first order within 24 h or proposed $10 charge (no real automated charge without owner/legal approval). Never claim physical lock verification from a checkbox.
4. Shop dropoff: customer scans bag then wall station; verified server check-in. Contractor checkout: scan bag -> enter measured lb with simple slider -> round up to next .5 lb -> confirm -> wall QR checkout -> status Washing. The customer sees weight and status. Contractor later returns: confirm done -> scan bag -> scan shop station QR to check IN -> status returned/finished, NOT automatically paid/ready. Do not conflate two separate shop visits.
5. Customer payment: verify Square payment server-side before moving bag to paid pickup; customer sees only their own PAID+READY orders, selects one, scans matching bag, wrong/unpaid bag cannot be released. Thank-you + optional one rating/order after pickup.
6. Contractor: two-week tap-toggle availability calendar, work preference (wash/fold, pickup/wash/return, both), offers show real due date before acceptance; contractor confirms can meet it. One-step SOP and stateful job workflow. $1.00/lb; contractor pays machine costs; one-full-week-in-arrears payout ledger. Earnings pending after completion, move to approved only after payment verified. Never automatically deduct proposed $10 late fee/forfeit; management review and legal signoff required.
7. Protect secrets server-side, access controls/RLS, scan authorization, idempotent updates and webhook, audit trail, secure uploads. Use sandbox integrations, not live money, at first.
8. Test signup persistence, two phones/accounts, wrong QR and bag ownership, double scan, accidental back navigation, unpaid pickup, late return, webhooks, payment/earnings, responsive real phone sizes; CI tests and setup docs.

## Completion output
Provide working staging URLs for each of the TWO apps (if deployment access available), a management test login or safe seeded local fixtures, test results, list of blocked integrations/owner approvals, and easy instructions for future AI changes through repository commits and staging reviews. No public launch or handling real sensitive data without explicit owner approval.

## NON-NEGOTIABLE SECURITY AND TRANSPARENCY
Read and enforce `SECURITY_AND_AGENT_POLICY.md` before doing any work. Record each contributor/sub-agent's work in `docs/WORK_LOG.md`, including changes, tests, risks and blockers, and report consolidated status to the owner. No hidden agents, undocumented modifications or silent production deployments. Security checks are release blockers, not optional cleanup. No claim of hack-proof/unhackable security.
