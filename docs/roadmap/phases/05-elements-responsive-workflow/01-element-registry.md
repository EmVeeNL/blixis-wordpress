---
id: "05-01"
title: "Implement the element registry"
phase: "05"
status: Backlog
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-06"
depends_on: ["04-05"]
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

# 05-01 — Implement the element registry

## Description

Validate unique type and icon IDs, versioned schemas, defaults, allowed nesting, inspector controls, migration hooks, and tier. This is planned work; no implementation or PR is claimed.

## Technical requirements

- Use the module boundaries and contracts in [Architecture](../../../architecture/ARCHITECTURE.md).
- Validate server-side data and permissions where applicable; document schema or ADR changes.
- Preserve existing content and provide a migration or rollback plan for contract changes.
- Merge the [accepted v1 prop baseline](../../../contracts/document/v1/element-props.json) into the element specifications. Apply the accepted nesting rule: allow `section > container` and card with quote or video, remove `container > section`, and require both parent and child allowlists to agree. Change `validation.html` to `reject` and rename `divider.style`. Cover all 20 elements in the renderer contract; 01-05 covered four.

## Acceptance criteria

- [ ] The described capability works in the intended WordPress and browser environments.
- [ ] Relevant security, accessibility, and performance requirements are verified.
- [ ] Tests and documentation are included with the implementation.
- [ ] A reviewed PR is merged, with evidence and metadata recorded here.

## Testing requirements

Manifest contract tests, duplicate-ID failures, and icon license review. Include negative permission, invalid-input, version, and regression cases where relevant. Record exact commands and results in the PR.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `04-05`
- **Branch:** Not created.
- **Commit references:** None.
- **PR number and URL:** None.
- **Started / completed / closed:** Not recorded.
- **Status:** Backlog. Update frontmatter and history on every transition; follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
