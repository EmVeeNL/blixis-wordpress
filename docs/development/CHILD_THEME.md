# Child theme generator

The Blixis Blocks generator creates an installable child theme of Blixis Base. The setup wizard can create one during its theme step. It never activates the theme it creates.

## Route

`POST /wp-json/blixis-editor/v1/child-themes` with a JSON body. The route is hidden from the REST index.

| Field | Rule |
|---|---|
| `name` | Required. Up to 64 characters |
| `slug` | Required. 3 to 48 characters: lowercase letters, digits, single hyphens, starting with a letter. Not `blixis-base`, `blixis-blocks`, `blixis-showcase`, or a WordPress directory name |
| `description` | Optional. Up to 200 characters |
| `author` | Optional. Up to 64 characters |
| `version` | Optional. `major.minor.patch`; defaults to `0.1.0` |
| `layout` | Optional. `blank` (default), `business`, `portfolio`, `blog`, or `landing`; selects the front-page template and editable pattern |
| `starter` | Legacy optional field accepted for compatibility: `none` maps to `blank`; `neutral` maps to `business`. If both fields are sent and disagree, the request is refused with `{field: layout, code: conflicts_with_starter}` |

Text fields may not contain control characters, `<`, `>`, or `*/`, because they become one-line theme header values. Unknown fields are refused.

| Response | Meaning |
|---|---|
| `201` | Created. Body: `slug`, `name`, `version`. No server paths |
| `400 blixis_child_invalid` | `data.errors` lists `{field, code}`: `unknown_field`, `invalid_type`, `required`, `too_long`, `invalid_characters`, `invalid_slug`, `reserved_slug`, or `invalid_version`, `invalid_layout`, or `conflicts_with_starter`. Unknown `starter` values are rejected by REST argument validation as `rest_invalid_param` |
| `401` | Not logged in |
| `403` | Missing `edit_theme_options` or `install_themes`, or no valid `wp_rest` nonce in `X-WP-Nonce`. Application passwords are refused because they carry no nonce |
| `409 blixis_child_exists` | A theme, directory, or file with that slug already exists |
| `409 blixis_child_parent_missing` | Blixis Base is not installed |
| `503 blixis_child_unavailable` | File modifications are disallowed, the site is Multisite (planned for v1.1), or WordPress cannot write the theme directory directly |

`DISALLOW_FILE_MODS` removes `install_themes`, so such sites get `403`.

## What it writes

A new directory `<theme root>/<slug>/` containing:

- `style.css`: the theme header with `Template: blixis-base`, `Requires at least: 7.0`, `Requires PHP: 8.3`, GPLv2 or later, and the slug as text domain.
- `theme.json`: version 3 with no settings or styles. The child inherits Base's token-driven styles and adds no fixed token values.
- `functions.php`: enqueues the child stylesheet after Base's `blixis-base` handle.
- With `layout: blank`, the generated child inherits Base's front page. Every other layout writes `templates/front-page.html` and a PHP pattern in `patterns/`: Business has an introduction, three feature columns, and a call to action; Portfolio has an introduction and editable project cards; Blog uses a latest-posts Query Loop; Landing has anchored sections and in-page navigation. All use core blocks, system fonts, Base token presets, and the generated theme's text domain. No images or remote assets are included. Inline-safe neutral SVG wireframes live in `plugins/blixis-blocks/assets/layouts/` for the wizard.

Files are written to a hidden staging directory in the theme root and moved into place in one step, so a failure leaves no partial theme. WordPress ignores hidden directories when it lists themes. Templates, parts, and the compiled Tailwind stylesheet are inherited from Base, so a Base upgrade reaches the child without regenerating it.

## Tests

`bash tests/03-01/run.sh` runs on disposable WordPress 7.1.4 with PHP 8.3 and 7.0.8 with PHP 8.5, in throwaway Compose projects that cannot reach the local site. CI runs it in the required `wordpress-integration` job. It covers:

- 18 invalid inputs, including path traversal, the parent's slug, header injection, and invalid UTF-8.
- Over real HTTP: anonymous, subscriber, editor, administrator without a nonce, with a wrong nonce, and with an application password are refused and create nothing; a valid administrator request creates the theme; a repeat gets `409`; `DISALLOW_FILE_MODS` refuses.
- WordPress recognises the generated theme with Base as parent and the expected headers. Base's files are byte-identical afterwards, and no staging directory remains.
- The activated child renders a page with one `main` and one `h1` and loads its stylesheet after Base's. After a simulated Base upgrade (new version and a changed footer part), the child still renders and shows the new part.
- No PHP errors, warnings, notices, or deprecations are logged.
