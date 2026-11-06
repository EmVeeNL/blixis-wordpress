# Git workflow

Branch from updated `main` using `feat/<task-id>-<description>`, `fix/...`, `chore/...`, or `docs/...`. Make Conventional Commits, open a pull request, review CI, and prefer squash merge. Protect `main` in GitHub settings with required review and checks; repository files cannot enforce branch protection.

Do not commit local `.env`, `wp-config.php`, uploads, dumps, generated dependencies, WordPress Core, or bundled WordPress themes. Review `git diff --cached --name-only` before committing. This restructuring branch intentionally remains uncommitted until review.
