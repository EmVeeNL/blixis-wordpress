# Blixis WordPress

Blixis source lives here. The running WordPress installation remains at `~/Sites/blixis`; Core, uploads, local configuration, and database data stay there or in Docker.

## Existing local installation

1. Keep `~/Sites/blixis` and its MariaDB container running. The existing Compose project is `blixis` and its volume is `blixis_mariadb_data`.
2. From this repository run `bash scripts/setup-links.sh`. Set `BLIXIS_WP_PATH` to an absolute WordPress path if it differs from the default. The script stops on any existing file or conflicting link.
3. Check `wp theme list --path=../blixis` and `wp plugin list --path=../blixis`. The theme is available but the installed Twenty Twenty-Five theme remains active. The plugin has no editor interface yet.
4. Open `https://blixis.test` and run `wp core is-installed --path=../blixis`.

For a new local database, copy `.env.example` to `.env` and set unique passwords before using Compose. Existing installations should retain their current credentials. The repository's Compose file sets `name: blixis` so its existing named volume is reused. Review [configuration](docs/development/CONFIGURATION.md) before changing the database setup.

## Source layout

- `themes/blixis-base`: minimal WordPress block parent theme.
- `plugins/blixis-blocks`: standalone plugin entry point; editor implementation is future work.
- `docs`: architecture, decisions, development guides, security, and roadmap.
- `scripts/setup-links.sh`: idempotent local symlink setup.
- `compose.yaml`: MariaDB service definition with stable Compose project name.

There is no JavaScript build or test suite yet. Add pnpm workspaces and CI checks when code needing them exists. See [architecture](docs/architecture/ARCHITECTURE.md) and [contributing](CONTRIBUTING.md).

The [migration record](docs/development/MIGRATION.md) documents the baseline, backup, validation, and rollback.
