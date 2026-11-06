# Architecture decisions

## ADR 001 — Separate source from the runtime

Source is cloned from remote `main` into `~/Sites/blixis-wordpress`; the working installation stays at `~/Sites/blixis`. Links join local theme/plugin source to WordPress. This avoids moving Core, uploads, configuration, or the database. The old site's Git checkout is preserved until its removal can be reviewed separately.

## ADR 002 — Stable Compose identity

The existing Compose project is `blixis` and its named volume is `blixis_mariadb_data`. `name: blixis` in the repository Compose file prevents a change in project/volume identity when commands run from the new directory. Do not run both Compose definitions to recreate the service; verify configuration first.

## ADR 003 — Block parent theme

Use a WordPress block theme and child themes for site variants. Theme JSON and WordPress native styles provide standard inheritance; token generation and Tailwind come when implemented.
