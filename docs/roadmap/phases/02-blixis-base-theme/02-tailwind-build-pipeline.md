---
id: "02-02"
title: "Build the Tailwind CSS v4 pipeline"
phase: "02"
status: Busy
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-07"
depends_on: ["02-01"]
branch: "feat/02-02-tailwind-pipeline"
pr_number: null
pr_url: null
commit_sha: null
merged_at: null
merge_commit_sha: null
started_at: "2026-11-07"
completed_at: null
closed_at: null
blocked_reason: null
blocked_by: []
---

# 02-02 — Build the Tailwind CSS v4 pipeline

## Description

Compile CSS-first @import and @theme sources; scan known templates and editor sources; define production sourcemap and output policy. The implementation compiles neutral Base utilities from explicitly reviewed theme sources. The future Blocks editor and element registry do not exist yet and are not scanned; their utilities will ship with Blocks. Runtime token emission and editor token parity remain task 02-03.

## Technical requirements

- Use the module boundaries and contracts in [Architecture](../../../architecture/ARCHITECTURE.md).
- Validate server-side data and permissions where applicable; document schema or ADR changes.
- Preserve existing content and provide a migration or rollback plan for contract changes.

## Acceptance criteria

- [x] CSS-first Tailwind 4.3.5 uses the accepted inline token mapping and fixed breakpoints, utilities only, no preflight or cascade layer, and explicitly reviewed sources.
- [x] A supported Node 26.13.0/pnpm 12.18.0 frozen install builds deterministic committed minified CSS without a source map, under the 40 KiB budget.
- [x] WordPress loads the parent-owned build after global/Base styles with a content hash; a child file cannot shadow it; production/local missing-build paths are tested.
- [x] Compiled CSS is registered for the editor; full browser/editor parity and runtime tokens are explicitly deferred. Source exclusion, reduced-motion variant generation, contract mapping, and bundle limits are tested; no full accessibility or performance audit is claimed.
- [x] Focused tests, CI enforcement, build/deployment and rollback documentation are included.
- [ ] A reviewed PR is merged, with evidence and metadata recorded here.

## Testing requirements

Clean build, CSS snapshots, expected utility presence, and bundle size check. Include negative permission, invalid-input, version, and regression cases where relevant. Record exact commands and results in the PR.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `02-01`
- **Branch:** `feat/02-02-tailwind-pipeline`.
- **Commit references:** None.
- **PR number and URL:** None.
- **Started / completed / closed:** Started 2026-11-07; completion and closure not recorded.
- **Status:** Busy. Three isolated implementation commits were integrated and independently reviewed; local validation passed and a PR is being prepared. Follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-07 | Backlog → Ready | Dependency `02-01` completed in [PR #18](https://github.com/EmVeeNL/blixis-wordpress/pull/18), merge `b922e1b`; owner and build acceptance criteria are recorded. |
| 2026-11-07 | Ready → Busy | Integration branch `feat/02-02-tailwind-pipeline` started from synchronized `origin/main` at `708a077`; three agents own separate worktrees and file sets. |

## Integration review and evidence

The independent integration review added contract/pin/no-layer assertions, a real excluded-source injection and repeat-build comparison, and disposable WordPress regression cases for parent/child asset ownership, dependency ordering, absent global styles, and production/local missing builds. It corrected relative editor asset registration, which could otherwise load a child file at the same path.

Local evidence (2026-11-07): isolated Node 26.13.0 and pnpm 12.18.0, `pnpm install --frozen-lockfile`, `pnpm build`, and `node tests/02-02/check.mjs` passed; output is 411 bytes and unchanged from the committed build. `bash tests/02-01/run.sh '7.0.8 8.3 pass'` passed against a disposable MariaDB fixture, including the new asset checks. WordPress also resolved the parent CSS bytes through `get_block_editor_theme_styles()` for both parent and child themes. Deliberate empty-output, cascade-layer, and source-map mutations were rejected by the CSS check. PHPCS, documentation validation, actionlint, and ShellCheck passed. CI will verify the full version matrix and required checks before merge.

No shared WordPress site was changed. No browser-level CSS, editor iframe, full accessibility, or Core Web Vitals audit was performed for this pipeline task. Rollback is the prior theme commit and its CSS; no database schema or content migration is involved. The 40 KiB gate is a build budget, not a measured page-performance claim.
