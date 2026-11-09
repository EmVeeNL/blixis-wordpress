---
id: "02-05"
title: "Create the Blixis showcase"
phase: "02"
status: Done
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-09"
depends_on: ["02-04"]
branch: "feat/02-05-showcase-integration"
pr_number: 26
pr_url: "https://github.com/EmVeeNL/blixis-wordpress/pull/26"
commit_sha: "d0ba0ec00468493d4193f4351f7b1124b2b4e231"
merged_at: "2026-11-08"
merge_commit_sha: "b2d43dcc9ccf025a2246c8bd4984a0ef4c6b7ba4"
started_at: "2026-11-08"
completed_at: "2026-11-08"
closed_at: null
blocked_reason: null
blocked_by: []
---

# 02-05 — Create the Blixis showcase

## Description

Turn the concept preview into a separate showcase; document asset rights and contrast without making it mandatory starter content. Implemented as an optional `blixis-showcase` child theme; integration validation passed, and the template audit fixes followed in PR #29. Base remains neutral.

## Technical requirements

- Use the module boundaries and contracts in [Architecture](../../../architecture/ARCHITECTURE.md).
- Validate server-side data and permissions where applicable; document schema or ADR changes.
- Preserve existing content and provide a migration or rollback plan for contract changes.

## Acceptance criteria

- [x] The showcase is an optional `blixis-showcase` child theme; Base stays neutral and unchanged, and nothing installs the showcase as starter content.
- [x] Header, hero, principles, status cards, and footer share one left edge at 1440, 820, 390, and 320 px, the status band spans the viewport, and there is no horizontal overflow.
- [x] Text contrast is at least 6.61:1, the page is keyboard operable with visible focus, it makes no external requests, decorative icons are hidden from assistive technology, and the illustration's label says the editor is not implemented.
- [x] Planned features are labelled as planned or partly implemented; links go only to existing pages and sections.
- [x] Asset rights are documented, and both Base and the showcase have honest 1200×900 Appearance screenshots.
- [x] Tests run on disposable WordPress 7.1.4/PHP 8.3 and 7.0.8/PHP 8.5 in Chromium and Firefox, including alignment and feature-row regression checks; the `showcase` CI job runs them on every pull request.
- [x] Reviewed PRs are merged, with evidence and metadata recorded here.

The hero gradient contrast was checked by hand because axe marks it for review. No page-performance measurement is claimed ([06-03](../06-hardening-beta/03-performance-optimization.md)); WebKit is outside this task's browser matrix.

## Testing requirements

Responsive visual review and contrast checks at representative widths. Include negative permission, invalid-input, version, and regression cases where relevant. Record exact commands and results in the PR.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `02-04`
- **Branch:** `feat/02-05-showcase-integration`.
- **Commit references:** `d0ba0ec00468493d4193f4351f7b1124b2b4e231` (reviewed implementation); `b2d43dcc9ccf025a2246c8bd4984a0ef4c6b7ba4` (merge). Follow-up fixes: `194ae7f2e97a9afa5a6e5f9fe89d045b693843d4` ([PR #28](https://github.com/EmVeeNL/blixis-wordpress/pull/28)) and `325db1f2202bfcbea0e197187dc3975e5aa9b097` ([PR #29](https://github.com/EmVeeNL/blixis-wordpress/pull/29)).
- **PR number and URL:** [#26](https://github.com/EmVeeNL/blixis-wordpress/pull/26); follow-ups [#28](https://github.com/EmVeeNL/blixis-wordpress/pull/28) and [#29](https://github.com/EmVeeNL/blixis-wordpress/pull/29).
- **Started / completed / closed:** 2026-11-08 / 2026-11-08 / not released.
- **Status:** Done. Update frontmatter and history on every transition; follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-07 | Backlog → Ready | Dependency 02-04 merged in [PR #24](https://github.com/EmVeeNL/blixis-wordpress/pull/24), commit `7e722a46`; showcase criteria and EmVeeNL ownership are defined. |
| 2026-11-08 | Ready → Busy | Integrated scaffold, blue/cyan styling, core-block patterns and disposable tests on `feat/02-05-showcase-integration`; 02-04 implementation merged in PR #24 |
| 2026-11-08 | Busy → In Review | [PR #26](https://github.com/EmVeeNL/blixis-wordpress/pull/26); both disposable WP/PHP combinations pass 8 setup + 465 browser checks each; static controls, PHP style, shell/workflow lint and visual/contrast review pass. See [evidence](../../../development/SHOWCASE.md#integration-evidence-2026-11-08). |
| 2026-11-08 | In Review → Done | [PR #26](https://github.com/EmVeeNL/blixis-wordpress/pull/26) squash-merged as `b2d43dcc9ccf025a2246c8bd4984a0ef4c6b7ba4` after all 16 required checks plus showcase, semantic templates and dependency audit passed. Integration and visual review resolved layout and test findings; no release or owner acceptance is claimed. |
| 2026-11-08 | Done, follow-up merged | [PR #28](https://github.com/EmVeeNL/blixis-wordpress/pull/28) merged as `194ae7f`: layout closer to the concept, a showcase Appearance screenshot, and a screenshot check. [Quality](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42501318135) and [PHP lint](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42501318055) passed. |
| 2026-11-08 | Done, follow-up merged | A template audit found misaligned left edges, a raised first feature, duplicate CSS, tight headline tracking, and an understated token status. [PR #29](https://github.com/EmVeeNL/blixis-wordpress/pull/29) merged as `325db1f` with fixes, SVG icons, a neutral Base screenshot, and alignment regression checks: 8 setup and 478 browser checks per WordPress/PHP combination. [Quality](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42528567681) and [PHP lint](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42528567683) passed; the [evidence](../../../development/SHOWCASE.md#template-audit-fixes-2026-11-08) is recorded. Live blixis.test measured one 72 px left edge at 1440 px. |
| 2026-11-09 | Done, criteria clarified | The generic planning criteria were replaced with the concrete criteria above, each traced to the recorded evidence. Page-performance measurement was never part of this task's evidence and is now assigned to [06-03](../06-hardening-beta/03-performance-optimization.md); status is unchanged. |
