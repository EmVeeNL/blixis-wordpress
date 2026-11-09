---
id: "03-03"
title: "Build the theme setup wizard"
phase: "03"
status: Done
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-09"
depends_on: ["03-02"]
branch: "feat/03-03-setup-wizard"
pr_number: 35
pr_url: "https://github.com/EmVeeNL/blixis-wordpress/pull/35"
commit_sha: "7ee1997"
merged_at: "2026-11-09T10:27:03Z"
merge_commit_sha: "9c732b03a6e2814fbae1af5dd7dae77bf5be88df"
started_at: "2026-11-09"
completed_at: "2026-11-09"
closed_at: null
blocked_reason: null
blocked_by: []
---

# 03-03 — Build the theme setup wizard

## Description

Provide accessible forms, progress, defaults, validation, save, and recovery for child-theme configuration. Implemented as Appearance → Blixis setup; see the [setup wizard guide](../../../development/SETUP_WIZARD.md). Applying stored tokens to the site, preview, and rollback belong to 03-05.

## Technical requirements

- Use the module boundaries and contracts in [Architecture](../../../architecture/ARCHITECTURE.md).
- Validate server-side data and permissions where applicable; document schema or ADR changes.
- Preserve existing content and provide a migration or rollback plan for contract changes.

## Acceptance criteria

- [x] Appearance → Blixis setup guides an administrator through choosing or creating a child theme, colours, typography, spacing and layout, and review, starting from the contract defaults, on WordPress 7.0 and 7.1 in Chromium and Firefox.
- [x] Every step is validated on the server with the contract validator; errors appear in a focused summary and next to each field, rejected input is kept, and CSS injection is refused.
- [x] Progress, labels, hints, and errors are accessible: keyboard operable with visible focus, `aria-current` on the step, linked errors, no axe-core violations at 1280 and 320 px, no overflow at 320 px, and correct Dutch and Arabic (right-to-left) rendering.
- [x] Drafts survive a reload, a new session, and a failed save; saving uses compare-and-swap, refuses a stale or concurrent save with a conflict message, and can discard the draft.
- [x] Only users with `edit_theme_options` (and `install_themes` to create a theme) can open or submit the wizard, every step needs its nonce, and Blixis Base is never modified.
- [x] Tests and documentation ship with the change, and CI runs them.
- [x] A reviewed PR is merged, with evidence and metadata recorded here.

## Testing requirements

Keyboard, locale, error-state, and end-to-end save tests. Include negative permission, invalid-input, version, and regression cases where relevant. Record exact commands and results in the PR.

## Verification evidence

- `bash tests/03-03/run.sh --browsers chromium,firefox` on disposable WordPress 7.1.4/PHP 8.3 and 7.0.8/PHP 8.5 passes on each stack: 19 in-process store checks, 85 browser checks (full flow in Chromium, repeated read-only checks in Firefox), and 9 checks after the browsers; two consecutive full runs passed. The site blocks outbound HTTP after installing language packs, so WordPress core logs `translations_api()` warnings; the check counts only messages from Blixis code.
- Deliberate faults: removing the nonce check let a forged submission through (2 failures); removing the revision check broke conflict detection (6 failures).
- Screenshots at 1280 px and in Arabic at 320 px were reviewed; token inputs now stay left to right in right-to-left pages.
- PHPCS, `php -l`, ShellCheck, actionlint, and the docs check pass.
- Applying tokens to the site and page-performance measurement are not claimed.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `03-02`
- **Branch:** `feat/03-03-setup-wizard`.
- **Commit references:** `7ee1997` (implementation); merge `9c732b03a6e2814fbae1af5dd7dae77bf5be88df`.
- **PR number and URL:** [#35](https://github.com/EmVeeNL/blixis-wordpress/pull/35).
- **Started / completed / closed:** Started and completed 2026-11-09; not released.
- **Status:** Done. PR #35 merged after all required checks passed; `setup-wizard` then passed on `main` and became a required check. Update frontmatter and history on every transition; follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-09 | Backlog → Ready | Dependency `03-02` completed in [PR #34](https://github.com/EmVeeNL/blixis-wordpress/pull/34), merge `00d2bd8`; concrete criteria written; Michael asked to continue. |
| 2026-11-09 | Ready → Busy | Branch `feat/03-03-setup-wizard` from `00d2bd8`. |
| 2026-11-09 | Busy → In Review | [PR #35](https://github.com/EmVeeNL/blixis-wordpress/pull/35), commit `7ee1997`; evidence above. |
| 2026-11-09 | In Review → Done | [PR #35](https://github.com/EmVeeNL/blixis-wordpress/pull/35) squash-merged as `9c732b03a6e2814fbae1af5dd7dae77bf5be88df` at 10:27:03 UTC; `setup-wizard` passed in CI (19 + 85 + 9 checks per stack) and on `main` ([run](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42600961918)), then became the 19th required check. |
