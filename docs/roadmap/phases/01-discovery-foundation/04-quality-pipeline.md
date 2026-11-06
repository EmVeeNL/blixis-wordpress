---
id: "01-04"
title: "Extend the quality pipeline"
phase: "01"
status: Done
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-06"
depends_on: ["01-03"]
branch: "ci/01-04-quality-pipeline"
pr_number: 12
pr_url: "https://github.com/EmVeeNL/blixis-wordpress/pull/12"
commit_sha: "e3a5dab850bd21dd20e4f7352d525096bcf0e9d3"
merged_at: "2026-11-06T20:58:28Z"
merge_commit_sha: "4fa55e6668d01bc9e447f66e783dbf327dd34a97"
started_at: "2026-11-06"
completed_at: "2026-11-06"
closed_at: null
blocked_reason: null
blocked_by: []
---

# 01-04 — Extend the quality pipeline

## Description

Add CI jobs for implemented PHP and TypeScript lint, type checking, tests, build, dependency and secret scans; keep workflow permissions minimal. PR #12 merged the quality pipeline, and the 12 agreed checks are required on `main`.

## Technical requirements

- Preserve the existing `syntax` and `docs` jobs; add PHP, TypeScript, build, test, dependency, and secret checks only for implemented code and scripts.
- Use pinned actions, least-privilege workflow permissions, deterministic dependencies, and appropriately scoped CI matrices.
- Make required checks correspond to jobs that actually exist; document branch-protection requirements and review policy.
- Give each check a failure mode and clear diagnostic output so PR authors can repair it.
- Use Oxlint with `oxlint-tsgolint` for TypeScript 7 linting and Oxfmt for formatting. Pin versions, run type-aware lint plus type checking, and test both failure paths before making CI checks required. The 01-02 spike is feasibility evidence, not CI coverage.

## Acceptance criteria

- [x] Every implemented code path has relevant reproducible CI checks; no job advertises an absent test suite.
- [x] Deliberate syntax, documentation, lint, and test failures cause the intended PR checks to fail, then pass when fixed.
- [x] Workflow permissions and dependency versions are reviewed, and branch protection requires the agreed checks.
- [x] The reviewed PR is merged with CI run links and task metadata.

## Testing requirements

Use temporary test branches or a safe fixture to trigger each check's failure path, then verify a passing run. Inspect workflow permissions, action pinning, check names, and branch protection. Record run URLs and cleanup.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `01-03`
- **Branch:** `ci/01-04-quality-pipeline`
- **Commit references:** `a9905e1788381e62b4700ac8ff75b0b2da7d9212` (failure evidence), `e3a5dab850bd21dd20e4f7352d525096bcf0e9d3` (review), `4fa55e6668d01bc9e447f66e783dbf327dd34a97` (squash merge).
- **PR number and URL:** [#12](https://github.com/EmVeeNL/blixis-wordpress/pull/12)
- **Started / completed / closed:** Started and completed 2026-11-06; not closed pending release or acceptance evidence.
- **Evidence:** [CI checks](../../../development/CI.md) lists jobs and failure runs. PR #12 and its merged-`main` [Quality](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42292818868) and [PHP lint](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42292818870) runs passed. GitHub API verified 12 required checks, all pinned to GitHub Actions app `15368`, with strict protection. `wordpress-integration` is required; `dependency-audit` is advisory, and dependency review awaits GitHub dependency graph support.
- **Status:** Done. Follow [status workflow](../../../development/STATUS_WORKFLOW.md); Closed requires later release or acceptance evidence.

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-06 | Backlog → Ready | Dependency `01-03` was completed in PR [#10](https://github.com/EmVeeNL/blixis-wordpress/pull/10), merged as `fad5c11819fce9bc92990d2266d91caec85bea2c`; owner and acceptance criteria are recorded. |
| 2026-11-06 | Ready → Busy | Branch `ci/01-04-quality-pipeline` created from `6662c6b`; CI jobs started |
| 2026-11-06 | Busy → In Review | PR [#12](https://github.com/EmVeeNL/blixis-wordpress/pull/12), commit `a9905e1`; 16 deliberate faults failed their intended checks and the fixed run passed, recorded in [CI checks](../../../development/CI.md). Branch protection update waits for merge; owner review pending |
| 2026-11-06 | In Review, decisions resolved | Owner-delegated review confirms the 12 planned required checks after merge, including `wordpress-integration`; dependency graph and dependency review are later work, with advisory audits active now. Gitleaks `HEAD` scans reachable ancestry and excludes unrelated refs. |
| 2026-11-06 | In Review → Done | PR [#12](https://github.com/EmVeeNL/blixis-wordpress/pull/12) passed 13 jobs and was squash-merged as `4fa55e6668d01bc9e447f66e783dbf327dd34a97` at 20:58:28 UTC. Merged-`main` workflows passed; branch protection API confirmed 12 required GitHub Actions checks, strict mode, and admin enforcement. |
