---
id: "03-02"
title: "Define the token schema and CSS export"
phase: "03"
status: Done
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-09"
depends_on: ["03-01"]
branch: "feat/03-02-token-schema"
pr_number: 34
pr_url: "https://github.com/EmVeeNL/blixis-wordpress/pull/34"
commit_sha: "66262cb"
merged_at: "2026-11-09T09:55:53Z"
merge_commit_sha: "00d2bd80494cec832cb1d79725cabca87a48a49d"
started_at: "2026-11-09"
completed_at: "2026-11-09"
closed_at: null
blocked_reason: null
blocked_by: []
---

# 03-02 — Define the token schema and CSS export

## Description

Implement matching server/client validators for colors, fonts, spacing, radius, and layout; generate safe CSS variables. Implemented against [token contract v1](../../../contracts/tokens/README.md); see [token validation](../../../development/TOKENS.md). Persistence and preview belong to 03-05.

## Technical requirements

- Use the module boundaries and contracts in [Architecture](../../../architecture/ARCHITECTURE.md).
- Validate server-side data and permissions where applicable; document schema or ADR changes.
- Preserve existing content and provide a migration or rollback plan for contract changes.

## Acceptance criteria

- [x] A server validator in Blixis Blocks and a client validator in `packages/tokens` implement `BlixisThemeConfig` v1 and return identical `{code, path}` errors for every valid, invalid, and raw-byte contract fixture.
- [x] The PHP generator produces the golden stylesheets, config hash, and CSS cache key, and the client's preview properties equal the server's custom properties.
- [x] CSS injection fixtures are refused, no generated declaration can leave its rule, and a seeded property-based test finds no difference between the validators across 6,000 mutated inputs.
- [x] Results are byte-identical on PHP 8.3, 8.4, and 8.5, and Blixis Blocks still loads cleanly in disposable WordPress 7.0 and 7.1.
- [x] Tests and documentation ship with the change, and required CI runs them.
- [x] A reviewed PR is merged, with evidence and metadata recorded here.

## Testing requirements

Property-based validation, malformed-value cases, and CSS injection fixtures. Include negative permission, invalid-input, version, and regression cases where relevant. Record exact commands and results in the PR.

## Verification evidence

- `pnpm run test` in `packages/tokens`: 9 tests pass. They cover 11 valid, 93 invalid, and 22 raw-byte fixtures in both validators; golden stylesheets, hash, canonical form, and cache key; preview parity; declaration safety; and 6,000 property-based cases with no difference.
- The PHP results for every valid and invalid fixture hash identically on PHP 8.3, 8.4, and 8.5 (`090e26c6fb1724e2`).
- Deliberate faults: dropping the strict `$` modifier in PHP failed 2 tests; skipping colour lower-casing in TypeScript failed 1; changing the stylesheet spacing failed 1.
- `tests/02-01/run.sh` (7.1.4/PHP 8.3), `tests/02-03/run.sh`, and `tests/03-01/run.sh` (7.0.8/PHP 8.5) pass with the new files loaded; PHPCS, typecheck, Oxlint, Oxfmt, and the docs check pass.
- No UI, route, or storage is added, so there is no new permission surface. No page-performance measurement is claimed.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `03-01`
- **Branch:** `feat/03-02-token-schema`.
- **Commit references:** `66262cb` (implementation); merge `00d2bd80494cec832cb1d79725cabca87a48a49d`.
- **PR number and URL:** [#34](https://github.com/EmVeeNL/blixis-wordpress/pull/34).
- **Started / completed / closed:** Started and completed 2026-11-09; not released.
- **Status:** Done. PR #34 merged after all 18 required checks passed. Update frontmatter and history on every transition; follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-09 | Backlog → Ready | Dependency `03-01` completed in [PR #32](https://github.com/EmVeeNL/blixis-wordpress/pull/32), merge `963fcc3`; concrete criteria written from token contract v1; Michael asked to continue with the next task. |
| 2026-11-09 | Ready → Busy | Branch `feat/03-02-token-schema` from `4440a97`. |
| 2026-11-09 | Busy → In Review | [PR #34](https://github.com/EmVeeNL/blixis-wordpress/pull/34), commit `66262cb`; evidence above. |
| 2026-11-09 | In Review → Done | [PR #34](https://github.com/EmVeeNL/blixis-wordpress/pull/34) squash-merged as `00d2bd80494cec832cb1d79725cabca87a48a49d` at 09:55:53 UTC after all 18 required checks passed; CI ran the token tests with 9 passed and none skipped. |
