# Git and CI workflow

Use GitHub Flow from synchronized `main`: short task branches such as `feat/04-03-editor-canvas`, `fix/05-05-preview-leak`, or `docs/01-01-requirements`; focused Conventional Commits; PR; checks and review; squash merge. Link the roadmap task and record real branch, commit, PR, merge, and completion metadata. `Done` requires verified merge; `Closed` requires release or acceptance. Use version tags and a migration plan for breaking contracts.

Current GitHub `main` protection requires a PR and the `syntax` check, blocks force pushes and deletion, and applies to admins. It currently requires zero approving reviews; a stronger review count is recommended when reviewers are available. The repository currently has `.github/workflows/php-lint.yml`; the downloaded `ci.yml` is a **scaffold** that assumes absent JavaScript scripts, so it is not installed as a live workflow. Add each job with the corresponding implementation and verify it fails on deliberate errors. Use minimal workflow permissions and pin actions when production CI is expanded.

A PR should include task ID, scope, tests, security/privacy and performance impact, screenshots for UI work, and migration/rollback notes. Do not commit credentials, WordPress runtime files, dumps, unlicensed assets, or generated dependencies. Review staged names and secret scan results before committing.
