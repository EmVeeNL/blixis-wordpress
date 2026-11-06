# Git and CI workflow

Use GitHub Flow from synchronized `main`: short task branches such as `feat/04-03-editor-canvas`, `fix/05-05-preview-leak`, or `docs/01-01-requirements`; focused Conventional Commits; PR; checks and review; squash merge. Link the roadmap task and record real branch, commit, PR, merge, and completion metadata. `Done` requires verified merge; `Closed` requires release or acceptance. Use version tags and a migration plan for breaking contracts.

[CI checks](CI.md) lists every job, how to repair a failure, what is pinned, and current branch protection. GitHub `main` protection requires a PR and 16 checks, blocks force pushes and deletion, and applies to admins. It requires zero approving reviews; a stronger review count is recommended when reviewers are available. Add each new job with the code it checks and verify that it fails on a deliberate error.

A PR should include task ID, scope, tests, security/privacy and performance impact, screenshots for UI work, and migration/rollback notes. Do not commit credentials, WordPress runtime files, dumps, unlicensed assets, or generated dependencies. Review staged names and secret scan results before committing.

## Parallel agent worktrees

The primary checkout at `~/Developer/WordPress/blixis-wordpress` is the integration checkout and stays on synchronized `main` between tasks. Local agent worktrees live at `~/Developer/WordPress/blixis-wordpress-worktrees/claude` and `~/Developer/WordPress/blixis-wordpress-worktrees/codex`. They share Git history and remotes but have separate working files and branch checkouts. Each agent owns one worktree and one distinct task branch at a time. Git worktrees cannot check out the same local branch in two directories.

To start a task in an agent worktree, fetch origin, verify a clean working tree, then create a new branch from `origin/main` there. Use the task's normal branch name, such as `chore/01-04-quality-pipeline`; do not implement on a detached HEAD or on `main`. Before editing a file that another agent may own, coordinate the change or leave it to the other PR. Merge reviewed PRs one at a time. Bring published task branches up to date with a merge from `origin/main`; rebase only branches that have not been pushed.

The local WordPress site at `~/Sites/blixis` links theme and plugin directories from the **primary** checkout. Do not repoint these links or run `scripts/setup-links.sh` from an agent worktree against that site. Use the disposable fixture in a task's tests, or create a separate local WordPress installation and set `BLIXIS_WP_PATH` to its absolute path. Keep Compose project names, databases, ports, and volumes separate for simultaneous integration runs. `scripts/test-setup-links.sh` uses a temporary fake site and is safe from any worktree.

To inspect the layout, run `git worktree list`. Remove a worktree only after its branch is merged, its working tree is clean, and no agent is using it. Keep worktree directories outside the repository; they are local coordination state, not files to commit.
