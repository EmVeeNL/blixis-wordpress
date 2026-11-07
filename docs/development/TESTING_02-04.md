# Task 02-04 semantic template tests

Test harness for the [semantic WordPress templates](../roadmap/phases/02-blixis-base-theme/04-semantic-templates.md). It is test evidence only; it does not mark the task Done. Results belong in the PR, with exact commands.

## Run

```sh
node --test tests/02-04/static.test.mjs && node tests/02-04/static.mjs   # host only, no Docker
tests/02-04/run.sh --static-only                                          # same, via the harness
tests/02-04/run.sh                                                        # WordPress 7.1.4/PHP 8.3 and 7.0.8/PHP 8.5, Chromium
tests/02-04/run.sh --browsers chromium,firefox --out /tmp/t0204           # CI configuration
tests/02-04/run.sh --theme-dir ../other-worktree/themes/blixis-base "7.1.4 8.3"
tests/02-04/run.sh --update-snapshots "7.1.4 8.3"                         # bless, then review `git diff tests/02-04/snapshots`
```

Needs Docker, `openssl`, `curl`, Node 26 and `pnpm install --frozen-lockfile` (for the locked Playwright 1.65.0 files; `T0204_NODE_MODULES` points at another checkout's `node_modules`). Exit `0` all passed, `1` a product check failed, `2` harness fault (Docker, download, install, server, missing `DONE-BROWSER` marker). Lines are `PASS`, `FAIL [browser:case]`, `NOTE`, `HARNESS`.

## What runs

**Static (`static.mjs`, in the CI `build` job).** Every template has balanced block markup, exactly one `<main>`, exactly one h1 source, exactly one `header` part (`tagName` header) and one `footer` part (`tagName` footer). Parts contain no `<main>` or h1; each navigation block has an `ariaLabel`; the header has navigation; templates cover index, archive, search, 404 and a page/single (or singular) route. No script, inline style, PHP, `wp:html` in templates. PHP translation calls use the `blixis-base` text domain. `static.test.mjs` proves each rule can fail (ten mutation controls).

**Rendered (`run.sh` + `browser.mjs`).** A disposable WordPress (random Compose project, tmpfs database, no published ports, no bind mounts, random passwords, never `~/Sites/blixis`) is seeded with fixed content. Per route, in a reduced-motion browser:

| Area | Assertion |
|---|---|
| Routes | posts index, static front page, page, single, category archive (page 1 and 2), date archive, search with results, empty search, blank search, hostile search, 404, out-of-range pagination 404, draft/private/scheduled post and draft page, password-protected post, long unbreakable title/URL/pre/table, special-character title, empty-title post |
| Landmarks | one `main`; one banner and one contentinfo outside sectioning content; order header, main, footer; each `nav` labelled with a unique name and links; one h1 (inside `main` except front), exact escaped title |
| Skip link | exactly one `a.skip-link`; non-empty; `#id` target exists once and is `main` or inside it; first Tab focuses it; focused it is fully on screen and passes axe contrast; Enter moves the hash and the next Tab skips the header; unfocused it is visually hidden, not `display:none` |
| Keyboard | order skip, header, main, footer; no trap; end reachable; every stop visible, on screen, and with a visible focus indicator (computed style differs focused vs. blurred); every rendered interactive control reachable; Shift+Tab reverses; search form submits with Enter; responsive menu opens and Escape returns focus (when a toggle shows at 320px) |
| Responsive | no horizontal overflow at 320, 768, 1280 px (offending elements are named) |
| Accessibility | axe-core 4.14.0 (WCAG 2.0/2.1/2.2 A and AA plus best-practice) at 320 and 1280 px; any violation fails and prints rule, count, and first targets; "needs review" items print as `NOTE`. A control page with known defects must be reported, proving the audit can fail |
| Privacy | no draft, private, pending, scheduled, or protected-body text or the post password in any rendered HTML; anonymous REST and feeds expose none of it; anonymous REST read of a draft refused; hostile search string neither executes nor injects markup |
| Network and console | no third-party requests, no failed sub-resources, no console errors or uncaught exceptions |
| i18n and RTL | `?t0204_locale=nl_NL` and `ar` (real language packs): `lang`, `dir`, `rtl` body class, skip link equals WordPress core's translation of "Skip to content" and differs from English, no overflow or axe violations at 320/1280, skip link on screen. `ar` covers page, single, archive, 404 |
| Snapshots | `snapshots/<route>.txt` is a semantic outline (lang, dir, title, viewport, skip link, landmarks, nav names and link text, headings, search forms, inputs, list sizes) rather than HTML. WordPress classes, ids, inline CSS, and dates are excluded. A mismatch prints the first differing lines. A missing snapshot fails with the bless command |

The axe-core tarball is downloaded at test time, checked against a pinned SHA-512 integrity value in `run.sh`, cached outside the repository, and never committed or added to the lockfile. Its licence is MPL-2.0.

## Integration expectations

Tests are written for the combined 02-04 implementation. On the branch at `da65932` (Base with only `index` and `singular`) they must fail: no header/footer parts, no search or 404 template. After the template and `theme.json` branches are merged:

1. `node tests/02-04/static.mjs` passes.
2. `tests/02-04/run.sh "7.1.4 8.3"` fails only with `semantic snapshot exists`.
3. Review the rendered outlines in the `--out` directory, then run `tests/02-04/run.sh --update-snapshots "7.1.4 8.3"`, inspect the diff, and commit the snapshots with the templates.
4. Run the default two-version matrix and `--browsers chromium,firefox`; outlines must be identical across versions.
5. Expected template contract: header and footer parts with slugs `header` and `footer`; `nav` blocks with `ariaLabel`; a search form (`wp:search`) in the search and 404 templates; the 404 and empty-search templates explain the result in `main`.

## Safety and limits

- Containers: random project `blixis-0204-<hex>`, MariaDB in tmpfs, secrets from `openssl rand` per run, nothing from `~/Sites/blixis`. Only this run's project is removed.
- Not covered: Safari/WebKit, screen reader announcement, real touch, Apache/nginx, page caches, comments, custom post types, Site Editor edits, and logged-in previews. Cache-control headers for 404 responses are not asserted. `axe` cannot judge everything (reading order, link purpose in context); manual review is still required for the PR.
- The empty-title post is recorded as a `NOTE` when it has no h1: core's post-title block renders nothing for an empty title, which the template author may choose to handle.
- Snapshot parity across WordPress versions is part of the check; a legitimate core markup change requires re-blessing with the diff reviewed.
