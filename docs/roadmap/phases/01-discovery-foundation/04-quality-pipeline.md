---
id: "01-04"
title: "Extend the quality pipeline"
phase: "01"
status: Busy
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-06"
depends_on: ["01-03"]
branch: "ci/01-04-quality-pipeline"
pr_number: null
pr_url: null
commit_sha: null
merged_at: null
merge_commit_sha: null
started_at: "2026-11-06"
completed_at: null
closed_at: null
blocked_reason: null
blocked_by: []
---

# 01-04 — Extend the quality pipeline

## Description

Add CI jobs for implemented PHP and TypeScript lint, type checking, tests, build, dependency and secret scans; keep workflow permissions minimal. This is planned work; no implementation or PR is claimed.

## Technical requirements

- Preserve the existing `syntax` and `docs` jobs; add PHP, TypeScript, build, test, dependency, and secret checks only for implemented code and scripts.
- Use pinned actions, least-privilege workflow permissions, deterministic dependencies, and appropriately scoped CI matrices.
- Make required checks correspond to jobs that actually exist; document branch-protection requirements and review policy.
- Give each check a failure mode and clear diagnostic output so PR authors can repair it.
- Use Oxlint with `oxlint-tsgolint` for TypeScript 7 linting and Oxfmt for formatting. Pin versions, run type-aware lint plus type checking, and test both failure paths before making CI checks required. The 01-02 spike is feasibility evidence, not CI coverage.

## Acceptance criteria

- [ ] Every implemented code path has relevant reproducible CI checks; no job advertises an absent test suite.
- [ ] Deliberate syntax, documentation, lint, and test failures cause the intended PR checks to fail, then pass when fixed.
- [ ] Workflow permissions and dependency versions are reviewed, and branch protection requires the agreed checks.
- [ ] The reviewed PR is merged with CI run links and task metadata.

## Testing requirements

Use temporary test branches or a safe fixture to trigger each check's failure path, then verify a passing run. Inspect workflow permissions, action pinning, check names, and branch protection. Record run URLs and cleanup.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `01-03`
- **Branch:** `ci/01-04-quality-pipeline`
- **Commit references:** None.
- **PR number and URL:** None.
- **Started / completed / closed:** Started 2026-11-06; not completed or closed.
- **Status:** Busy. Follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-06 | Backlog → Ready | Dependency `01-03` was completed in PR [#10](https://github.com/EmVeeNL/blixis-wordpress/pull/10), merged as `fad5c11819fce9bc92990d2266d91caec85bea2c`; owner and acceptance criteria are recorded. |
| 2026-11-06 | Ready → Busy | Branch `ci/01-04-quality-pipeline` created from `6662c6b`; CI jobs started |
