# Optional Blixis showcase

Test harness for the [Blixis showcase](../roadmap/phases/02-blixis-base-theme/05-base-showcase.md): an optional child theme of Blixis Base. It is test evidence only and does not mark the task Done. Results belong in the PR with exact commands. The showcase is a separate, optional child theme. It is never starter content for new sites, and Base stays brand-neutral.

## Install and remove

Copy `themes/blixis-base` and `themes/blixis-showcase` into a disposable or intended WordPress installation’s `wp-content/themes`, then activate **Blixis Showcase** explicitly. The standard link script intentionally installs only Base and Blocks. The child supplies a front-page template with core-block patterns; activation creates no pages, options, navigation or media. Existing page content stays in the database, although the showcase front-page template takes precedence on the home URL. Switch back to Base to restore its normal templates. Delete the inactive child directory to uninstall. No database migration is needed.

For the local `~/Sites/blixis` installation, link the optional child only when you want to view it:

```sh
ln -s "$HOME/Developer/WordPress/blixis-wordpress/themes/blixis-showcase" "$HOME/Sites/blixis/wp-content/themes/blixis-showcase"
wp --path="$HOME/Sites/blixis" theme activate blixis-showcase
```

First check that no file or symlink already occupies the target. The theme's 1200×900 `screenshot.png` is a capture of the rendered English showcase, used by WordPress under Appearance → Themes. It shows the child theme, not the neutral Base parent or a completed Blocks editor. Base has its own 1200×900 `screenshot.png`, a capture of the unbranded Base theme rendering a plain sample page. Both screenshots come from a disposable WordPress fixture (the harness mu-plugin renders Base alone with `?t0205_theme=blixis-base`), never from `~/Sites/blixis`. Retake them after visual changes.

Branding and its fixed demonstration palette belong exclusively to this optional child. Its `theme.json` is not the future canonical token configuration or a token settings interface. It inherits Base’s header, footer and inner-page templates.

## Run

```sh
node --test tests/02-05/static.test.mjs && node tests/02-05/static.mjs   # host only, no Docker
tests/02-05/run.sh --static-only                                          # same, plus php -l, via the harness
tests/02-05/run.sh                                                        # WordPress 7.1.4/PHP 8.3 and 7.0.8/PHP 8.5, Chromium
tests/02-05/run.sh --browsers chromium,firefox --out /tmp/t0205           # CI configuration
tests/02-05/run.sh --child-dir ../other-worktree/themes/<slug> "7.1.4 8.3"
```

