---
id: "03-04"
title: "Manage local fonts"
phase: "03"
status: Done
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-09"
depends_on: ["03-03"]
branch: "feat/03-04-local-fonts"
pr_number: 36
pr_url: "https://github.com/EmVeeNL/blixis-wordpress/pull/36"
commit_sha: "9057a1e"
merged_at: "2026-11-09T10:53:15Z"
merge_commit_sha: "8e3ee323fed368c5fc3edefa9e4076a95fe48e26"
started_at: "2026-11-09"
completed_at: "2026-11-09"
closed_at: null
blocked_reason: null
blocked_by: []
---

# 03-04 — Manage local fonts

## Description

Enumerate site-installed fonts; validate file type, size, license metadata, and enqueue behavior. Fonts come from the WordPress Font Library (Q13, decided 2026-11-09); see [local fonts](../../../development/FONTS.md).

## Technical requirements

- Use the module boundaries and contracts in [Architecture](../../../architecture/ARCHITECTURE.md).
- Validate server-side data and permissions where applicable; document schema or ADR changes.
- Preserve existing content and provide a migration or rollback plan for contract changes.

## Acceptance criteria

- [x] Blixis lists the font families installed in the WordPress Font Library and checks each face: local path inside the fonts directory, an allowed format whose bytes match its extension, and at most 2 MiB; families with any problem are not usable.
- [x] Licence text, licence URL, and copyright are read from TrueType, OpenType, and WOFF files and shown in the wizard; WOFF2 licences are reported as unreadable rather than guessed.
- [x] The wizard offers only generic and usable installed families, and the server refuses other font names.
- [x] `@font-face` output covers only chosen usable families, with local URLs and `font-display: swap`; a public page loads only the face it uses, from the site itself.
- [x] Uploads go through WordPress's Font Library routes: a valid font is accepted, disguised or executable files are refused, and editors get 403. The wizard has no axe-core violations at 1280 and 320 px.
- [x] Tests and documentation ship with the change, and required CI runs them.
- [x] A reviewed PR is merged, with evidence and metadata recorded here.

## Testing requirements

Upload rejection cases, license review, and font loading measurements. Include negative permission, invalid-input, version, and regression cases where relevant. Record exact commands and results in the PR.

## Verification evidence

- `bash tests/03-04/run.sh --browsers chromium,firefox` on disposable WordPress 7.1.4/PHP 8.3 and 7.0.8/PHP 8.5: 22 in-process, 28 browser, and 4 post-browser checks pass on each stack; two consecutive full runs passed.
- Font loading measurement: one request, 410,820 bytes (Liberation Sans Regular, TrueType), same origin, `font-display: swap`, in Chromium and Firefox.
- Deliberate faults: skipping the format/extension comparison failed the type-mismatch check; weakening the fonts-directory containment failed the traversal check.
- `tests/03-03/run.sh` still passes with the font select in the wizard (19 + 85 + 9 checks per stack).
- An axe-core finding (a licence link only distinguishable by colour inside a table cell) was fixed before review.
- PHPCS, `php -l`, ShellCheck, actionlint, and the docs check pass. WOFF2 licence reading and page-performance budgets are not claimed.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `03-03`
- **Branch:** `feat/03-04-local-fonts`.
- **Commit references:** `9057a1e` (implementation); merge `8e3ee323fed368c5fc3edefa9e4076a95fe48e26`.
- **PR number and URL:** [#36](https://github.com/EmVeeNL/blixis-wordpress/pull/36).
- **Started / completed / closed:** Started and completed 2026-11-09; not released.
- **Status:** Done. PR #36 merged after all 19 required checks passed. Update frontmatter and history on every transition; follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-09 | Backlog → Ready | Dependency `03-03` completed in [PR #35](https://github.com/EmVeeNL/blixis-wordpress/pull/35), merge `9c732b0`; Michael decided Q13 (WordPress Font Library); concrete criteria written. |
| 2026-11-09 | Ready → Busy | Branch `feat/03-04-local-fonts` from `9c732b0`. |
| 2026-11-09 | Busy → In Review | [PR #36](https://github.com/EmVeeNL/blixis-wordpress/pull/36), commit `9057a1e`; evidence above. |
| 2026-11-09 | In Review → Done | [PR #36](https://github.com/EmVeeNL/blixis-wordpress/pull/36) squash-merged as `8e3ee323fed368c5fc3edefa9e4076a95fe48e26` at 10:53:15 UTC after all 19 required checks passed, including the font harness in `setup-wizard`. |
