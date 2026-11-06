---
id: "01-02"
title: "Verify WordPress and toolchain compatibility"
phase: "01"
status: In Review
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-06"
depends_on: ["01-01"]
branch: "docs/01-02-compatibility-spike"
pr_number: 8
pr_url: "https://github.com/EmVeeNL/blixis-wordpress/pull/8"
commit_sha: "f451544f5b41cffcb47d9b0bf794d3c592572661"
merged_at: null
merge_commit_sha: null
started_at: "2026-11-06"
completed_at: null
closed_at: null
blocked_reason: null
blocked_by: []
---

# 01-02 — Verify WordPress and toolchain compatibility

## Description

Test candidate WordPress, PHP, Node, browser, Tailwind v4, and drag-and-drop versions; record support and dependency licenses. The isolated spike and support policy are in PR #8. Real Safari and Edge remain explicit follow-up checks.

## Technical requirements

- Select candidate WordPress/PHP and Node versions, then test the actual REST metadata/revision behavior and PHP integration needed by the planned document model.
- Prove a minimal Tailwind CSS v4 build and nested drag/drop plus keyboard path with candidate dependencies; check package and icon/font licenses.
- Test representative current Chrome, Firefox, Safari, and Edge versions or document any untested combination.
- Replace the provisional [support matrix](../../../development/SUPPORT_MATRIX.md) with exact supported versions, constraints, and CI coverage.

## Acceptance criteria

- [x] Exact versions and a supported/tested matrix are recorded with reproducible commands and environment details.
- [x] Protected post meta, revision behavior, Tailwind output, and drag/drop feasibility have evidence or explicit gaps.
- [x] Dependency and asset licenses are reviewed; unsupported combinations and mitigation are documented.
- [ ] The reviewed PR is merged with test results and task metadata.

## Testing requirements

Run smoke tests for WordPress REST meta and revisions, PHP versions, Node build, Tailwind CSS output, drag/drop pointer and keyboard use, and browser compatibility. Include failed-version and permission cases; record command output or CI links.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `01-01`
- **Branch:** `docs/01-02-compatibility-spike`
- **Commit references:** `f451544f5b41cffcb47d9b0bf794d3c592572661`
- **PR number and URL:** [#8](https://github.com/EmVeeNL/blixis-wordpress/pull/8)
- **Started / completed / closed:** Started 2026-11-06; not completed or closed.
- **Evidence:** [Support matrix](../../../development/SUPPORT_MATRIX.md), [ADR-009](../../../architecture/decisions/ADR-009-compatibility-and-tooling.md), and [spike](../../../../spikes/01-02-compatibility/README.md). Oxlint, type-aware checking, Oxfmt, TypeScript build, and 74-package license check passed locally on 2026-11-06. Real Safari and Edge are assigned to 06-04.
- **Status:** In Review. Merge evidence is still required for Done. Follow the [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-06 | Backlog → Ready | Task `01-01` approved and merged in PR [#6](https://github.com/EmVeeNL/blixis-wordpress/pull/6) as `1c51d1b`; owner EmVeeNL and acceptance criteria are defined. |
| 2026-11-06 | Ready → Busy | Branch `docs/01-02-compatibility-spike` created; compatibility spike started |
| 2026-11-06 | Busy → In Review | PR [#8](https://github.com/EmVeeNL/blixis-wordpress/pull/8), commit `f451544`; WordPress matrix, Node matrix, and browser tests recorded in the spike results. Owner decisions pending; real Safari and Edge not run |
| 2026-11-06 | In Review, decisions resolved | Owner authorized GPL-2.0-or-later for code/docs and publication of both project images; delegated WordPress 7.0/PHP 8.3/Node 26 targets; explicitly chose Oxlint and Oxfmt for TypeScript 7. Spike lint, format, build, and license checks passed; Safari and Edge remain scheduled in 06-04. |
