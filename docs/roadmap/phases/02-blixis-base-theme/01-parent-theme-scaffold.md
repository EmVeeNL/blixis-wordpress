---
id: "02-01"
title: "Build the Blixis Base parent theme"
phase: "02"
status: Done
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-07"
depends_on: ["01-05"]
branch: "feat/02-01-parent-theme"
pr_number: 18
pr_url: "https://github.com/EmVeeNL/blixis-wordpress/pull/18"
commit_sha: "3659b42ba9ad019bdbfba3c9a8ac519802c610be"
merged_at: "2026-11-07"
merge_commit_sha: "b922e1b22c78d379b8d43a84f04586f80671f8ee"
started_at: "2026-11-07"
completed_at: "2026-11-07"
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

- [x] Base and Blocks activate on WordPress 7.0/7.1 with PHP 8.3/8.5 and refuse activation below the WordPress 7.0 and PHP 8.3 floors.
- [x] Neutral Base setup registers theme supports and its versioned parent stylesheet; contract preset slugs resolve and published singular posts/pages render full content.
- [x] Singular output has one main landmark and one h1; anonymous draft and password-protected content remain hidden; no Blixis PHP errors occur in fixtures.
- [x] Focused tests and documentation are included; PHP syntax/PHPCS, documentation validation, ShellCheck and actionlint pass locally; the harness detects deliberately missing content.
- [x] All required CI checks pass on the reviewed PR head.
- [x] A reviewed PR is merged, with evidence and metadata recorded here.

These criteria scope the generic planning checklist to this scaffold's activation and template smoke tests. Full template keyboard/responsive/visual accessibility work belongs to [02-04](04-semantic-templates.md); browser compatibility and measured performance remain phase 06 verification, including [06-04](../06-hardening-beta/04-integration-regression.md).

## Testing requirements

Activate in a disposable WordPress fixture; run PHP lint and template smoke tests. Include negative permission, invalid-input, version, and regression cases where relevant. Record exact commands and results in the PR.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `01-05`
- **Branch:** `feat/02-01-parent-theme`.
- **Commit references:** `f02ec6e`, `6c83206`, `98f28bd`, review `d2a5f3d`.
- **PR number and URL:** [#18](https://github.com/EmVeeNL/blixis-wordpress/pull/18).
- **Started / completed / closed:** Started 2026-11-07; completed 2026-11-07; closure not recorded.
- **Status:** Done. PR #18 merged as `b922e1b` after all 16 required checks passed on `3659b42`. Combined six-case disposable matrix passed 198 assertions; PHP lint/PHPCS, docs, ShellCheck and actionlint passed. Deliberate missing content fails the harness. Browser visual/accessibility coverage remains follow-up work. Follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-06 | Backlog → Ready | Dependency `01-05` completed in [PR #16](https://github.com/EmVeeNL/blixis-wordpress/pull/16), merged as `06b1157`; owner and acceptance criteria are recorded. |
| 2026-11-07 | Ready → Busy | Integration branch `feat/02-01-parent-theme` started from synchronized `origin/main` at `16b0eda`; three agents own separate worktrees and file sets. |
| 2026-11-07 | Busy → In Review | [PR #18](https://github.com/EmVeeNL/blixis-wordpress/pull/18); independent combined-branch review `d2a5f3d`; 198 assertions passed, deliberate-fault detection verified. |
| 2026-11-07 | In Review → In Review | Replaced generic planning acceptance text with concrete scaffold activation, rendering, access-control, quality, CI and merge gates; full browser/visual and measured performance work stays in later tasks. |
| 2026-11-07 | In Review → Done | [PR #18](https://github.com/EmVeeNL/blixis-wordpress/pull/18) independently reviewed and merged as `b922e1b22c78d379b8d43a84f04586f80671f8ee`; all 16 required checks passed on `3659b42`, including the [Quality run](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42358864582). |
