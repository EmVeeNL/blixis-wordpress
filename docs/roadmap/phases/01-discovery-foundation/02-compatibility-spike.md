---
id: "01-02"
title: "Verify WordPress and toolchain compatibility"
phase: "01"
status: Ready
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-06"
depends_on: ["01-01"]
branch: null
pr_number: null
pr_url: null
commit_sha: null
merged_at: null
merge_commit_sha: null
started_at: null
completed_at: null
closed_at: null
blocked_reason: null
blocked_by: []
---

# 01-02 — Verify WordPress and toolchain compatibility

## Description

Test candidate WordPress, PHP, Node, browser, Tailwind v4, and drag-and-drop versions; record support and dependency licenses. This is planned work; no implementation or PR is claimed.

## Technical requirements

- Select candidate WordPress/PHP and Node versions, then test the actual REST metadata/revision behavior and PHP integration needed by the planned document model.
- Prove a minimal Tailwind CSS v4 build and nested drag/drop plus keyboard path with candidate dependencies; check package and icon/font licenses.
- Test representative current Chrome, Firefox, Safari, and Edge versions or document any untested combination.
- Replace the provisional [support matrix](../../../development/SUPPORT_MATRIX.md) with exact supported versions, constraints, and CI coverage.

## Acceptance criteria

- [ ] Exact versions and a supported/tested matrix are recorded with reproducible commands and environment details.
- [ ] Protected post meta, revision behavior, Tailwind output, and drag/drop feasibility have evidence or explicit gaps.
- [ ] Dependency and asset licenses are reviewed; unsupported combinations and mitigation are documented.
- [ ] The reviewed PR is merged with test results and task metadata.

## Testing requirements

Run smoke tests for WordPress REST meta and revisions, PHP versions, Node build, Tailwind CSS output, drag/drop pointer and keyboard use, and browser compatibility. Include failed-version and permission cases; record command output or CI links.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `01-01`
- **Branch:** Not created.
- **Commit references:** None.
- **PR number and URL:** None.
- **Started / completed / closed:** Not recorded.
- **Status:** Ready. Owner and acceptance criteria are defined; dependency `01-01` is Done. Follow the [status workflow](../../../development/STATUS_WORKFLOW.md) before starting work.

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-06 | Backlog → Ready | Task `01-01` approved and merged in PR [#6](https://github.com/EmVeeNL/blixis-wordpress/pull/6) as `1c51d1b`; owner EmVeeNL and acceptance criteria are defined. |
