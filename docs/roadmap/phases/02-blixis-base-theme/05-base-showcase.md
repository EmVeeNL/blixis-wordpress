---
id: "02-05"
title: "Create the Blixis showcase"
phase: "02"
status: Busy
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-08"
depends_on: ["02-04"]
branch: "feat/02-05-showcase-integration"
pr_number: null
pr_url: null
commit_sha: null
merged_at: null
merge_commit_sha: null
started_at: "2026-11-08"
completed_at: null
closed_at: null
blocked_reason: null
blocked_by: []
---

# 02-05 — Create the Blixis showcase

## Description

Turn the concept preview into a separate showcase; document asset rights and contrast without making it mandatory starter content. Implemented as an optional `blixis-showcase` child theme; integration validation is in progress. Base remains neutral.

## Technical requirements

- Use the module boundaries and contracts in [Architecture](../../../architecture/ARCHITECTURE.md).
- Validate server-side data and permissions where applicable; document schema or ADR changes.
- Preserve existing content and provide a migration or rollback plan for contract changes.

## Acceptance criteria

- [ ] The described capability works in the intended WordPress and browser environments.
- [ ] Relevant security, accessibility, and performance requirements are verified.
- [ ] Tests and documentation are included with the implementation.
- [ ] A reviewed PR is merged, with evidence and metadata recorded here.

## Testing requirements

Responsive visual review and contrast checks at representative widths. Include negative permission, invalid-input, version, and regression cases where relevant. Record exact commands and results in the PR.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `02-04`
- **Branch:** `feat/02-05-showcase-integration`.
- **Commit references:** None.
- **PR number and URL:** None.
- **Started / completed / closed:** 2026-11-08 / pending / pending.
- **Status:** Busy. Update frontmatter and history on every transition; follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-07 | Backlog → Ready | Dependency 02-04 merged in [PR #24](https://github.com/EmVeeNL/blixis-wordpress/pull/24), commit `7e722a46`; showcase criteria and EmVeeNL ownership are defined. |
| 2026-11-08 | Ready → Busy | Integrated scaffold, blue/cyan styling, core-block patterns and disposable tests on `feat/02-05-showcase-integration`; 02-04 implementation merged in PR #24 |
