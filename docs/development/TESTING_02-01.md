# Task 02-01 theme integration tests

Disposable harness for the [Blixis Base parent theme](../roadmap/phases/02-blixis-base-theme/01-parent-theme-scaffold.md). It is test evidence only; it does not mark the task Done.

## Run

```sh
tests/02-01/run.sh                    # static checks, then the default matrix
tests/02-01/run.sh --static-only      # host-only, no Docker
tests/02-01/run.sh "7.1.4 8.4 pass"   # chosen combinations: "<wp> <php 8.2-8.5> <pass|reject>"
```

Requires Docker, `openssl`, and `php` on the host. Default matrix (about 2 minutes, downloads WordPress from wordpress.org):

| WordPress | PHP | Expected |
|---|---|---|
| 7.1.4, 7.0.8 | 8.3, 8.5 | Plugin and theme activate; all checks pass |
| 7.1.4 | 8.2 | Both refuse to activate (below the PHP floor) |
| 6.9.11 | 8.3 | Both refuse to activate (below the WordPress floor) |

Exit codes: `0` all passed, `1` product checks failed, `2` harness fault (Docker, download, install, or missing result marker). Output lines are `PASS`, `FAIL`, or `HARNESS`.

## What is checked

- **Static (host):** theme and plugin `Requires at least` is 7.0 and `Requires PHP` is 8.3; `php -l`; no output before `<?php`; `theme.json` parses, version 3, palette includes every slug in the [token contract golden](../contracts/tokens/v1/golden/default.theme.json), no unresolved or orphaned colour presets; a singular-capable template (`singular`, `single`, or `page`) prints `wp:post-content`; block markup is balanced; no inline script or style; no site branding.
- **Fixture:** activation, block theme, no parent, palette in global settings, rendered published post and page (200, unique marker after the excerpt length, title, one `main`, one `h1`, `lang` and viewport, no PHP errors), anonymous requests never see draft content, front page, REST index and login still answer with the plugin active, and the debug log has no Blixis entries.

## Safety

Each run uses a random Compose project name (`blixis-0201-<hex>`), a tmpfs MariaDB, a random root password, no published ports, and no bind mounts (files stream in as a tar). The WordPress server listens only inside the runner container. Nothing reads `~/Sites/blixis`, its database, links, `.env`, or the `blixis` project, and the stack is removed on exit. WP-CLI image digests are copied from the 01-02 spike.

## Baseline and limitations

- Before implementation lands, expected failures are: headers still 6.6 and 8.2, the missing `primary`, `surface`, and `muted` presets, no singular template, and no refusal below the floors. Any other failure, or exit code 2, is a harness problem.
- The harness was also run against a temporary patched copy (floors, token slugs, `singular.html`); every check passed. That copy is not part of the repository.
- Refusal relies on WordPress's own header check in WP-CLI; it does not test the admin UI.
- Only the PHP built-in server is covered, not Apache, nginx, or caches. No browser, accessibility, or visual checks; keyboard, reduced motion, and responsive behavior need separate tests.
- The orphan check only flags a non-contract palette slug that nothing references, so a retained `background` slug that `theme.json` still uses will pass.
- PHP 8.4 images are pinned but not in the default matrix.
