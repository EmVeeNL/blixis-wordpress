# Blixis WordPress

**Status:** repository foundation implemented; product features are planned. Source is at `~/Developer/WordPress/blixis-wordpress`. The running WordPress installation is `~/Sites/blixis`; Core, uploads, local configuration, and MariaDB data remain there or in Docker.

Blixis aims to combine a neutral **Blixis Base** parent theme, site-specific child themes, the **Blixis Blocks** visual editor, and a controlled Content API. The first client site is planned for Wilde Groei. The present code contains a minimal discoverable block theme and plugin entry point. It does not yet contain a visual editor, token wizard, or API.

## Local setup

1. Keep the existing `~/Sites/blixis` site and `blixis` MariaDB project intact. For a different site path, set `BLIXIS_WP_PATH` to its absolute path.
2. Run `bash scripts/setup-links.sh` from this repository. It only creates or verifies the two Blixis component links and refuses conflicts.
3. Check `wp core is-installed --path="$HOME/Sites/blixis"`, `wp theme list --path="$HOME/Sites/blixis"`, and `wp plugin list --path="$HOME/Sites/blixis"`. The Blixis components are available but need not be active.
4. Check the site URL and Compose health without changing runtime data. See [configuration](docs/development/CONFIGURATION.md).

Do not copy local `.env`, `wp-config.php`, uploads, or database dumps into this checkout. There is no JavaScript build suite yet. The live CI runs a PHP syntax check; expanded CI is planned alongside actual code.

## Documentation

Start with the [documentation index](docs/README.md), [PRD](docs/architecture/PRD.md), [architecture](docs/architecture/ARCHITECTURE.md), [decisions](docs/architecture/DECISIONS.md), [MVP](docs/roadmap/MVP.md), and [roadmap](docs/roadmap/ROADMAP.md). The [migration record](docs/development/MIGRATION.md) explains the source/runtime split and relocation. Follow [contributing](CONTRIBUTING.md) and [agent instructions](AGENTS.md) for task work.
