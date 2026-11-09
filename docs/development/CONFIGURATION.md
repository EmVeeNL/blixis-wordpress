# Configuration and design tokens

## Local runtime

The WordPress installation is `~/Sites/blixis`; source is `~/Developer/WordPress/blixis-wordpress`. Keep `wp-config.php`, `.env`, uploads, and database data in the installation or Docker volume. `compose.yaml` fixes the project name to `blixis` so `blixis_mariadb_data` retains its identity. For the existing site, inspect Compose with `docker compose --env-file ~/Sites/blixis/.env -f compose.yaml config --quiet` and `ps`; never use `down -v`. A new installation must use its own credentials and check the intended volume before startup.

Run `bash scripts/setup-links.sh`; set `BLIXIS_WP_PATH` to an absolute path if WordPress lives elsewhere. The script accepts only its expected links and refuses conflicting files. The default points to `~/Sites/blixis`, independent of repository location.

## Planned theme configuration

`BlixisThemeConfig` is the accepted design for the canonical, server-validated site configuration. Task 03-02 implements the validator and the `--blixis-*` stylesheet generator in Blixis Blocks (`plugins/blixis-blocks/inc/tokens/validate.php` and `css.php`), and a matching TypeScript validator with preview properties in `packages/tokens`; see [token validation](TOKENS.md). Task 02-03 provides the theme.json projection. The [setup wizard](SETUP_WIZARD.md) (task 03-03) edits and stores the configuration in the `blixis_theme_config` option with compare-and-swap. Applying it to a site, preview, and rollback are not implemented yet (task 03-05). The [token contract](../contracts/tokens/README.md) requires one JSON WordPress option with compare-and-swap and export, revalidated on read; Q04 is resolved in the [decision record](../architecture/OPEN_QUESTIONS.md). Validate and version colors, local fonts, type scale, spacing, widths, radii, shadows, and motion. Breakpoints are fixed build inputs, not editable values. Use field-specific errors and keep the last valid configuration on invalid save. A save should validate, persist atomically, regenerate/invalidate CSS, refresh editor preview, and record an audit event. Do not write into Base or Core.

Tailwind CSS v4 is CSS-first. `@theme` maps known utilities at build time; runtime `--blixis-*` properties may change values under a validated CSS grammar. Runtime values cannot generate new utility class names or new breakpoint variants. MVP uses fixed breakpoint sets and mobile-first inheritance. See [token example](../examples/tokens.css) and [theme configuration example](../examples/theme-config.json); both match contract version 1.

Fonts come from the WordPress Font Library (Q13); Blixis checks each family's files and licence metadata and offers only usable families in the wizard. See [local fonts](FONTS.md). Secrets belong in local environment or server storage, never browser bundles or examples. The [support matrix](SUPPORT_MATRIX.md) records the approved versions; component headers were aligned in task 02-01.
