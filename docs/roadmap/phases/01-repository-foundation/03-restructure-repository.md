# 01-03 — Restructure repository

- **Status:** Done
- **Priority:** High
- **Dependencies:** Existing WordPress installation and database backup
- **Branch:** `chore/01-03-restructure-monorepo`
- **Commit references:** `1006a5a` (squash merge)
- **PR number / URL / status:** [#2](https://github.com/EmVeeNL/blixis-wordpress/pull/2) / Merged
- **Completion date:** 2026-11-06

## Description and technical scope

Separate Blixis source from WordPress Core and runtime data. Preserve Git history, site content, and MariaDB volume identity. Provide minimal theme/plugin source, safe links, documentation, and practical validation.

## Implementation details

Clone remote `main` into `~/Sites/blixis-wordpress`. Keep the existing site at `~/Sites/blixis`. Add a stable Compose project name, source components, and an idempotent link script. Remove third-party tracked files from the source repository only after explicit review of the file list and consequences.

## Acceptance criteria

- Source repository contains Blixis-owned files only.
- Runtime site and database are operational with unchanged content.
- Theme and plugin links resolve and WordPress discovers both.
- CI checks correspond to implemented tooling.
- Git history remains intact and no secrets are staged.
- Documentation matches actual paths and commands.

## Tests and documentation

Run WP-CLI installed/theme/plugin checks, site HTTP check, Compose config/health check, PHP lint, JSON parse, shell syntax check, link idempotency check, Git status and tracked-file audit. Record results in the migration report. Update README, architecture, configuration, Git, security, and roadmap docs. Do not mark Done until every acceptance criterion is verified.
