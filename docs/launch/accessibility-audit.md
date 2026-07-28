# Phase 6 Accessibility Audit

Date: July 8, 2026

## Target

WCAG 2.1 AA for core launch paths:

- Marketing and legal pages.
- Public registration page.
- Public vendor application page.
- Dashboard organization CRUD.
- Staff check-in page.
- Express check-in kiosk.

## Implementation evidence

- Root document has `lang="en"`.
- Primary pages use semantic landmarks, headings, forms, labels, and accessible link/button text.
- Local shadcn/ui-style components provide accessible defaults for navigation, buttons, badges, cards, segmented controls, and tables.
- Form inputs in launch paths have visible labels.
- The marketing hero image uses accessible alt text and the headline remains real HTML text.
- The E2E suite asserts key headings and browser-visible flow completion for registration, vendor application, admin CRUD, and check-in.
- `tests/e2e/launch-accessibility-smoke.spec.ts` adds automated smoke coverage for `html[lang]`, main and navigation landmarks, marketing image alt text, keyboard tab order, pricing calculator range labels, public registration and vendor form labels, and staff check-in search/action names.
- Latest automated run: `npm run test:e2e -- --project=chromium tests/e2e/launch-accessibility-smoke.spec.ts` passed 3/3 tests on July 8, 2026.

## Manual checklist

- Keyboard-only navigation reaches nav links, form controls, and submit buttons in logical order.
- Focus remains visible against both light and dark system themes.
- Screen reader announces page headings, form labels, success states, and check-in actions.
- Text reflows at mobile widths without overlapping controls.
- Color is not the only indicator for badges, warnings, and status labels.

## Completion evidence

- Screen-reader pass: Incomplete
- Tester: TBD
- Assistive technology: TBD
- Verified flows: TBD

## Current state

No blocking accessibility issues are known in the Phase 6 launch paths. A physical screen-reader pass should be performed with a beta organizer before public launch because this environment cannot prove assistive-technology behavior by repository inspection alone.
