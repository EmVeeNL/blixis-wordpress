---
id: "02-04"
title: "Create semantic WordPress templates"
phase: "02"
status: In Review
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-07"
depends_on: ["02-03"]
branch: "feat/02-04-semantic-template-integration"
pr_number: 24
pr_url: "https://github.com/EmVeeNL/blixis-wordpress/pull/24"
commit_sha: "d11f059"
merged_at: null
merge_commit_sha: null
started_at: "2026-11-07"
completed_at: null
closed_at: null
blocked_reason: null
blocked_by: []
---

# 02-04 — Create semantic WordPress templates

## Description

Add page, single, archive, search, and 404 templates with header/footer parts, landmarks, skip link, responsive layout, and translations. Implemented with neutral block templates, translated patterns, and a disposable WordPress accessibility harness.

## Technical requirements

- Use the module boundaries and contracts in [Architecture](../../../architecture/ARCHITECTURE.md).
- Validate server-side data and permissions where applicable; document schema or ADR changes.
- Preserve existing content and provide a migration or rollback plan for contract changes.

## Acceptance criteria

- [ ] The described capability works in the intended WordPress and browser environments.
- [ ] Relevant security, accessibility, and performance requirements are verified.
- [ ] Tests and documentation are included with the implementation.
- [ ] A reviewed PR is merged, with evidence and metadata recorded here.

## Testing requirements

Template snapshots, keyboard checks, and automated accessibility audit. Include negative permission, invalid-input, version, and regression cases where relevant. Record exact commands and results in the PR.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `02-03`
- **Branch:** `feat/02-04-semantic-template-integration`.
- **Commit references:** `d11f059` (reviewed integration).
- **PR number and URL:** [#24](https://github.com/EmVeeNL/blixis-wordpress/pull/24).
- **Started / completed / closed:** Started 2026-11-07; not completed or closed.
- **Status:** In Review. Integration review and local checks passed; full CI matrix runs in PR #24.

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-07 | Backlog → Ready | Dependency 02-03 completed in [PR #22](https://github.com/EmVeeNL/blixis-wordpress/pull/22), merge `da659327`; semantic-template scope, testing requirements, and owner are recorded. |
| 2026-11-07 | Ready → Busy | Integrated template, part, and test contributions on `feat/02-04-semantic-template-integration`; reviewed and corrected landmark, navigation, focus, target-size, and reflow defects. |

| 2026-11-07 | Busy → In Review | [PR #24](https://github.com/EmVeeNL/blixis-wordpress/pull/24), integration `d11f059`, 1,062 passing browser assertions and static/build/PHP/docs checks. |

## Validation evidence

- `node tests/02-04/static.mjs` and `node --test tests/02-04/static.test.mjs`: passed, including 11 negative controls.
- `tests/02-04/run.sh --update-snapshots --out /tmp/blixis-0204-final "7.1.4 8.3"`: 1,062 checks passed, zero failed; Chromium, 21 routes plus Dutch/Arabic variants, three viewport widths, keyboard and axe-core checks. Reviewed page screenshot and 21 semantic snapshots.
- Workspace build, typecheck, lint, format checks, PHP_CodeSniffer, documentation validation, and theme.json parity passed.
- CI additionally runs Firefox and WordPress 7.0.8/PHP 8.5. No shared runtime files or data were touched.
- Rollback: revert the theme/templates and committed CSS; no database or document migrations.
- Limits: automated accessibility does not replace screen-reader/user testing; theme catalogs are not bundled; empty WordPress titles retain Core's no-heading behavior. See [test details](../../../development/TESTING_02-04.md).
