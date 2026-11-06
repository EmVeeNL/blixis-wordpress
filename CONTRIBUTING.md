# Contributing

Read [architecture](docs/architecture/ARCHITECTURE.md) and the [roadmap](docs/roadmap/ROADMAP.md). Use a task branch from current `main`, make focused Conventional Commits, and open a PR with scope, tests run, and any manual WordPress checks. Keep the existing runtime and database intact. Do not commit secrets or bundled WordPress files.

For local development, follow [README](README.md). Run `php -l` on changed PHP files, validate JSON with a parser, and check WordPress recognition through WP-CLI when changing linked components. Add focused automated tests with the feature they verify.
