# Contributing

Read [AGENTS.md](AGENTS.md), the [architecture](docs/architecture/ARCHITECTURE.md), [Git workflow](docs/development/GIT.md), and the relevant [task](docs/roadmap/ROADMAP.md). Use a focused branch and Conventional Commits. A PR should cite the task, explain impact and rollback, and report exact test results. Keep the runtime and database intact. Do not commit secrets, customer data, unlicensed fonts/assets, or bundled WordPress files.

Review permission checks, schema compatibility, semantic HTML, responsive and keyboard behavior, performance, tests, and documentation. Add automated checks when a real feature needs them. Run `php -l` on changed PHP, parse changed JSON, and verify WordPress recognition when component links change. Update an ADR for contract changes.
