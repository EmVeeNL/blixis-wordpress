---
id: "03-01"
title: "Generate a child theme"
phase: "03"
status: In Review
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-09"
depends_on: ["02-05"]
branch: "feat/03-01-child-theme-generator"
pr_number: 32
pr_url: "https://github.com/EmVeeNL/blixis-wordpress/pull/32"
commit_sha: "f7aea6f"
merged_at: null
merge_commit_sha: null
started_at: "2026-11-09"
completed_at: null
closed_at: null
blocked_reason: null
blocked_by: []
---

# 03-01 — Generate a child theme

## Description

Create metadata, parent relation, safe overrides, and installable scaffold; protect the parent source from UI writes. Implemented in [PR #32](https://github.com/EmVeeNL/blixis-wordpress/pull/32) as a Blixis Blocks generator behind an authenticated REST route; see the [generator guide](../../../development/CHILD_THEME.md). There is no admin screen; the wizard in 03-03 will call it.

## Technical requirements

- Use the module boundaries and contracts in [Architecture](../../../architecture/ARCHITECTURE.md).
- Validate server-side data and permissions where applicable; document schema or ADR changes.
- Preserve existing content and provide a migration or rollback plan for contract changes.

## Acceptance criteria

- [x] A generated child theme has valid metadata (`Template: blixis-base`, name, slug, version, WordPress 7.0 and PHP 8.3 floors) and activates on disposable WordPress 7.0 and 7.1.
- [x] Generation requires `edit_theme_options` and a valid nonce, validates the slug and every field, refuses an existing directory, and never writes into Base or WordPress Core; each refusal has a negative test.
- [x] The child inherits Base templates and the compiled stylesheet, and only approved override files are generated; a Base upgrade in the fixture leaves the child working.
- [x] Tests and documentation ship with the change, and required CI runs them.
- [ ] A reviewed PR is merged, with evidence and metadata recorded here.

## Testing requirements

Activate child theme and verify behavior across a parent upgrade. Include negative permission, invalid-input, version, and regression cases where relevant. Record exact commands and results in the PR.

## Verification evidence

- `bash tests/03-01/run.sh` on disposable WordPress 7.1.4/PHP 8.3 and 7.0.8/PHP 8.5: all checks pass on each stack. They cover 18 invalid inputs; refusals over real HTTP for anonymous, subscriber, editor, administrator without or with a wrong nonce, and an administrator application password; creation, a repeat `409`, and `DISALLOW_FILE_MODS`; WordPress recognising the theme with Base as parent and the 7.0/8.3 floors; Base byte-identical; no staging leftovers; rendering with one `main` and one `h1`; and a simulated Base upgrade.
- Deliberate faults: removing the nonce check failed 3 checks; removing the reserved-slug check failed 3 checks.
- PHPCS, `php -l`, ShellCheck, actionlint, and `python3 scripts/check-docs.py` pass. CI runs the harness in the required `wordpress-integration` job.
- Activation on WordPress 7.0 and 7.1 is verified on 7.0.8 and 7.1.4. Below-floor refusal is inherited from the generated headers and Base, whose refusal 02-01 already tests.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `02-05`
- **Branch:** `feat/03-01-child-theme-generator`.
- **Commit references:** `f7aea6f` (implementation).
- **PR number and URL:** [#32](https://github.com/EmVeeNL/blixis-wordpress/pull/32).
- **Started / completed / closed:** Started 2026-11-09; not completed.
- **Status:** In Review. Michael confirmed the criteria and started the task on 2026-11-09. The first four criteria are met by the evidence below; the last needs review and merge. Update frontmatter and history on every transition; follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-09 | Backlog → Ready | Dependency `02-05` completed in [PR #26](https://github.com/EmVeeNL/blixis-wordpress/pull/26), merge `b2d43dc`, with follow-ups #28 and #29; generic criteria replaced with concrete criteria; owner EmVeeNL. |
| 2026-11-09 | Ready → Busy | Michael confirmed the criteria and started the task; branch `feat/03-01-child-theme-generator` from `73b76e3`. |
| 2026-11-09 | Busy → In Review | [PR #32](https://github.com/EmVeeNL/blixis-wordpress/pull/32), commit `f7aea6f`; evidence above. |
