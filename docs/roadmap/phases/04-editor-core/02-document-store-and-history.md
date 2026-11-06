---
id: "04-02"
title: "Implement document state and history"
phase: "04"
status: Backlog
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-06"
depends_on: ["04-01"]
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

# 04-02 — Implement document state and history

## Description

Manage immutable node tree, selection, dirty state, undo/redo, stable IDs, and save conflict policy. This is planned work; no implementation or PR is claimed.

## Technical requirements

- Use the module boundaries and contracts in [Architecture](../../../architecture/ARCHITECTURE.md).
- Validate server-side data and permissions where applicable; document schema or ADR changes.
- Preserve existing content and provide a migration or rollback plan for contract changes.
- Follow the [document contract](../../../contracts/document/README.md): post-row lock on write, per-user autosave revisions for live pages, publish that promotes through the same write, and the core `/autosaves` gap. Review 01-05 proved these separately, not as one path.
- Keep `documentId` as the accepted v1 opaque record; never use it for lookup, uniqueness, or authorization. WordPress post ID is authoritative.
- Measure revision growth on representative pages before setting a cap; preserve restorable document/projection pairs.

## Acceptance criteria

- [ ] The described capability works in the intended WordPress and browser environments.
- [ ] Relevant security, accessibility, and performance requirements are verified.
- [ ] Tests and documentation are included with the implementation.
- [ ] A reviewed PR is merged, with evidence and metadata recorded here.

## Testing requirements

State unit tests including cycles, orphan nodes, and corrupted fixtures. Include negative permission, invalid-input, version, and regression cases where relevant. Record exact commands and results in the PR.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `04-01`
- **Branch:** Not created.
- **Commit references:** None.
- **PR number and URL:** None.
- **Started / completed / closed:** Not recorded.
- **Status:** Backlog. Update frontmatter and history on every transition; follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
