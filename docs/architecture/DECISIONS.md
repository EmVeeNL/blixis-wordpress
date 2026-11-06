# Architecture decisions

## Implemented repository decisions

- **R-001 — Separate source and runtime:** source is now at `~/Developer/WordPress/blixis-wordpress`; WordPress remains at `~/Sites/blixis`, linked only for the Blixis theme/plugin. Core, uploads, configuration, and database were not moved.
- **R-002 — Stable Compose identity:** `name: blixis` preserves the existing MariaDB volume identity across checkout locations.
- **R-003 — Block parent theme:** Base uses WordPress block-theme structures. Token generation and child-theme behavior remain planned.
- **R-004 — Compatibility baseline:** [ADR-009](decisions/ADR-009-compatibility-and-tooling.md) records approved target floors and the TypeScript 7, Oxlint, and Oxfmt choice. CI enforcement exists; theme and plugin headers will be aligned in task 02-01.

These replace the location-specific wording in the earlier repository notes. ADR-001–007 are accepted **design decisions** after the delegated 01-05 review; acceptance does not claim product implementation. ADR-008 remains proposed.

| ADR | Status | Accepted direction or open proposal | Evidence and follow-up |
|---|---|---|---|
| [001](decisions/ADR-001-modular-wordpress-architecture.md) | Accepted design | Separately versioned Base, child theme, Blocks, and API boundaries | Registry, renderer, tokens, and compiled utilities ship together inside Blocks |
| [002](decisions/ADR-002-tailwind-token-model.md) | Accepted design | Tailwind v4 build names, validated runtime values, fixed breakpoints | PHP generates; Site Editor is not a token source |
| [003](decisions/ADR-003-versioned-content-schema.md) | Accepted design | Versioned protected document plus safe `post_content` projection | Guarded writes, revision and migration contracts; `documentId` stays non-authoritative in v1 |
| [004](decisions/ADR-004-server-rendering.md) | Accepted design | PHP public rendering; React admin editor | Password guard, late content hook, parity fixtures |
| [005](decisions/ADR-005-review-security.md) | Accepted design | Authenticated preview only for MVP | External links require a later decision |
| [006](decisions/ADR-006-editor-and-gutenberg.md) | Accepted design | One editor owner per page, determined by document presence | Conversion and non-REST write safeguards remain to build |
| [007](decisions/ADR-007-api-authentication.md) | Accepted design | Scoped, hashed API keys and published-only reads | Dedicated external pepper required in production; implementation in phase 08 |
| [008](decisions/ADR-008-repository-visibility.md) | Proposed | Repository visibility policy | No new 01-05 evidence; decide before any visibility change |

The [01-05 integration note](reviews/01-05-integration.md) records the 16 decisions and remaining implementation gaps. Track unresolved product questions in [Open questions](OPEN_QUESTIONS.md).
