# Local fonts

Task [03-04](../roadmap/phases/03-child-theme-setup-wizard/04-font-management.md) implements decision Q13: site fonts come from the **WordPress Font Library** (Appearance → Fonts). WordPress stores the files in the uploads `fonts` directory and handles uploads; Blixis lists, checks, and offers them. Nothing is loaded from another host.

## Checks

`plugins/blixis-blocks/inc/fonts/library.php` checks every face of every published font family:

| Check | Refused when |
|---|---|
| Location | The face URL is outside the site's fonts directory, or its path resolves outside it (`not_local`) |
| Format | The extension is not `woff2`, `woff`, `ttf`, or `otf` (`extension`), the bytes are not a font (`not_a_font`), or the bytes are another format than the extension (`type_mismatch`) |
| Size | The file is larger than 2 MiB (`too_large`) |
| Name | The family name is not a valid token font name, so a token could not hold it |

A family is usable only when its name and every face pass. The wizard's font fields offer generic families and usable installed families, and the server refuses any other value (`font.not_installed`).

## Licences

Licence text (name ID 13), licence URL (14), and copyright (0) are read from TrueType, OpenType, and WOFF name tables and shown in the wizard's installed fonts table. WOFF2 tables are Brotli-compressed and are not read; the table then says to check the licence before use. A missing licence is shown, not enforced: the administrator decides.

## Loading

`font_faces_for()` returns `@font-face` data for the usable families a configuration uses, with local URLs and `font-display: swap`; `print_font_faces_for()` prints it through `wp_print_font_faces()`. Task 03-05 calls it when it applies a stored configuration; until then no public page loads Blixis fonts.

## Tests

`bash tests/03-04/run.sh --browsers chromium,firefox` runs on disposable WordPress 7.1.4/PHP 8.3 and 7.0.8/PHP 8.5. The fixture font is Liberation Sans (SIL Open Font License 1.1), copied at test time from the pinned Playwright image and never committed. CI runs it in the required `setup-wizard` job.

- **In process (22 checks):** TrueType and a generated WOFF recognised with licence, licence URL, and copyright; a PHP file named `.woff2`, a TrueType file named `.woff2`, a 2 MiB+ file, an SVG font, and a missing file refused; families with a non-font file, a remote URL, a path outside the fonts directory, an invalid name, or no files not usable; `@font-face` output only for chosen usable families, local, with swap.
- **Browser:** WordPress's own Font Library REST routes accept a TrueType upload and refuse a PHP file named `.woff2` and a `.php` file, and an editor gets 403. The wizard offers only usable families plus generics, shows the licence and the reasons a family cannot be used, refuses a font that is not installed, and keeps the chosen font. axe-core finds no violations at 1280 and 320 px.
- **Font loading:** on a public test page the chosen face loads from the site only, with `font-display: swap`; only the one face the page uses is downloaded (410,820 bytes for Liberation Sans Regular, TrueType).
