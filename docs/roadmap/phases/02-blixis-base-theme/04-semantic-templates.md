---
id: "02-04"
title: "Create semantic WordPress templates"
phase: "02"
status: Ready
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-07"
depends_on: ["02-03"]
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

# 02-04 — Create semantic WordPress templates

## Description

Add page, single, archive, search, and 404 templates with header/footer parts, landmarks, skip link, responsive layout, and translations. This is planned work; no implementation or PR is claimed.

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

Template snapshots, keyboard checks, and automated accessibility audit. Include negative permission, invalid-input, version, and regression cases where relevant. Record exact commands and results in the PR.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `02-03`
- **Branch:** Not created.
- **Commit references:** None.
- **PR number and URL:** None.
- **Started / completed / closed:** Not recorded.
- **Status:** Ready. Dependency 02-03 is merged, criteria are defined, and EmVeeNL owns the task; follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-07 | Backlog → Ready | Dependency 02-03 completed in [PR #22](https://github.com/EmVeeNL/blixis-wordpress/pull/22), merge `da659327`; semantic-template scope, testing requirements, and owner are recorded. |
