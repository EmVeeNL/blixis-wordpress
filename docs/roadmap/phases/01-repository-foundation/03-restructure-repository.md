---
id: "R-01"
title: "Restructure repository and separate runtime"
phase: "repository-foundation"
status: Done
priority: P0
owner: null
created_at: "2026-11-06"
updated_at: "2026-11-06"
depends_on: []
branch: "chore/01-03-restructure-monorepo"
pr_number: 2
pr_url: "https://github.com/EmVeeNL/blixis-wordpress/pull/2"
commit_sha: "1006a5a"
merged_at: "2026-11-06"
merge_commit_sha: "1006a5a"
started_at: null
completed_at: "2026-11-06"
closed_at: null
blocked_reason: null
blocked_by: []
---

# R-01 — Restructure repository

- **Status:** Done
- **Priority:** P0
- **Dependencies:** Existing WordPress installation and database backup
- **Branch:** `chore/01-03-restructure-monorepo`
- **Commit references:** `1006a5a` (squash merge)
- **PR number / URL / status:** [#2](https://github.com/EmVeeNL/blixis-wordpress/pull/2) / Merged
- **Completion date:** 2026-11-06

## Description and technical scope

Separate Blixis source from WordPress Core and runtime data. Preserve Git history, site content, and MariaDB volume identity. Provide minimal theme/plugin source, safe links, documentation, and practical validation.

## Implementation details

Clone remote `main` into the separate source checkout (originally `~/Sites/blixis-wordpress`; now `~/Developer/WordPress/blixis-wordpress`). Keep the existing site at `~/Sites/blixis`. Add a stable Compose project name, source components, and an idempotent link script. Remove third-party tracked files from the source repository only after explicit review of the file list and consequences.

## Acceptance criteria

- Source repository contains Blixis-owned files only.
- Runtime site and database are operational with unchanged content.
- Theme and plugin links resolve and WordPress discovers both.
- CI checks correspond to implemented tooling.
- Git history remains intact and no secrets are staged.
- Documentation matched the migration at merge; subsequent location changes are recorded in this documentation branch.

## Tests and documentation

Run WP-CLI installed/theme/plugin checks, site HTTP check, Compose config/health check, PHP lint, JSON parse, shell syntax check, link idempotency check, Git status and tracked-file audit. Record results in the migration report. Update README, architecture, configuration, Git, security, and roadmap docs. Do not mark Done until every acceptance criterion is verified.
