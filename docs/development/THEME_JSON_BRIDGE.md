# Base theme.json bridge

**Status:** Task [02-03](../roadmap/phases/02-blixis-base-theme/03-theme-json-bridge.md) establishes Base's contract mapping and a pure PHP projection in Blocks. Editable token validation, persistence, and a live theme-data filter are planned in Phase 03. No user configuration is accepted or stored by this task.

## Ownership and source of truth

Base ships neutral defaults in [`theme.json`](../../themes/blixis-base/theme.json). They match the accepted [`generic-fonts.theme.json`](../contracts/tokens/v1/golden/generic-fonts.theme.json) contract fixture, apart from the `$schema` annotation. The CI [parity check](../../scripts/check-base-theme-json.py) catches unreviewed drift. Base has no site branding and can render when Blocks is inactive.

Blocks owns the pure `Blixis\Blocks\Tokens\theme_json_from_validated_config()` projection. It accepts a *normalized, validated* v1 configuration and returns version 3 theme.json data. The module does not read an option, register a REST route, or install `wp_theme_json_data_theme` yet. Phase [03-02](../roadmap/phases/03-child-theme-setup-wizard/02-token-schema.md) owns the validator and CSS export; [03-05](../roadmap/phases/03-child-theme-setup-wizard/05-token-preview-persistence.md) owns persistence and the guarded live application. Do not call the projection on raw post, request, or option data.

The projection maps the closed color, font, type, spacing, radius, shadow, layout, and motion fields in the [v1 token contract](../contracts/tokens/README.md). It keeps font sizes non-fluid to preserve parity with `--blixis-*` variables. Breakpoints stay in the Tailwind build, since runtime CSS variables cannot set media query thresholds. Unknown fields or malformed values must fail before any WordPress filter receives them.

## WordPress precedence

WordPress combines Core, theme, and user Global Styles. Theme data can be modified with `wp_theme_json_data_theme` using `WP_Theme_JSON_Data::update_with()`; a version field is required. User style values can override theme style values, while presets from different origins are retained by origin. A child theme can customize its parent. [WordPress Global Styles architecture](https://developer.wordpress.org/block-editor/explanations/architecture/styles/), [filter reference](https://developer.wordpress.org/block-editor/reference-guides/filters/global-styles-filters/), and [child-theme handbook](https://developer.wordpress.org/themes/advanced-topics/child-themes/) describe these layers.

Blixis policy makes the validated configuration the future token source, not Site Editor user settings. **That policy is not enforced yet.** Task 03-05 must define and test how user-origin overrides are disabled or reconciled before applying dynamic tokens. Until then, Base's static defaults and normal WordPress precedence remain in effect. The 02-03 WordPress proof may apply a *test-only* filter to verify the projection; it must not turn the proof into an implicit production configuration path.

## Verification and rollback

The parity check compares Base defaults with the contract fixture. The disposable WordPress proof tests generated data against golden fixtures and observes editor and frontend global styles, child inheritance, and invalid-input refusal. The task record distinguishes any screenshot evidence from server-side parity checks. No database migration is part of 02-03. Reverting the bridge code leaves Base's shipped `theme.json` as the fallback; a later token-contract change needs versioned fixtures and a migration decision.
