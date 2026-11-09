---
id: "03-05"
title: "Preview and persist design tokens"
phase: "03"
status: In Review
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-09"
depends_on: ["03-04"]
branch: "feat/03-05-token-preview"
pr_number: 37
pr_url: "https://github.com/EmVeeNL/blixis-wordpress/pull/37"
commit_sha: "d05e02b"
merged_at: null
merge_commit_sha: null
started_at: "2026-11-09"
completed_at: null
closed_at: null
blocked_reason: null
blocked_by: []
---

# 03-05 — Preview and persist design tokens

## Description

Update responsive previews from validated tokens; persist versions, invalidate assets, and allow rollback. See [applying tokens](../../../development/TOKENS.md#applying-tokens).

## Technical requirements

- Use the module boundaries and contracts in [Architecture](../../../architecture/ARCHITECTURE.md).
- Validate server-side data and permissions where applicable; document schema or ADR changes.
- Preserve existing content and provide a migration or rollback plan for contract changes.
- Follow the [token contract](../../../contracts/tokens/README.md): compare-and-swap on the stored row, revalidate on read, clear the theme.json cache, retain one previous valid config for rollback, and enforce the accepted policy that Site Editor user settings cannot override Blixis tokens.

## Acceptance criteria

- [x] A stored, revalidated config applies to the site while its child theme is active, through theme-origin theme.json data, an inline token stylesheet, and local Font Library `@font-face` rules; a config for another theme does not apply.
- [x] A save or rollback is visible on the next request: theme.json caches are cleared and `blixis_tokens_changed` announces the change for page caches.
- [x] Rollback restores the previous config as a new compare-and-swap revision and can itself be undone; a corrupt current config falls back to the previous one, then to Base presets.
- [x] Site Editor user settings cannot override Blixis token presets or layout widths, proven against a control, while other user settings are kept.
- [x] The wizard previews the user's draft on the front page at 390, 820, and 1280 px without changing stored values; only that user with a valid nonce sees the draft, and preview responses are not cacheable or indexable.
- [x] The review step has no axe-core violations at 1280 and 320 px and fits at 320 px, and the 03-03 and 03-04 suites still pass.
- [x] Tests and documentation ship with the change, and required CI runs them.
- [ ] A reviewed PR is merged, with evidence and metadata recorded here.

## Testing requirements

Breakpoint snapshots and integration tests for save, stale state, and rollback. Include negative permission, invalid-input, version, and regression cases where relevant. Record exact commands and results in the PR.

## Verification evidence

- `bash tests/03-05/run.sh --browsers chromium,firefox` on disposable WordPress 7.1.4/PHP 8.3 and 7.0.8/PHP 8.5: 22 in-process, 30 browser, and 5 post-browser checks pass on each stack; three full runs passed.
- Deliberate faults: without the Site Editor policy, visitors got `#000000` from a Site Editor override (4 failures); without clearing caches on save, new values did not apply in the same request (4 failures); without the preview nonce check, an invalid preview link showed the draft (1 failure).
- `tests/03-03/run.sh` and `tests/03-04/run.sh` still pass. Two layout defects found by them were fixed: a long rollback button and the preview frame overflowed at 320 px.
- Reviewed screenshots: review step with the preview at 1280 px and at 320 px.
- Limit: Base templates use token presets only for background and text colour, so a neutral Base preview shows few changes. Page-performance budgets are not claimed.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `03-04`
- **Branch:** `feat/03-05-token-preview`.
- **Commit references:** `d05e02b` (implementation).
- **PR number and URL:** [#37](https://github.com/EmVeeNL/blixis-wordpress/pull/37).
- **Started / completed / closed:** Started 2026-11-09; not completed.
- **Status:** In Review. The last criterion needs review and merge. Update frontmatter and history on every transition; follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-09 | Backlog → Ready | Dependency `03-04` completed in [PR #36](https://github.com/EmVeeNL/blixis-wordpress/pull/36), merge `8e3ee32`; concrete criteria written; Michael asked to start. |
| 2026-11-09 | Ready → Busy | Branch `feat/03-05-token-preview` from `8e3ee32`. |
| 2026-11-09 | Busy → In Review | [PR #37](https://github.com/EmVeeNL/blixis-wordpress/pull/37), commit `d05e02b`; evidence above. |
