# Open questions

These are decisions to confirm before the owning phase. Current defaults are assumptions, not approved behavior.

| ID | Decision needed | Working assumption | Owner | Decision point |
|---|---|---|---|---|
| Q02 | Package manager | pnpm 12.18.0, tested in task 01-03 | Michael | 01-03: owner review of its PR |
| Q04 | Token configuration persistence | WordPress option plus export | Michael | 03-05: before persistence is built |
| Q05 | Gutenberg coexistence | One owner per page | Michael | 04-01: before the editor is mounted |
| Q06 | External review | Authenticated preview first | Michael | 05-05: before preview is built |
| Q08 | SEO adapter | Plugin-neutral fields | Michael | 07-04: before SEO is configured |
| Q09 | Client assets and content | Client approval needed | Michael | 07-01: client discovery |
| Q10 | API write access | Read-only | Michael | 08-01: API contract |
| Q11 | API public access | Authenticated by default | Michael | 08-01: API contract |
| Q12 | Other-theme support | Base-certified v1 | Michael | 04-01: before the editor is mounted |
| Q13 | Local fonts | Local installed fonts | Michael | 03-04: before font management is built |
| Q14 | Multilingual pages | Locale support, no multilingual content in MVP | Michael | 07-01: client discovery |
| Q15 | Premium policy | Later | Michael | 09-02: entitlement design |
| Q16 | Hosting SLA | Not fixed in the product plan | Michael | 07-05: launch and handover |
| Q17 | Validation of the 15-minute first-page goal | Not a release gate until validated with users | Michael | 06-04: integration regression |

Record confirmed choices in an ADR and update affected tasks and tests.

## Confirmed planning decisions

| ID | Decision | Evidence and follow-up |
|---|---|---|
| Q01 | Target WordPress 7.0 and 7.1, PHP 8.3–8.5, MariaDB 11.4, and Node 26 LTS (pinned 26.13.0). Use TypeScript 7.0.x with Oxlint, `oxlint-tsgolint`, and Oxfmt. | Task 01-02 [support matrix](../development/SUPPORT_MATRIX.md) and isolated spike; owner delegated support floors and explicitly chose Oxc tools. Theme/plugin headers change in 02-01; CI enforcement in 01-04. |
| Q03 | The first release line is single-site WordPress v1.0.x; Multisite support is planned for v1.1. | Michael's 2026-11-06 owner instruction; [task 09-06](../roadmap/phases/09-future-extensions/06-multisite-support.md) defines the work. |
| Q07 | Keep the 20 free elements as the initial baseline. Review a preliminary Wilde Groei page and element inventory before task 05-02; later client findings require an explicit scope change. | Owner-delegated scope review in task 01-01. Full client discovery remains task 07-01. |
| Q16 target | WCAG 2.2 AA is the accessibility target for the editor and public output. | Owner-delegated scope review in task 01-01; the hosting SLA remains open above. |
