# Open questions

These are decisions to confirm before the owning phase. Current defaults are assumptions, not approved behavior.

| ID | Decision needed | Working assumption | Owner | Decision point |
|---|---|---|---|---|
| Q01 | Exact support matrix | Tested stable versions | Michael | 01-02: compatibility results |
| Q02 | Package manager | pnpm | Michael | 01-03: before workspaces are added |
| Q03 | Multisite | No multisite | Michael | 01-01: owner scope approval |
| Q04 | Token configuration persistence | WordPress option plus export | Michael | 03-05: before persistence is built |
| Q05 | Gutenberg coexistence | One owner per page | Michael | 04-01: before the editor is mounted |
| Q06 | External review | Authenticated preview first | Michael | 05-05: before preview is built |
| Q07 | Essential free elements for Wilde Groei | The 20-element MVP set; gaps found in 07-01 become additions | Michael | 05-02: before elements are built; validated in 07-01 |
| Q08 | SEO adapter | Plugin-neutral fields | Michael | 07-04: before SEO is configured |
| Q09 | Client assets and content | Client approval needed | Michael | 07-01: client discovery |
| Q10 | API write access | Read-only | Michael | 08-01: API contract |
| Q11 | API public access | Authenticated by default | Michael | 08-01: API contract |
| Q12 | Other-theme support | Base-certified v1 | Michael | 04-01: before the editor is mounted |
| Q13 | Local fonts | Local installed fonts | Michael | 03-04: before font management is built |
| Q14 | Multilingual pages | Locale support, no multilingual content in MVP | Michael | 07-01: client discovery |
| Q15 | Premium policy | Later | Michael | 09-02: entitlement design |
| Q16 | Accessibility target and hosting SLA | WCAG 2.2 AA target; SLA later | Michael | Target: 01-01 owner scope approval. SLA: 07-05 handover |
| Q17 | Validation of the 15-minute first-page goal | Not a release gate until validated with users | Michael | 06-04: integration regression |

Record confirmed choices in an ADR and update affected tasks and tests.
