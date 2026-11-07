---
id: "02-03"
title: "Bridge design tokens to theme.json"
phase: "02"
status: In Review
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-07"
depends_on: ["02-02"]
branch: "feat/02-03-theme-json-bridge"
pr_number: 22
pr_url: "https://github.com/EmVeeNL/blixis-wordpress/pull/22"
commit_sha: "5c2128c"
merged_at: null
merge_commit_sha: null
started_at: "2026-11-07"
completed_at: null
closed_at: null
blocked_reason: null
blocked_by: []
---

# 02-03 — Bridge design tokens to theme.json

## Description

Map validated colors, typography, and layout tokens to WordPress theme.json; document inheritance and precedence. The pure Blocks projection and disposable WordPress/browser proof are implemented in PR #22. Runtime token validation, storage, and application remain Phase 03 work.

## Technical requirements

- Use the module boundaries and contracts in [Architecture](../../../architecture/ARCHITECTURE.md).
- Validate server-side data and permissions where applicable; document schema or ADR changes.
- Preserve existing content and provide a migration or rollback plan for contract changes.

## Acceptance criteria

- [x] The described capability works in the intended WordPress and browser environments.
- [x] Relevant security, accessibility, and performance requirements are verified.
- [x] Tests and documentation are included with the implementation.
- [ ] A reviewed PR is merged, with evidence and metadata recorded here.

## Testing requirements

Validate generated theme.json and compare editor and frontend screenshots. Include negative permission, invalid-input, version, and regression cases where relevant. Record exact commands and results in the PR.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `02-02`
- **Branch:** `feat/02-03-theme-json-bridge`.
- **Commit references:** Integrated implementation and proof `5c2128c`.
- **PR number and URL:** [#22](https://github.com/EmVeeNL/blixis-wordpress/pull/22).
- **Started / completed / closed:** Started 2026-11-07; completion and closure not recorded.
- **Status:** In Review. Independent integration review completed; required GitHub checks and merge remain. Follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Verification evidence

- `composer lint`, `python3 scripts/check-docs.py`, `python3 scripts/check-base-theme-json.py`, pinned ShellCheck and actionlint pass.
- `bash tests/02-03/run.sh --browser --out /tmp/blixis-0203-final-shots`: integrated committed-tree proof on `5c2128c`; 310 assertions per WordPress stack (7.1.4/PHP 8.3 and 7.0.8/PHP 8.5), plus 28 Chromium checks. The same matrix runs in required CI.
- Temporary-plugin mutation (`defaultPalette: true`) fails two golden assertions and exits 1.
- Review covered the closed inline contract, every valid/invalid fixture, normalized-input precondition, strict failure behavior, schema retention, parent/child inheritance, public/editor global styles, and no production option/filter/REST path. Parent files and the shared local site remain untouched.
- Screenshot evidence is five swatch interior comparisons and inspected full-page captures, not a claim of full-page equality. The [proof guide](../../../development/THEME_JSON_BRIDGE.md) documents pinned packages, isolation, exact commands, and exclusions. Site Editor ownership enforcement stays in 03-05; no new UI or permission surface exists here.

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-07 | Backlog → Ready | Dependency `02-02` completed in [PR #20](https://github.com/EmVeeNL/blixis-wordpress/pull/20), merge `e5ec048`; owner and token-bridge scope are recorded. |
| 2026-11-07 | Ready → Busy | Integration branch `feat/02-03-theme-json-bridge` started from synchronized `origin/main` at `a6e5022`; isolated worktrees own the mapping, WordPress proof, and documentation. |
| 2026-11-07 | Busy → In Review | [PR #22](https://github.com/EmVeeNL/blixis-wordpress/pull/22); integrated proof `5c2128c`, independent contract/security/inheritance review and validation recorded above. |
