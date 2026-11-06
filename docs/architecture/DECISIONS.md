# Architecture decisions

## Implemented repository decisions

- **R-001 — Separate source and runtime:** source is now at `~/Developer/WordPress/blixis-wordpress`; WordPress remains at `~/Sites/blixis`, linked only for the Blixis theme/plugin. Core, uploads, configuration, and database were not moved.
- **R-002 — Stable Compose identity:** `name: blixis` preserves the existing MariaDB volume identity across checkout locations.
- **R-003 — Block parent theme:** Base uses WordPress block-theme structures. Token generation and child-theme behavior remain planned.
- **R-004 — Compatibility baseline:** [ADR-009](decisions/ADR-009-compatibility-and-tooling.md) records approved target floors and the TypeScript 7, Oxlint, and Oxfmt choice. Header and CI enforcement remain scheduled work.

These replace the location-specific wording in the earlier repository notes. The downloaded ADRs below are **proposals or working assumptions**; `Accepted (provisional)` is not owner approval.

| ADR | Status | Decision under review |
|---|---|---|
| [001](decisions/ADR-001-modular-wordpress-architecture.md) | Accepted (provisional) | Separate Base, child theme, Blocks, and API |
| [002](decisions/ADR-002-tailwind-token-model.md) | Accepted (provisional) | Tailwind v4 build tokens and validated runtime values |
| [003](decisions/ADR-003-versioned-content-schema.md) | Accepted (provisional) | Versioned JSON in protected post meta |
| [004](decisions/ADR-004-server-rendering.md) | Accepted (provisional) | PHP public rendering; React admin editor |
| [005](decisions/ADR-005-review-security.md) | Proposed | Authenticated preview first |
| [006](decisions/ADR-006-editor-and-gutenberg.md) | Proposed | One editor owner per page |
| [007](decisions/ADR-007-api-authentication.md) | Proposed | Hashed scoped API keys |
| [008](decisions/ADR-008-repository-visibility.md) | Proposed | Repository visibility policy |

Accept, amend, supersede, or reject each after owner review and implementation evidence. Track unresolved product questions in [Open questions](OPEN_QUESTIONS.md).