Needs Docker, `openssl`, `curl`, Node 26 and `pnpm install --frozen-lockfile` (`T0205_NODE_MODULES` points at another checkout's `node_modules`). Exit `0` all passed, `1` a product check failed, `2` harness fault. Lines are `PASS`, `FAIL [browser:route]`, `CHECK pass|fail`, `NOTE`, `HARNESS`. Screenshots at 320, 768 and 1280 px, `report.json` (axe results and measured contrast) and `browser.log` land in `--out`.

The child theme is found as the `themes/*` directory whose `style.css` has `Template: blixis-base`. With none present the run fails with an explicit "expected gap" message.

## Isolation

A disposable Compose project (`blixis-0205-<random>`, tmpfs database, no published ports, no bind mounts, random passwords, pinned images) installs a fresh WordPress. It never touches `~/Sites/blixis`, its database, its links, or the `blixis` Compose project, and never runs `setup-links.sh`. axe-core 4.14.0 is downloaded to `~/.cache/blixis-tests` and verified by SHA-512 before use.

## What runs

**Static (`static.mjs`, host only).** Child `style.css` has Theme Name, Version, License and `Template: blixis-base`; the text domain equals the directory name; `theme.json` is valid and versioned; Showcase has a 1200×900 PNG admin screenshot; no external stylesheet, font, script or remote `@import`; no inline script or dangerous PHP function; no credential-like strings; every `<img>` carries `alt`; every binary asset has an entry in [`docs/assets/README.md`](../assets/README.md) (by file name, or by hash against a file in `docs/assets`) and fonts need a licence record; no capability claim (drag and drop, page builder, setup wizard, visual or live token editor, element registry, AI, cloud sync, "WCAG compliant" and similar) unless the same line says it is planned or not yet available. Base files never mention the child's name or slug and ship no binary asset except its own 1200×900 `screenshot.png`, which needs a rights entry and must not duplicate the concept preview or the Showcase screenshot. `static.test.mjs` proves the original rules can fail (20 controls).

**Setup (`run-wp.sh`).** On the fixture: Base alone renders one `main`, no child branding and no webfonts; WordPress reports no theme errors for the child; activating it gives stylesheet = child, template = `blixis-base`, and a block theme; Base files are byte-identical before and after activation and seeding.

**Rendered (`browser.mjs`).** Front page (the child’s `front-page.html` template renders its hero, principles and status patterns), About, Contact, a post, search, 404, an unpublished page, and up to six inner pages found through the header navigation. Per route, in a reduced-motion browser:

| Area | Assertion |
|---|---|
| Semantics | one `main`; one banner and one contentinfo outside sectioning content; one visible h1 inside `main` (front page too); heading levels do not skip downward; unique labelled navigation with links; one skip link into `main`; lang, title, scalable viewport; no empty link |
| Content | every image loaded, has `alt`, keeps its aspect ratio; no placeholder, `Hello world!`, `Sample Page`, lorem, `undefined`/`NaN`; no claim of an unimplemented capability in visible copy; no draft content or secret in HTML or feed |
| Contrast | rendered text colour against its composited background, 4.5:1 (3:1 for large text), per width. Areas over images or gradients are skipped and listed as `NOTE contrast skipped`, which needs the manual review below. Focus indicators need 3:1 |
| axe-core | WCAG 2.0/2.1/2.2 A and AA plus best-practice rules at 320, 768 and 1280 px; rules needing review are listed as `NOTE` |
| Layout (front page) | at 1440, 1280, 820, 390 and 320 px the header wordmark, hero eyebrow and heading, first principle icon, status heading, first card and footer wordmark share one left edge (1 px tolerance); the status band spans the full viewport; principle items in the same row share one top. Two controls prove the audit fails on a shifted wordmark and a row 16 px lower; a further check confirms the Base-alone capture renders Base only |
| Responsive | no horizontal overflow at 320, 768 and 1280 px; WCAG 1.4.12 text-spacing overrides at 320 px cause no overflow; each full-page screenshot is non-blank |
| Keyboard | first Tab is the skip link; Enter moves past the header; order is header, main, footer; no trap; each stop is on screen, not covered (WCAG 2.4.11), has a visible indicator, and non-inline targets are at least 24 by 24 px (WCAG 2.5.8) |
| Runtime | no console error, uncaught exception, failed sub-resource or third-party request; no PHP warning, notice, deprecation or database error in `debug.log` (WP-CLI's own phar noise excluded) |
| Controls | a low-contrast page, a broken page and a 600 px box at 320 px must be reported by the contrast, axe and overflow audits |

## Manual visual review

Automation cannot judge appearance. Open the screenshots from `--out` at 320, 768 and 1280 px and confirm: the hierarchy reads, nothing is clipped or overlaps, text over images is legible (the automatic contrast check skips those areas), images are cropped sensibly, and spacing is even. Record what you reviewed, the viewport, and the date in the PR. Automated results do not replace this review, and none of this is a complete WCAG audit.

## Assets and rights

Image rights are recorded only in [`docs/assets/README.md`](../assets/README.md); these tests read it and never change it. A binary in the child theme without an entry there fails the static check.

## Known and expected gaps

- Colour contrast over images and gradients, focus order of non-native widgets, and visual quality need the manual review.
- Only Chromium runs by default; CI also runs Firefox. WebKit is not covered.

## Status copy

The Design tokens card states exactly what exists: validated tokens with the setup screens under Appearance, preview, and rollback are implemented (phase 03); the Blocks card says the editor is planned. Header and hero links point only to sections of the page (`#showcase-features`, `#showcase-status`) and the home page. The concept image's call-to-action and card links are not reproduced because their destinations do not exist.

## Integration evidence (2026-11-08)

`T0205_NODE_MODULES=<primary-checkout>/node_modules bash tests/02-05/run.sh --browsers chromium,firefox --out /tmp/blixis-0205-final` passed against WordPress 7.1.4/PHP 8.3 and WordPress 7.0.8/PHP 8.5. Each combination passed 8 setup checks and 465 browser checks, with no PHP warnings, notices, deprecations or database errors. All 14 static negative controls passed. The exact front-page heading is asserted so neutral fallback content cannot pass as a showcase. ShellCheck, actionlint, PHP_CodeSniffer and documentation checks passed.

Manual review covered full-page screenshots at 320, 768 and 1280 CSS pixels: content stacks on narrow screens, the hero and card grids align, both in-page links work through keyboard checks, and there is no overlap or clipped copy. The blue/cyan concept is interpreted with CSS artwork; the supplied concept bitmap remains documentation only. The child theme contains a generated WordPress admin screenshot, with no third-party image, font, CDN dependency or public JavaScript.

The automated contrast audit reports hero gradient backgrounds for manual review. The hero's muted `#465675` text measures at least 6.75:1 against its light gradient stops; blue `#0645f5` buttons and links against white measure 6.61:1. The concept label sits on opaque white, with `#111827` text at 17.74:1. Cyan is decorative, not a text background. This evidence is not a complete WCAG conformance audit; WebKit remains outside this task's browser matrix. CI retains screenshots and detailed axe/contrast reports in its `showcase-0205` artifact for seven days.

## Template audit fixes (2026-11-08)

The template audit aligned every band to one inset, so the header wordmark, hero copy, principles, status heading, cards and footer share one left edge at 1440, 820, 390 and 320 px, and the status band spans the full viewport. The principle-row top margin that raised the first item is gone, duplicate hero and unused concept rules were removed, headline and wordmark tracking were loosened, and the Unicode symbols became decorative inline SVG line icons. Fonts remain system fonts; local font choice (Q13) stays open.

Evidence: `T0205_NODE_MODULES=<primary-checkout>/node_modules bash tests/02-05/run.sh --browsers chromium,firefox` passed on WordPress 7.1.4/PHP 8.3 and WordPress 7.0.8/PHP 8.5 (8 setup and 478 browser checks each, no PHP warnings), plus 20 static negative controls. Axe reports hero colour contrast as "needs review" because of the gradient; the hero text colour was checked by hand against the light stops.
