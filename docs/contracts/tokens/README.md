# Token and renderer contract, version 1

**Status: proposed by the 01-05 tokens review; not owner-approved and not implemented in a product package.** The fixtures here passed against the throwaway proof in [`spikes/01-05-contracts/tokens`](../../../spikes/01-05-contracts/tokens/). Task 03-02 (tokens) and task 05-01 (elements) implement it. See the [review note](../../architecture/reviews/01-05-tokens.md) for evidence and gaps.

## Files

| Path | Purpose |
|---|---|
| [`v1/token-map.json`](v1/token-map.json) | Closed token names, grammars, error codes, limits, and the breakpoint preset. Both validators load it. |
| [`v1/blixis-theme-config.schema.json`](v1/blixis-theme-config.schema.json) | JSON Schema for `BlixisThemeConfig` v1. Patterns use ECMA-262 semantics. |
| [`v1/valid/`](v1/valid/) | Configs that must pass. |
| [`v1/invalid/`](v1/invalid/) with [`expected.json`](v1/invalid/expected.json) | Parseable configs that must fail with exactly the listed code and path. |
| [`v1/raw-cases.json`](v1/raw-cases.json) | Base64 bytes that cannot be a parseable `.json` file. |
| [`v1/golden/`](v1/golden/) | Generated CSS and `theme.json` data, the Tailwind mapping, and cache keys. |
| [`v1/renderer/registry.json`](v1/renderer/registry.json) | Element allowlist, class tables, URL pattern. |
| [`v1/renderer/cases.json`](v1/renderer/cases.json) | Node input, golden HTML from real WordPress escapers, expected diagnostics. |
| [`v1/renderer/responsive.json`](v1/renderer/responsive.json) | Mobile-first resolution fixtures. |

## Validation rules

Order: size (64 KiB), depth (8, measured on raw bytes), JSON parse, `config.not_object`, schema version, then fields. A missing, wrongly typed, or unsupported `schemaVersion` stops validation. Otherwise all errors are returned, sorted by UTF-8 bytes of `path`, then `code`. Paths are RFC 6901 pointers; the root is `""`.

Names are closed: an unknown key is `field.unknown`, so a config cannot name a token without a compiled utility. Every section and key is required, and defaults belong to the wizard, not the validator. Colours are lower-cased and short hex is expanded, so spelling does not change the hash.

A conforming implementation must also:

- decode to a form that distinguishes `{}` from `[]` (PHP: object mode, not `assoc`);
- make `$` strict (PCRE: the `D` modifier), or `"#fff\n"` passes;
- treat `1.0` as the integer 1;
- reject lone surrogates and keys starting with NUL (PHP refuses them, `JSON.parse` does not);
- measure depth before parsing (PHP reports a syntax error on very deep input);
- use ASCII classes for digits and letters. Non-ASCII font names are refused in v1.

## Breakpoints

`breakpoints` must equal `breakpointPreset` (`sm` 40rem, `md` 48rem, `lg` 64rem, `xl` 80rem). They are a build input, never emitted to runtime CSS or `theme.json`. A runtime value cannot work: `var()` is not allowed in a media query, the query never matches, and Tailwind 4.3.5 writes such a query without any warning. Any other value fails with `token.breakpoint.not_preset`; changing the preset means a rebuild and a new contract version.

## Generation

The PHP generator is the single production generator, because the only runtime on a WordPress host is PHP and saves are validated there. `tokens/src/generate.ts` is a test oracle that proves the bytes are reproducible; do not ship it. The admin preview sets `--blixis-*` values with `style.setProperty` from `token-map.json` after local validation, and the server result stays authoritative.

Delivery on a public page: `wp_theme_json_data_theme` merges the [`theme.json` data](v1/golden/default.theme.json), and an inline `blixis-tokens` style carries the [CSS](v1/golden/default.tokens.css). Values are literal in both, and a parity test compares them with WordPress's actual output. Font sizes need `fluid: false`; slug `2xl` becomes `--wp--preset--font-size--2-xl`.

Tailwind: use [`golden/tailwind.css`](v1/golden/tailwind.css). It imports utilities only (no preflight, no cascade layer) and uses `@theme inline`. Load it after global styles. Never add stored content as a `@source`: arbitrary values such as `bg-[url(javascript:alert(1))]` compile.

## Persistence

Store one autoloaded option, `blixis_theme_config`, holding JSON: `revision`, `hash`, `config`, `previous`. Write it with one compare-and-swap `UPDATE`, then call `wp_clean_theme_json_cache()`. `update_option` has no compare-and-swap, and writing an option alone leaves global styles stale. Revalidate on read and check the hash; a bad row falls back to `previous`, then to Base presets. Apply only when `theme.slug` is the active stylesheet. Export is the normalized config; import goes through the same validator.

## Cache keys

| Key | Form | Invalidated by |
|---|---|---|
| CSS | `blixis:css:c{contract}:g{generator}:{configHash}` | Config value, generator, contract |
| HTML fragment | `blixis:html:p{post}:r{documentRevision}:v{renderer}:{registryHash}` | Document revision, renderer, registry |
| Full page | fragment key plus `:{configHash}` | All of the above |

Element HTML holds class names only, so a token value change leaves it byte-identical; a test proves it. Pages embed the CSS and must be purged, through the `blixis_tokens_changed` action. Drafts, private, pending, future, and password-protected posts have no key: the functions return null.

## Renderer

Output comes from the registry only. Classes come from tables, never from input. Text is plain text: escape with `esc_html( str_replace( '&', '&amp;', $text ) )`, because `esc_html` and `esc_attr` otherwise keep existing entities and the page would differ from the React preview. URLs must match `urlPattern` first, then pass `esc_url( $url, $protocols )`; `esc_url` alone admits `//evil.test` and `ftp:`. The only rich field, `paragraph.html`, goes through `wp_kses` with an inline allowlist and is previewed from the server result.

An unknown type or version renders nothing and leaves stored data untouched. Diagnostics are returned out of band and require `edit_post`; they never enter HTML, because HTML is cacheable and public.

Hook `the_content` after every core filter and check `post_password_required()` first. An earlier hook executes shortcodes in user text and rewrites it. A later hook without the check publishes password-protected documents.

## Responsive resolution

Each breakpoint takes its own override, otherwise the nearest lower value, otherwise the base value in `props`. A class is emitted only where the resolved value changes. Absent means inherit, and order in the input does not matter. Parity between React and PHP is compared on parsed DOM, because their bytes legitimately differ (`&#039;` and `&#x27;`). Device preview must use an iframe: media queries follow the viewport, not a wrapper's width.

## Reproduce

From `spikes/01-05-contracts`, after editing a contract file:

```bash
node tokens/scripts/gen-fixtures.ts
node tokens/scripts/gen-golden.ts
node tokens/scripts/sync-bundle.ts
npx -y pnpm@12.18.0 run test
bash wordpress/run.sh tokens 7.1.4 8.4
```

A changed golden is a contract change. Review it; do not regenerate to make a test pass.
