# Architecture decisions

## Implemented repository decisions

- **R-001 — Separate source and runtime:** source is now at `~/Developer/WordPress/blixis-wordpress`; WordPress remains at `~/Sites/blixis`, linked only for the Blixis theme/plugin. Core, uploads, configuration, and database were not moved.
- **R-002 — Stable Compose identity:** `name: blixis` preserves the existing MariaDB volume identity across checkout locations.
- **R-003 — Block parent theme:** Base uses WordPress block-theme structures. Token generation and child-theme behavior remain planned.
- **R-004 — Compatibility baseline:** [ADR-009](decisions/ADR-009-compatibility-and-tooling.md) records approved target floors and the TypeScript 7, Oxlint, and Oxfmt choice. Header and CI enforcement remain scheduled work.

These replace the location-specific wording in the earlier repository notes. The downloaded ADRs below are **proposals or working assumptions**; `Accepted (provisional)` is not owner approval.

| ADR | Status | Decision under review | 01-05 recommendation, owner decision pending |
|---|---|---|---|
| [001](decisions/ADR-001-modular-wordpress-architecture.md) | Accepted (provisional) | Separate Base, child theme, Blocks, and API | Accept with amendments |
| [002](decisions/ADR-002-tailwind-token-model.md) | Accepted (provisional) | Tailwind v4 build tokens and validated runtime values | Accept with amendments |
| [003](decisions/ADR-003-versioned-content-schema.md) | Accepted (provisional) | Versioned JSON in protected post meta | Accept with amendments |
| [004](decisions/ADR-004-server-rendering.md) | Accepted (provisional) | PHP public rendering; React admin editor | Accept with amendments |
| [005](decisions/ADR-005-review-security.md) | Proposed | Authenticated preview first | Accept with amendments |
| [006](decisions/ADR-006-editor-and-gutenberg.md) | Proposed | One editor owner per page | Accept with amendment |
| [007](decisions/ADR-007-api-authentication.md) | Proposed | Hashed scoped API keys | Accept with amendments |
| [008](decisions/ADR-008-repository-visibility.md) | Proposed | Repository visibility policy | Keep Proposed; no new evidence |

Accept, amend, supersede, or reject each after owner review and implementation evidence. The [01-05 integration note](reviews/01-05-integration.md) lists the amendments and the decisions needed. Track unresolved product questions in [Open questions](OPEN_QUESTIONS.md).
