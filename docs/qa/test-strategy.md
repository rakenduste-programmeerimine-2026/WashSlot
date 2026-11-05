# WashSlot – Test Strategy & QA Process

Owner: Database & QA.

## 1. Test levels

| Level | Tool | Location | Who writes | Runs |
| --- | --- | --- | --- | --- |
| Database (schema, RLS, RPCs) | pgTAP | `supabase/tests/database` | DB/QA | CI (Supabase + PGlite), locally |
| Unit / component | Vitest + Testing Library | next to the code (`*.test.ts(x)`) | feature author | CI, locally |
| End-to-end | Playwright | `qa/e2e` | QA | CI against local Supabase |
| Pilot (acceptance) | real residents, 2 weeks | [pilot test plan](pilot-test-plan.md) | QA | Milestone M5 |

Everything is TypeScript (`strict: true`); `tsc --noEmit` must pass in CI.

## 2. Core features → test cases

| Feature | Key test cases | Level |
| --- | --- | --- |
| Live overview | free / in use / awaiting collection / reserved / out of order states; estimated finish time; only own building visible; updates in realtime | DB, E2E |
| One-tap start + notification | default and custom duration; can't start a busy, broken or other building's machine; release only own cycle; notification sent ~5 min before end, once | DB, unit, E2E |
| Booking | future only, ≤ 24 h ahead, 15 min – 4 h; no overlaps; max 2 upcoming; others can't start into your booking; your start uses your booking; cancel own only | DB, E2E |
| Success criterion | collection within 10 min measured from `cycle_collection_stats` | DB, pilot |

## 3. Workflow rules

- Every change starts from a **GitHub issue** in a **milestone**.
- **Feature branches** from `main`: `<type>/<issue>-<short-name>`, e.g. `feat/8-bookings`.
- **Never push to `main`.** All changes go through a pull request with ≥ 1 approving review and green CI.
- Commits follow the **Angular convention** (`feat(db): …`, `fix(ui): …`, `test(qa): …`), checked by commitlint.
  The commit or PR that finishes an issue contains `Closes #<n>`.

## 4. Definition of Done

- [ ] Acceptance criteria of the issue met
- [ ] Tests added/updated at the right level, all green in CI
- [ ] No TypeScript errors, no `any` without a comment
- [ ] DB changes: new migration (existing ones untouched), RLS on every new table, pgTAP test for each rule
- [ ] Docs updated if behaviour or API changed
- [ ] PR reviewed and merged, issue closed

## 5. PR checklist (reviewer)

- Linked issue and milestone set
- Commits follow the Angular convention
- Tests cover the happy path **and** the rule being enforced (negative test)
- UI change: screenshot, matches the design mockup
- Security: no service-role key in client code; inputs validated

## 6. Bug reports

Use a GitHub issue with label `bug`: steps to reproduce, expected vs. actual, device/browser, screenshot.
Severity: **blocker** (pilot can't use the app) · **major** (feature wrong) · **minor** (cosmetic).
Blockers found during the pilot are fixed before anything else.
