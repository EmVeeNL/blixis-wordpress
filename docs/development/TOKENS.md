# Token validation and CSS export

Task [03-02](../roadmap/phases/03-child-theme-setup-wizard/02-token-schema.md) implements [token contract v1](../contracts/tokens/README.md) in shipped code. The [setup wizard](SETUP_WIZARD.md) (task 03-03) stores configurations; task 03-05 applies them, previews drafts, and rolls back, as described below.

## Code

| Part | Location | Role |
|---|---|---|
| Server validator | `plugins/blixis-blocks/inc/tokens/validate.php` | `validate_bytes()` returns a normalized config or sorted `{code, path}` errors. Authoritative |
| Stylesheet generator | `plugins/blixis-blocks/inc/tokens/css.php` | `generate_css()`, `css_variables()`, `config_hash()`, `css_cache_key()`. The only production generator |
| theme.json projection | `plugins/blixis-blocks/inc/tokens/theme-json.php` | From task 02-03 |
| Client validator | `packages/tokens` (`@blixis/tokens`) | `validateBytes()` and `validateText()` with the same results as PHP, and `previewProperties()` for `style.setProperty` in the admin preview. It does not generate stylesheets |

Both validators read a copy of [`token-map.json`](../contracts/tokens/v1/token-map.json) that ships with them; a test keeps the copies byte-identical to the contract. The PHP code uses no WordPress functions, so the same files run in WordPress and in plain PHP.

## Guarantees

- Unknown names, missing sections, wrong types, values outside each grammar, a different breakpoint set, configs over 64 KiB or nested deeper than 8, and invalid JSON are refused, with the error codes in the contract.
- CSS injection attempts (`;`, `}`, `</style>`, comments, `url()`, `expression()`, `@import`, `var()` smuggling, control characters, and Unicode tricks) fail validation, so they never reach the generator.
- Colours are normalized (lower case, short hex expanded), so the config hash does not depend on spelling.
- Generated output is byte-stable: the same config gives the same stylesheet and cache key on PHP 8.3, 8.4, and 8.5.

## Tests

From `packages/tokens`, run `pnpm run test` (or `npx -y pnpm@12.18.0 run test`). It needs `php` on the path. CI runs it in the required `contracts` job.

- Every valid, invalid (93, each with its exact errors), and raw-byte fixture through both validators.
- The golden stylesheets, config hash, canonical form, and CSS cache key from PHP.
- Preview properties equal the server's custom properties for every valid fixture.
- No generated declaration can contain characters that leave its rule.
- A seeded property-based test: 6,000 mutated configs and raw edits through both validators with identical results.

## Applying tokens

Task [03-05](../roadmap/phases/03-child-theme-setup-wizard/05-token-preview-persistence.md) adds `plugins/blixis-blocks/inc/tokens/apply.php`.

- **Effective config.** The stored config, revalidated and hash-checked on every read. If it does not validate, its previous config; if that does not validate either, nothing, and Base presets apply. A config applies only while its `theme.slug` is the active stylesheet.
- **Delivery.** The `wp_theme_json_data_theme` filter merges the [theme.json projection](THEME_JSON_BRIDGE.md), so WordPress generates the `--wp--preset--*` variables for the site and the editor. An inline `blixis-tokens` stylesheet carries the `--blixis-*` properties, and the chosen Font Library families are printed as local `@font-face` rules ([local fonts](FONTS.md)).
- **Cache invalidation.** Every save and rollback fires `blixis_tokens_saved`, which clears WordPress's theme.json caches so the next request sees the new values, and then `blixis_tokens_changed`, where page caches should purge.
- **Rollback.** `store_rollback()` writes the previous config as a new revision with compare-and-swap; the replaced config becomes the new previous one, so a rollback can be undone.
- **Site Editor policy.** User-origin (Site Editor) theme presets for colours, font families, font sizes, spacing, radius, and shadows, and the content and wide widths, are removed while a Blixis config applies. Other user settings, such as custom colours, are kept.
- **Preview.** `?blixis_preview=<nonce>` applies the requesting user's wizard draft, only for a logged-in user with `edit_theme_options` and a valid nonce bound to that user. Preview responses send `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, and a robots `noindex` meta tag. Anyone else gets the normal page. The wizard shows it in an iframe with 390, 820, and 1280 px widths that never change stored values.

**Limit:** Base uses token presets for the page background and text colour; its templates do not yet use the font, link, or spacing presets, so the preview of a neutral Base page shows few changes and a body font needs a style reference in the child theme's `theme.json`. Task [03-06](../roadmap/phases/03-child-theme-setup-wizard/06-token-driven-themes.md) plans to close this.

`bash tests/03-05/run.sh --browsers chromium,firefox` covers this on disposable WordPress 7.1.4/PHP 8.3 and 7.0.8/PHP 8.5; CI runs it in the required `setup-wizard` job.
