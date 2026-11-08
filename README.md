# Blixis WordPress

[![CI: PHP syntax and documentation](https://github.com/EmVeeNL/blixis-wordpress/actions/workflows/php-lint.yml/badge.svg)](https://github.com/EmVeeNL/blixis-wordpress/actions/workflows/php-lint.yml)
[![Project status: foundation](https://img.shields.io/badge/status-foundation-blue)](docs/roadmap/ROADMAP.md)
[![Platform: WordPress](https://img.shields.io/badge/platform-WordPress-21759B?logo=wordpress&logoColor=white)](https://wordpress.org/)
[![PHP requirement: 8.3 or newer](https://img.shields.io/badge/PHP-8.3%2B-777BB4?logo=php&logoColor=white)](themes/blixis-base/style.css)
[![Documentation](https://img.shields.io/badge/docs-project%20guide-0A66C2)](docs/README.md)

**Blixis** is a planned WordPress theme and visual content platform. Its architecture combines a neutral **Blixis Base** parent theme, site-specific child themes, the **Blixis Blocks** editor, and a controlled Content API. The first client implementation is planned for **Wilde Groei**.

The first release line is planned as **v1.0.x for single-site WordPress**. WordPress Multisite support is planned for **v1.1**; see [task 09-06](docs/roadmap/phases/09-future-extensions/06-multisite-support.md).

> **Current state:** This repository contains a minimal WordPress block theme, a plugin entry point, local integration scripts, and project documentation. The child-theme wizard, visual editor, element renderer, and Content API are planned; the preview below is a concept image, not a screenshot of working software.

![Concept preview of Blixis Base, showing a proposed website and editor](docs/assets/blixis-base-preview.png)

*Concept preview supplied for the Blixis Base vision. It does not represent the current theme output.*

**Keywords:** `wordpress` · `block-theme` · `page-builder` · `design-tokens` · `tailwindcss-v4` · `react` · `content-api`

**Maintainer:** Michael ([@EmVeeNL](https://github.com/EmVeeNL))

## What exists today

| Area | Current state | Next step |
|---|---|---|
| Blixis Base | Neutral parent block theme with semantic templates, accessible navigation, and contract presets; inactive in the local site | Live token configuration |
| Blixis Blocks | Installable plugin entry point; no editor UI | Versioned registry, editor, persistence, and PHP rendering |
| Child themes | Optional [Blixis Showcase](docs/development/SHOWCASE.md) with core-block patterns and a blue/cyan demonstration palette | Generator, validated token setup, and preview |
| Content API | Proposed, not implemented | Approve access model and build read-only published-content routes |
| Quality checks | GitHub Actions runs the [checks listed here](docs/development/CI.md) on existing code: PHP, TypeScript, build, browser and WordPress tests, scripts, secrets, and dependencies | Add jobs as new packages arrive |

See the [PRD](docs/architecture/PRD.md), [MVP scope](docs/roadmap/MVP.md), and [roadmap](docs/roadmap/ROADMAP.md) for the intended product and sequence. A documented plan is not an implementation claim.

## Local development

The source checkout and the running WordPress installation are deliberately separate:

```text
~/Developer/WordPress/blixis-wordpress/   # Blixis-owned source (this repository)
~/Sites/blixis/                            # Local WordPress Core, content, and configuration
```

The existing local site uses the Docker Compose project `blixis` and MariaDB volume `blixis_mariadb_data`. Keep its database, uploads, `.env`, and `wp-config.php` in the runtime installation. This repository does not install WordPress Core or create a new site for you.

### Prerequisites

- A working local WordPress installation and WP-CLI for the verification commands below.
- WordPress 7.0 or newer and PHP 8.3 or newer, matching the theme and plugin headers and [support matrix](docs/development/SUPPORT_MATRIX.md).
- Docker Compose only if you use the included MariaDB service definition.

### Link the Blixis components

From the source checkout:

```bash
bash scripts/setup-links.sh
wp core is-installed --path="$HOME/Sites/blixis"
wp theme list --path="$HOME/Sites/blixis"
wp plugin list --path="$HOME/Sites/blixis"
```

`setup-links.sh` links `themes/blixis-base` and `plugins/blixis-blocks` into the local site. It is safe to rerun and stops if a different file or link already occupies either destination. Set `BLIXIS_WP_PATH` to an **absolute** WordPress path before running the script if your site is elsewhere. Linking does not activate the theme or plugin.

To inspect the existing database service without changing it:

```bash
docker compose --env-file "$HOME/Sites/blixis/.env" -f compose.yaml config --quiet
docker compose --env-file "$HOME/Sites/blixis/.env" -f compose.yaml ps
```

Read [configuration](docs/development/CONFIGURATION.md) and the [migration record](docs/development/MIGRATION.md) before changing local infrastructure. Never put runtime credentials, uploads, or database dumps in this repository.

## Install and build

A fresh checkout needs Node 26.13.0 (see `.nvmrc`), pnpm 12.18.0, PHP 8.3 or newer, and Composer. No local secrets, WordPress site, or database are required.

```bash
npm install --global pnpm@12.18.0   # or prefix the pnpm commands with: npx pnpm@12.18.0
pnpm install --frozen-lockfile
pnpm build                          # also: pnpm typecheck, pnpm lint, pnpm format:check
composer install
composer lint                       # PHP_CodeSniffer on plugins and themes
bash scripts/test-setup-links.sh    # tests the link script on a temporary fake site
```

`pnpm build` writes the committed `themes/blixis-base/assets/build/tailwind.css` and ignored spike `dist/` and `dist-css/` folders. Commit reviewed theme CSS changes with their sources; production WordPress hosts need no Node. `composer install` writes ignored `vendor/`; dependencies and spike build output stay outside the linked theme and plugin directories.

pnpm refuses other Node major versions. Package build scripts stay off unless listed in `pnpm-workspace.yaml`. The workspace includes the compatibility and contract proofs plus the Base theme CSS package.

To undo a local install, delete `node_modules/`, `vendor/`, and those build folders. This does not affect the site, its database, or the links. CI runs these commands; see [CI checks](docs/development/CI.md).

For parallel Claude and Codex work, use separate [Git worktrees](docs/development/GIT.md#parallel-agent-worktrees). The primary checkout remains the only source linked into `~/Sites/blixis`; worktrees use disposable WordPress fixtures for integration tests.

## Repository map

```text
themes/blixis-base/       Parent block theme and committed Tailwind CSS
themes/blixis-showcase/   Optional showcase child; never mandatory starter content
plugins/blixis-blocks/    Plugin entry point
scripts/                  Safe local links, their test, and documentation validation
spikes/                   Feasibility evidence; not product code
docs/                     Product, architecture, development, security, and roadmap
.github/workflows/        CI checks; see docs/development/CI.md
compose.yaml              MariaDB service with a stable Compose project name
package.json              pnpm workspace root; pnpm-workspace.yaml lists its packages
composer.json             PHP quality tooling; phpcs.xml.dist holds its rules
```

The `docs/elements/` JSON files and `docs/examples/` are **specifications and examples**, not production registry code. Future workspaces should be introduced with their first real consumers.

## Documentation and roadmap

- [Documentation index](docs/README.md) — guide to all project documents.
- [Architecture](docs/architecture/ARCHITECTURE.md), [decisions](docs/architecture/DECISIONS.md), and [open questions](docs/architecture/OPEN_QUESTIONS.md).
- [Blixis Base and child themes](docs/development/TEMPLATE.md), [editor](docs/architecture/EDITOR.md), [element registry](docs/architecture/ELEMENTS.md), and [API proposal](docs/architecture/API.md).
- [Roadmap](docs/roadmap/ROADMAP.md) — nine phases with individual task files, dependencies, status, acceptance criteria, and testing requirements.
- [Security and performance](docs/security/SECURITY_AND_PERFORMANCE.md), [Git and CI workflow](docs/development/GIT.md), and [contributing](CONTRIBUTING.md).

## Contributing

Michael ([@EmVeeNL](https://github.com/EmVeeNL)) owns the roadmap tasks. Follow [AGENTS.md](AGENTS.md), the relevant task file, and [Contributing](CONTRIBUTING.md). Use a task branch from `main`, Conventional Commits, and a PR with exact test results. Update task status only when its evidence supports the transition.

This repository has no published release of the planned editor or API. Code and documentation are licensed under [GPL-2.0-or-later](LICENSE). The two project images have separate [asset rights](docs/assets/README.md).
