---
id: "01-03"
title: "Build the monorepo scaffold"
phase: "01"
status: Busy
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-06"
depends_on: ["01-02"]
branch: "chore/01-03-workspace-scaffold"
pr_number: null
pr_url: null
commit_sha: null
merged_at: null
merge_commit_sha: null
started_at: "2026-11-06"
completed_at: null
closed_at: null
blocked_reason: null
blocked_by: []
---

# 01-03 — Build the monorepo scaffold

## Description

Introduce real pnpm workspaces and PHP tooling only with their first consumers; document install/build scripts, ignore rules, and local WordPress integration. This is planned work; no implementation or PR is claimed.

## Technical requirements

- Keep WordPress Core, uploads, secrets, and database outside source; use the existing [link script](../../../../scripts/setup-links.sh) and stable Compose project identity.
- Introduce pnpm workspace packages and PHP tooling only when their first real consumers exist; add a lockfile and documented install/build commands.
- Ensure `.gitignore`, environment examples, scripts, and module boundaries support a clean checkout without copying local credentials.
- Document the bootstrap, expected outputs, and safe rollback in the root README and development guides.

## Acceptance criteria

- [ ] A fresh checkout can install and build the implemented packages from documented commands without local secrets.
- [ ] Workspace and PHP tooling correspond to real source modules; no empty placeholder packages or runtime files are tracked.
- [ ] The local WordPress integration remains functional and a conflicting symlink is refused safely.
- [ ] The reviewed PR is merged with reproducible setup evidence and task metadata.

## Testing requirements

Use a clean checkout for install/build and script smoke tests. Verify `bash -n scripts/setup-links.sh`, idempotent links, rejection of conflicting links, Compose configuration, WordPress recognition, and ignored secret/runtime paths. Record exact results.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `01-02`
- **Branch:** `chore/01-03-workspace-scaffold`
- **Commit references:** None.
- **PR number and URL:** None.
- **Started / completed / closed:** Started 2026-11-06; not completed or closed.
- **Status:** Busy. Follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-06 | Backlog → Ready | Dependency `01-02` was completed in PR [#8](https://github.com/EmVeeNL/blixis-wordpress/pull/8), merged as `d155e91987e6ace6d57380796ed0ac66890c5573`; owner and acceptance criteria are recorded. Package manager choice Q02 is part of this task's implementation planning. |
| 2026-11-06 | Ready → Busy | Branch `chore/01-03-workspace-scaffold` created; workspace and PHP tooling started |
