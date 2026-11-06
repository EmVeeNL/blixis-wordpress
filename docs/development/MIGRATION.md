# Repository migration record

## Earlier source/runtime separation

On 2026-11-06, PR [#2](https://github.com/EmVeeNL/blixis-wordpress/pull/2) separated Blixis-owned source from the running WordPress checkout. The prior source checkout was `~/Sites/blixis-wordpress`; `~/Sites/blixis` remained the runtime. The existing MariaDB project and volume were `blixis` and `blixis_mariadb_data`. The original baseline, SQL backup location, prior checks, and historical secret-scan concern were recorded in the earlier version of this file in Git history. No database restore was required.

## 2026-11-06 local source relocation

The clean source checkout on `main` at `2d88d52` was moved to `~/Developer/WordPress/blixis-wordpress`. Destination was absent. The two runtime symlinks were retargeted to the new source while leaving Core, uploads, `.env`, `wp-config.php`, the site checkout, and the MariaDB volume untouched. The remote URL and Git history were preserved. `main` matched `origin/main` after fetch; branch `docs/blixis-project-documentation` was created from that commit.

The link script now defaults to `~/Sites/blixis`, independent of source location. To roll back this local relocation, first verify the destination and runtime symlink targets, move the checkout back to an empty original path, and retarget only the two Blixis symlinks. No database action belongs in this rollback.

See [configuration](CONFIGURATION.md) for current paths and safe Compose commands. The completed migration record is [R-01](history/R-01-restructure-repository.md).

## Earlier validation and unresolved history item

The earlier migration verified WordPress installation, theme/plugin discovery (both inactive), HTTP 200 at `https://blixis.test`, healthy Compose service, all 12 MariaDB tables, link-script idempotency, Bash/PHP/JSON checks, and a current-file Gitleaks scan. Host `wp db check` was unavailable because `mysqlcheck` was absent; container-side `mariadb-check` passed. A readable pre-restructure SQL backup was kept outside Git at `~/Sites/.blixis-backups/blixis-2026-11-06-before-restructure.sql`. The earlier history scan flagged a possible `linkedin-client-secret` in a bundled Twenty Twenty-Five pattern at commit `5f02e21`; the file was removed from the current source tree, history was preserved, and any real credential should be reviewed and rotated.

## Relocation validation

After relocation, `git fetch origin` left `main`, `origin/main`, and the new branch base at `2d88d52`; the origin URL and history were unchanged. The link script reports both links already present, and their filesystem targets match the relocated theme and plugin. WP-CLI reports WordPress installed, Blixis Base and Blocks discoverable but inactive, and Twenty Twenty-Five active; WP-CLI emits a deprecation warning from its bundled dependency. The site returned HTTP 200. Compose configuration passed and `blixis-mariadb` remained healthy on localhost port 3307. PHP syntax, JSON parsing, Bash syntax, workflow YAML, documentation links and task metadata, and `git diff --check` passed. A current working-tree Gitleaks directory scan reported no leaks. No database, upload, or runtime configuration change was made.
