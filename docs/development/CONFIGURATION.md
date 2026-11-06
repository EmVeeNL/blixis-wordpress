# Configuration and design tokens

## Local runtime

The WordPress installation is `~/Sites/blixis`; source is `~/Developer/WordPress/blixis-wordpress`. Keep `wp-config.php`, `.env`, uploads, and database data in the installation or Docker volume. `compose.yaml` fixes the project name to `blixis` so `blixis_mariadb_data` retains its identity. For the existing site, inspect Compose with `docker compose --env-file ~/Sites/blixis/.env -f compose.yaml config --quiet` and `ps`; never use `down -v`. A new installation must use its own credentials and check the intended volume before startup.

Run `bash scripts/setup-links.sh`; set `BLIXIS_WP_PATH` to an absolute path if WordPress lives elsewhere. The script accepts only its expected links and refuses conflicting files. The default points to `~/Sites/blixis`, independent of repository location.

## Planned theme configuration

`BlixisThemeConfig` is the accepted design for the canonical, server-validated site configuration; it is not implemented yet. Generated CSS and `theme.json` are outputs. The [token contract](../contracts/tokens/README.md) requires one JSON WordPress option with compare-and-swap and export, revalidated on read; Q04 is resolved in the [decision record](../architecture/OPEN_QUESTIONS.md). Validate and version colors, local fonts, type scale, spacing, widths, radii, shadows, and motion. Breakpoints are fixed build inputs, not editable values. Use field-specific errors and keep the last valid configuration on invalid save. A save should validate, persist atomically, regenerate/invalidate CSS, refresh editor preview, and record an audit event. Do not write into Base or Core.

Tailwind CSS v4 is CSS-first. `@theme` maps known utilities at build time; runtime `--blixis-*` properties may change values under a validated CSS grammar. Runtime values cannot generate new utility class names or new breakpoint variants. MVP uses fixed breakpoint sets and mobile-first inheritance. See [token example](../examples/tokens.css) and [theme configuration example](../examples/theme-config.json); both match contract version 1.

Prefer locally hosted, WordPress-registered font faces; validate type, size, and license. Secrets belong in local environment or server storage, never browser bundles or examples. The [support matrix](SUPPORT_MATRIX.md) records the approved target versions; current component headers will be aligned in task 02-01.
