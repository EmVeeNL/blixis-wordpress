---
id: "R-02"
title: "Reduce test and process overhead"
phase: "repository-foundation"
status: Backlog
priority: P2
owner: "EmVeeNL"
created_at: "2026-11-09"
updated_at: "2026-11-09"
depends_on: []
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

# R-02 — Reduce test and process overhead

- **Status:** Backlog. Planned repository maintenance outside the product phases, like [R-01](R-01-restructure-repository.md). No implementation or PR is claimed.
- **Priority:** P2. Recommended before or alongside phase 04.
- **Dependencies:** None. Avoid running it while another task changes the same test harnesses.

## Why

Phase 03 showed three costs that will grow with the editor phases:

- `tests/03-03`, `tests/03-04`, and `tests/03-05` each carry an almost identical copy of the disposable WordPress and browser harness (`run.sh`, `run-wp.sh`, `compose.yaml`, login and axe helpers).
- The 01-02 compatibility spike and the 01-05 contract spike are still workspace packages with CI jobs, although product code now covers most of what they prove.
- Each task takes about three pull requests (implementation, In Review record, Done record), and the required `setup-wizard` job runs three full harnesses in sequence.

## Scope

1. **Shared harness.** Move the common parts into one harness (for example `tests/lib/`): a disposable stack with users and language packs, a login helper that waits for navigation commit, axe-core loading, overflow checks, and the Blixis-only PHP log check. Task folders keep only their own checks. Each existing suite must pass unchanged in count before and after.
2. **Retire spikes.** Remove `spikes/01-02-compatibility` and `spikes/01-05-contracts` from the workspace once their remaining checks live in product tests: the contract fixtures and cross-contract tests move next to the product code that implements them, and the WordPress matrix and REST smoke tests move into an existing integration harness. Keep the contracts in `docs/contracts` and the history in Git.
3. **Leaner status records.** Record a task's Done state in the next task's pull request instead of a separate one, as the [status workflow](../STATUS_WORKFLOW.md) allows, and document that.
4. **CI time.** Run the browser harnesses as a matrix (one job per task) instead of in sequence, keeping one required check name per job, and update [CI checks](../CI.md) and branch protection together.

## Acceptance criteria

- [ ] Every current harness still reports the same checks and passes, from the shared harness.
- [ ] The two spikes are gone from the workspace and CI, with no loss of contract or integration coverage (listed check by check in the PR).
- [ ] CI wall time for a pull request is measured before and after.
- [ ] CI docs, branch protection, and the status workflow agree.
- [ ] A reviewed PR is merged, with evidence and metadata recorded here.
