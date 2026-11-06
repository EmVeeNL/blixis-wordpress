# Repository migration record

## Baseline and risks

On 2026-11-06, the running WordPress installation was `~/Sites/blixis`, itself a clean Git checkout on `chore/01-02-wordpress-setup` at `c6c31c5`. Remote `main` was `5f02e21` after PR #1. The site used Twenty Twenty-Five, had no plugins, and returned HTTP 200 at `https://blixis.test`. MariaDB 11.4 ran as Compose project `blixis`, service `mariadb`, on localhost port 3307 using volume `blixis_mariadb_data`.

Remote `main` tracked 403 files: 391 bundled WordPress theme files, 6 IDE files, 3 `wp-content` index files, `.gitignore`, `.nvmrc`, and `compose.yaml`. WordPress Core, `.env`, `wp-config.php`, and uploads were not tracked. There were no Blixis theme/plugin sources to migrate. A redacted Gitleaks history scan flagged a possible `linkedin-client-secret` in `wp-content/themes/twentytwentyfive/patterns/page-cv-bio.php` at commit `5f02e21`; review and rotate any real credential. History has not been rewritten.

## Plan and rollback

1. Preserve the site checkout and database. A readable 114,419-byte SQL backup with 12 table definitions is at `~/Sites/.blixis-backups/blixis-2026-11-06-before-restructure.sql` (owner-only permissions).
2. Clone remote `main` into `~/Sites/blixis-wordpress` and create `chore/01-03-restructure-monorepo`.
3. Remove third-party tracked copies in the new checkout only, after explicit approval. Keep originals in the running site.
4. Add source theme/plugin, docs, stable Compose name, and safe local links. Do not activate the new theme or plugin during restructuring.

To roll back local integration, unlink only `~/Sites/blixis/wp-content/themes/blixis-base` and `~/Sites/blixis/wp-content/plugins/blixis-blocks` after confirming they still target this checkout. The original site themes, uploads, config, Compose file, Git checkout, and database are unchanged. Do not restore the database unless data is actually damaged; inspect the target and take a new backup first.

## Validation record

- Passed: WP-CLI reports WordPress installed; linked Blixis theme and plugin are discoverable and inactive; bundled Twenty Twenty-Five remains active.
- Passed: `https://blixis.test` returned HTTP 200 after links were added.
- Passed: Compose configuration validates from the new checkout with the existing `.env`; running container remains healthy in project `blixis` and uses the existing volume.
- Passed: `mariadb-check` inside the running container reported all 12 Blixis tables OK.
- Passed: link script rerun reports both links already present; Bash syntax, PHP syntax, and `theme.json` parse checks pass.
- Passed: current working files passed Gitleaks directory scan; no local configuration or backup was staged.
- Limited: WP-CLI `wp db check` could not run because `mysqlcheck` is not installed on the host; the container-side table check passed.
- Open: history scan flagged a possible secret in a now-removed bundled theme file; Git history was preserved.
- Passed: PR #2 was squash merged into `main` as `1006a5a`. GitHub `main` protection now requires pull requests and the `syntax` check, applies to admins, requires linear history, and blocks force pushes and branch deletion. Required approval count is zero; maintainers can raise it when reviewers are available.
- Not run: theme activation, plugin activation, JavaScript build, TypeScript checks, unit tests, and dependency scanning. Those features/toolchains are not implemented yet.
