# Base theme.json bridge

**Status:** Task [02-03](../roadmap/phases/02-blixis-base-theme/03-theme-json-bridge.md) establishes Base's contract mapping and a pure PHP projection in Blocks. Phase 03 added validation (03-02), storage through the setup wizard (03-03), and the live theme-data filter that applies a stored configuration (03-05); see [token validation](TOKENS.md). This task itself accepts and stores no configuration.

## Ownership and source of truth

Base ships neutral defaults in [`theme.json`](../../themes/blixis-base/theme.json). They match the accepted [`generic-fonts.theme.json`](../contracts/tokens/v2/golden/generic-fonts.theme.json) contract fixture, apart from the `$schema` annotation. The CI [parity check](../../scripts/check-base-theme-json.py) catches unreviewed drift. Base has no site branding and can render when Blocks is inactive.

Blocks owns the pure `Blixis\Blocks\Tokens\theme_json_from_validated_config()` projection. It accepts a *normalized, validated* version 2 configuration and returns version 3 theme.json data. The module does not read an option, register a REST route, or install `wp_theme_json_data_theme` yet. Phase [03-02](../roadmap/phases/03-child-theme-setup-wizard/02-token-schema.md) owns the validator and CSS export; [03-05](../roadmap/phases/03-child-theme-setup-wizard/05-token-preview-persistence.md) owns persistence and the guarded live application. Do not call the projection on raw post, request, or option data.

The projection maps the closed color, font, type, spacing, radius, shadow, layout, and motion fields in the [token contract v2](../contracts/tokens/README.md). It keeps font sizes non-fluid to preserve parity with `--blixis-*` variables. Breakpoints stay in the Tailwind build, since runtime CSS variables cannot set media query thresholds. Unknown fields or malformed values must fail before any WordPress filter receives them.

## WordPress precedence

WordPress combines Core, theme, and user Global Styles. Theme data can be modified with `wp_theme_json_data_theme` using `WP_Theme_JSON_Data::update_with()`; a version field is required. User style values can override theme style values, while presets from different origins are retained by origin. A child theme can customize its parent. [WordPress Global Styles architecture](https://developer.wordpress.org/block-editor/explanations/architecture/styles/), [filter reference](https://developer.wordpress.org/block-editor/reference-guides/filters/global-styles-filters/), and [child-theme handbook](https://developer.wordpress.org/themes/advanced-topics/child-themes/) describe these layers.

Blixis policy makes the validated configuration the future token source, not Site Editor user settings. **That policy is not enforced yet.** Task 03-05 must define and test how user-origin overrides are disabled or reconciled before applying dynamic tokens. Until then, Base's static defaults and normal WordPress precedence remain in effect. The 02-03 WordPress proof may apply a *test-only* filter to verify the projection; it must not turn the proof into an implicit production configuration path.

## Verification and rollback

The parity check compares Base defaults with the contract fixture. The disposable WordPress proof tests generated data against golden fixtures and observes editor and frontend global styles, child inheritance, and invalid-input refusal. The task record distinguishes any screenshot evidence from server-side parity checks. No database migration is part of 02-03. Reverting the bridge code leaves Base's shipped `theme.json` as the fallback; a later token-contract change needs versioned fixtures and a migration decision.

## Reproduce the proof

Run `bash tests/02-03/run.sh` for disposable WordPress 7.1.4/PHP 8.3 and WordPress 7.0.8/PHP 8.5 stacks. This runs in the existing required `wordpress-integration` CI check. The 424 assertions per stack include every normalized valid fixture, strict refusal of every invalid array fixture, both golden projections, inline grammar/name drift checks, WordPress schema retention, actual HTTP global styles, child inheritance, and hostile CSS inputs. Non-array inputs are refused by PHP's array parameter type. The projection assumes the validator's canonical `theme` and breakpoint key order; it is not the raw JSON validator.

For the separate Chromium proof, install the workspace with the pinned Node/pnpm versions and `pnpm install --frozen-lockfile`, then run:

```bash
bash tests/02-03/run.sh --browser --out /tmp/blixis-0203-shots
```

The browser container uses the same digest-pinned Playwright 1.65.0 image as CI and copies the two Playwright packages from the frozen workspace install; it does not install packages over the network. WordPress installation still requires wordpress.org. The harness uses a random Compose project, a tmpfs database, no host ports, and no runtime bind mounts. It never accesses the shared local site.

The screenshot comparison covers five opaque token-color swatches in the editor and frontend. It hides editor-only empty-group chrome and excludes the outermost pixel rows where fractional positioning blends neighboring blocks. Full frontend, editor, and canvas screenshots are captured for inspection; they are not asserted equal. Computed-style checks additionally compare typography, button colors, selected token variables, and content width. This does not establish full-page visual parity, accessibility of a future token editor, or cross-browser visual parity. No new product UI, persistence permission surface, or public script is introduced here.

A deliberately changed `defaultPalette: true` in a temporary copy of the production plugin fails both golden assertions and exits 1. This verifies that the WordPress proof detects a projection regression rather than merely reporting successful setup. Site Editor user-origin precedence is observed, not fixed: it can still override the primary token. Phase 03-05 must enforce the accepted token ownership policy.

When the configuration has a dark palette (`colorsDark`, [token contract v2](../contracts/tokens/README.md#dark-palette)), the colour palette presets are `var(--blixis-color-<slug>)` instead of literal values; the token stylesheet switches those properties under `prefers-color-scheme: dark` or by the site setting. Without a dark palette the presets stay literal, as before. The projection uses the shipped token map for names and value rules, not an inline copy.
