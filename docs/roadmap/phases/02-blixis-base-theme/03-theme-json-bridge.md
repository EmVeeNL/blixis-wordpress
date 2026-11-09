---
id: "02-03"
title: "Bridge design tokens to theme.json"
phase: "02"
status: Done
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-09"
depends_on: ["02-02"]
branch: "feat/02-03-theme-json-bridge"
pr_number: 22
pr_url: "https://github.com/EmVeeNL/blixis-wordpress/pull/22"
commit_sha: "126725c039ed91ac439276c87dbdb3a2b3ba877d"
merged_at: "2026-11-07"
merge_commit_sha: "da659327335024c8370b81511a91efcbb51f6677"
started_at: "2026-11-07"
completed_at: "2026-11-07"
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

- [x] Validated colour, typography, and layout tokens map to theme.json through one closed inline contract; every valid and invalid fixture produces its golden result, and invalid input fails strictly without partial output.
- [x] Parent and child theme.json inheritance and precedence are documented and proven on disposable WordPress 7.1.4/PHP 8.3 and 7.0.8/PHP 8.5, with matching public and editor global styles in Chromium.
- [x] No production option, filter, REST route, or UI is added, so no new permission surface exists; parent files and the shared local site are untouched. Site Editor ownership enforcement stays in 03-05.
- [x] Tests and documentation ship with the change: the [proof guide](../../../development/THEME_JSON_BRIDGE.md), required CI coverage, and a mutation that makes the golden assertions fail.
- [x] A reviewed PR is merged, with evidence and metadata recorded here.

No accessibility audit or page-performance measurement is claimed for this task; those belong to [06-01](../06-hardening-beta/01-accessibility-audit.md) and [06-03](../06-hardening-beta/03-performance-optimization.md).

## Testing requirements

Validate generated theme.json and compare editor and frontend screenshots. Include negative permission, invalid-input, version, and regression cases where relevant. Record exact commands and results in the PR.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `02-02`
- **Branch:** `feat/02-03-theme-json-bridge`.
- **Commit references:** Implementation head `126725c`; merge `da659327335024c8370b81511a91efcbb51f6677`.
- **PR number and URL:** [#22](https://github.com/EmVeeNL/blixis-wordpress/pull/22).
- **Started / completed / closed:** Started and completed 2026-11-07; not yet closed or released.
- **Status:** Done. Independent integration review and all 16 required checks passed; PR #22 merged on 2026-11-07. Follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Verification evidence

- `composer lint`, `python3 scripts/check-docs.py`, `python3 scripts/check-base-theme-json.py`, pinned ShellCheck and actionlint pass.
- `bash tests/02-03/run.sh --browser --out /tmp/blixis-0203-final-shots`: integrated committed-tree proof on `5c2128c`; 310 assertions per WordPress stack (7.1.4/PHP 8.3 and 7.0.8/PHP 8.5), plus 28 Chromium checks. The same matrix runs in required CI.
- Temporary-plugin mutation (`defaultPalette: true`) fails two golden assertions and exits 1.
- Review covered the closed inline contract, every valid/invalid fixture, normalized-input precondition, strict failure behavior, schema retention, parent/child inheritance, public/editor global styles, and no production option/filter/REST path. Parent files and the shared local site remain untouched.
- Screenshot evidence is five swatch interior comparisons and inspected full-page captures, not a claim of full-page equality. The [proof guide](../../../development/THEME_JSON_BRIDGE.md) documents pinned packages, isolation, exact commands, and exclusions. Site Editor ownership enforcement stays in 03-05; no new UI or permission surface exists here.

The final randomized-login browser replay on `126725c` also passed 310 WordPress assertions and 28 Chromium checks. Required [Quality checks](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42391144993) and [PHP/documentation checks](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42391144998) passed before merge, including 310/0 assertions on each WordPress stack in CI. The secret-scan exception is only the exact historical fingerprint of the removed disposable fixture password; HEAD generates random per-run credentials.

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-07 | Backlog → Ready | Dependency `02-02` completed in [PR #20](https://github.com/EmVeeNL/blixis-wordpress/pull/20), merge `e5ec048`; owner and token-bridge scope are recorded. |
| 2026-11-07 | Ready → Busy | Integration branch `feat/02-03-theme-json-bridge` started from synchronized `origin/main` at `a6e5022`; isolated worktrees own the mapping, WordPress proof, and documentation. |
| 2026-11-07 | Busy → In Review | [PR #22](https://github.com/EmVeeNL/blixis-wordpress/pull/22); integrated proof `5c2128c`, independent contract/security/inheritance review and validation recorded above. |
| 2026-11-07 | In Review → Done | Independent integration review, all 16 required checks green, and [PR #22](https://github.com/EmVeeNL/blixis-wordpress/pull/22) merged as `da659327335024c8370b81511a91efcbb51f6677` at 16:29:17 UTC. |
| 2026-11-09 | Done, criteria clarified | The generic planning criteria were replaced with the concrete criteria above, each traced to the recorded evidence. Page-performance measurement was never part of this task's evidence and is now assigned to [06-03](../06-hardening-beta/03-performance-optimization.md); status is unchanged. |
