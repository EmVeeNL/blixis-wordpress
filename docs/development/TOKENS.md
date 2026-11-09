# Token validation and CSS export

Task [03-02](../roadmap/phases/03-child-theme-setup-wizard/02-token-schema.md) implements [token contract v1](../contracts/tokens/README.md) in shipped code. Nothing stores or applies a configuration yet; persistence and preview are task 03-05, and the setup screens are task 03-03.

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
