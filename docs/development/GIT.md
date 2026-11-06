# Git workflow

Branch from updated `main` using `feat/<task-id>-<description>`, `fix/...`, `chore/...`, or `docs/...`. Make Conventional Commits, open a pull request, review CI, and prefer squash merge. GitHub `main` protection requires a pull request and the `syntax` check, applies to admins, and blocks force pushes and deletion. It currently requires no approving review; raise that count when reviewers are available.

Do not commit local `.env`, `wp-config.php`, uploads, dumps, generated dependencies, WordPress Core, or bundled WordPress themes. Review `git diff --cached --name-only` before committing.
