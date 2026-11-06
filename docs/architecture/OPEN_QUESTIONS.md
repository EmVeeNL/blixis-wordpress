# Open questions

These are decisions to confirm before the owning phase. Current defaults are assumptions, not approved behavior.

| IDs | Decision needed | Working assumption | Phase |
|---|---|---|---|
| Q01–03 | Exact support matrix, package manager, multisite | Tested stable versions, pnpm, no multisite | 01 |
| Q04 | Token configuration persistence | WordPress option plus export | 03 |
| Q05–06 | Gutenberg coexistence and external review | One owner per page; authenticated preview first | 04–05 |
| Q07 | Essential free elements for Wilde Groei | MVP set after discovery | 05 |
| Q08–09 | SEO adapter and client assets/content | Plugin-neutral fields; client approval needed | 07 |
| Q10–11 | API write/public access | Read-only; authenticated by default | 08 |
| Q12–13 | Other-theme support and local fonts | Base-certified v1; local installed fonts | 03–04 |
| Q14 | Multilingual pages | Locale support, no multilingual content in MVP | 07 |
| Q15–16 | Premium policy and accessibility/hosting SLA | Later; WCAG 2.2 AA target | 01, 09 |

Record confirmed choices in an ADR and update affected tasks and tests.
