---
id: "09-06"
title: "Add WordPress Multisite support for v1.1"
phase: "09"
status: Backlog
priority: P1
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-06"
depends_on: ["08-05"]
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

# 09-06 — Add WordPress Multisite support for v1.1

## Description

Plan and implement network-safe Blixis Base, Blocks, and Content API behavior after the single-site v1.0.x release line. This is planned v1.1 work; no Multisite support is claimed for v1.0.x.

## Technical requirements

- Define network activation and per-site activation behavior for the theme and plugins without copying site configuration across blogs.
- Scope design tokens, content documents, revisions, API keys, caches, and audit records to the correct site; document any network-wide settings explicitly.
- Use WordPress site switching and capability APIs carefully; restore context after each switch and prevent cross-site draft or credential exposure.
- Define upgrade and rollback behavior for an existing single-site installation and for network sites. Record versioned schema or API changes in ADRs before implementation.
- Add installation, operations, and failure guidance for network administrators and site administrators.

## Acceptance criteria

- [ ] A network installation can activate supported components and configure two sites independently.
- [ ] Content, tokens, API keys, permissions, and cache entries do not leak between sites.
- [ ] Existing single-site v1.0.x data upgrades safely; documented rollback preserves content.
- [ ] Relevant PHP/WordPress integration, security, accessibility, and performance checks pass.
- [ ] A reviewed PR is merged with test evidence and task metadata.

## Testing requirements

Run WordPress Multisite integration tests with at least two sites and different users/roles. Cover activation/deactivation, site switching, save/load, public rendering, API isolation, key revocation, cache invalidation, migration and rollback. Include negative cross-site permission and draft leakage cases. Record exact commands, versions, and results.

## Tracking and completion

- **Priority:** P1
- **Dependencies:** `08-05`; the single-site v1.0.x product line must be released before v1.1 work is delivered.
- **Branch:** Not created.
- **Commit references:** None.
- **PR number and URL:** None.
- **Started / completed / closed:** Not recorded.
- **Status:** Backlog. Follow the [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Michael's owner instruction: first release line v1.0.x, Multisite planned for v1.1 |
