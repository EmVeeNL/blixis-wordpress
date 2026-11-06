---
id: "01-04"
title: "Extend the quality pipeline"
phase: "01"
status: Backlog
priority: P0
owner: null
created_at: "2026-11-06"
updated_at: "2026-11-06"
depends_on: ["01-03"]
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

# 01-04 — Extend the quality pipeline

## Description

Add CI jobs for implemented PHP and TypeScript lint, type checking, tests, build, dependency and secret scans; keep workflow permissions minimal. This is planned work; no implementation or PR is claimed.

## Technical requirements

- Preserve the existing `syntax` and `docs` jobs; add PHP, TypeScript, build, test, dependency, and secret checks only for implemented code and scripts.
- Use pinned actions, least-privilege workflow permissions, deterministic dependencies, and appropriately scoped CI matrices.
- Make required checks correspond to jobs that actually exist; document branch-protection requirements and review policy.
- Give each check a failure mode and clear diagnostic output so PR authors can repair it.

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
- **Branch:** Not created.
- **Commit references:** None.
- **PR number and URL:** None.
- **Started / completed / closed:** Not recorded.
- **Status:** Backlog. Update frontmatter and history on every transition; follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
