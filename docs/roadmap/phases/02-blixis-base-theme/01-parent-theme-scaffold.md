---
id: "02-01"
title: "Build the Blixis Base parent theme"
phase: "02"
status: In Review
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-07"
depends_on: ["01-05"]
branch: "feat/02-01-parent-theme"
pr_number: 18
pr_url: "https://github.com/EmVeeNL/blixis-wordpress/pull/18"
commit_sha: "d2a5f3d"
merged_at: null
merge_commit_sha: null
started_at: "2026-11-07"
completed_at: null
closed_at: null
blocked_reason: null
blocked_by: []
---

# 02-01 — Build the Blixis Base parent theme

## Description

Complete theme metadata, enqueue hooks, theme support, template structure, and WordPress integration without site branding. The implementation now includes neutral setup and stylesheet hooks, token-aligned presets, singular rendering, and a disposable integration harness.

## Technical requirements

- Use the module boundaries and contracts in [Architecture](../../../architecture/ARCHITECTURE.md).
- Validate server-side data and permissions where applicable; document schema or ADR changes.
- Preserve existing content and provide a migration or rollback plan for contract changes.
- Add a singular template that prints `post-content`, and align Base preset slugs with the [token contract](../../../contracts/tokens/README.md); review 01-05 found Base cannot show a rendered page and that a `background` preset is orphaned.
- Align the theme and plugin `Requires at least` and `Requires PHP` headers with the approved WordPress 7.0 and PHP 8.3 support floors; retest activation refusal below those floors in a disposable fixture.

## Acceptance criteria

- [ ] The described capability works in the intended WordPress and browser environments.
- [ ] Relevant security, accessibility, and performance requirements are verified.
- [x] Tests and documentation are included with the implementation.
- [ ] A reviewed PR is merged, with evidence and metadata recorded here.

## Testing requirements

Activate in a disposable WordPress fixture; run PHP lint and template smoke tests. Include negative permission, invalid-input, version, and regression cases where relevant. Record exact commands and results in the PR.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `01-05`
- **Branch:** `feat/02-01-parent-theme`.
- **Commit references:** `f02ec6e`, `6c83206`, `98f28bd`, review `d2a5f3d`.
- **PR number and URL:** [#18](https://github.com/EmVeeNL/blixis-wordpress/pull/18).
- **Started / completed / closed:** Started 2026-11-07; completion and closure not recorded.
- **Status:** In Review. Combined six-case disposable matrix passed 198 assertions; PHP lint/PHPCS, docs, ShellCheck and actionlint passed. Deliberate missing content fails the harness. Browser visual/accessibility coverage remains follow-up work. Follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-06 | Backlog → Ready | Dependency `01-05` completed in [PR #16](https://github.com/EmVeeNL/blixis-wordpress/pull/16), merged as `06b1157`; owner and acceptance criteria are recorded. |
| 2026-11-07 | Ready → Busy | Integration branch `feat/02-01-parent-theme` started from synchronized `origin/main` at `16b0eda`; three agents own separate worktrees and file sets. |
| 2026-11-07 | Busy → In Review | [PR #18](https://github.com/EmVeeNL/blixis-wordpress/pull/18); independent combined-branch review `d2a5f3d`; 198 assertions passed, deliberate-fault detection verified. |
