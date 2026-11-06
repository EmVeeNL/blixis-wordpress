# 01-05 review: design tokens and rendering

**Integrated later:** this note records the review as it ran. Where the [integration note](01-05-integration.md) differs, the integration note wins.

**Date:** 2026-11-06. **Reviewer:** independent review agent for task 01-05. **Status:** recommendations only; no owner approval is claimed. Contract: [`docs/contracts/tokens`](../../contracts/tokens/README.md). Proof: [`spikes/01-05-contracts/tokens`](../../../spikes/01-05-contracts/tokens/), throwaway code.

## Scope

Token validation in TypeScript and PHP, deterministic generation, the Tailwind 4.3.5 boundary, the PHP allowlist renderer for heading, paragraph, button, and image, preview parity with real React 18.3.1, and behaviour in real WordPress. Document storage and the Content API belong to the other two reviews.

## Results

| Command (from `spikes/01-05-contracts`) | Result |
|---|---|
| `npx -y pnpm@12.18.0 run test` | 100 of 100 pass, 0 skipped. Only the tokens area had tests when run. |
| `npx -y pnpm@12.18.0 run typecheck` | Pass |
| `npx -y pnpm@12.18.0 run lint` | Pass, 0 warnings |
| `npx -y pnpm@12.18.0 run format:check` | Pass |
| `php -l` on all proof PHP (Herd PHP 8.4.27) | Pass |
| `bash wordpress/run.sh tokens` (WordPress 7.1.4, PHP 8.4.27) | `pass=626 fail=0` |
| `bash wordpress/run.sh tokens 7.0.8 8.5` (PHP 8.5.12) | `pass=626 fail=0` |
| `bash wordpress/run.sh tokens 7.1.4 8.3` (PHP 8.3.36) | `pass=626 fail=0` |
| `bash wordpress/run.sh tokens 7.0.8 8.3` (PHP 8.3.36) | `pass=626 fail=0` |
| `gitleaks dir` on both new directories | No leaks |

Fixtures: 11 valid, 93 invalid with sidecar errors, 22 raw byte cases, 59 renderer cases, 9 responsive cases. A seeded differential fuzz sent 6000 mutated configs through both validators: 0 differences. The fuzz accepted 99 inputs, so it mainly exercises rejection.

The tests were checked by breaking the code. Each deliberate fault below was undone afterwards.

| Fault | Failed |
|---|---|
| PHP grammar without the `D` modifier | 1 validator test |
| PHP depth pre-scan removed | 1 validator test |
| TypeScript surrogate and NUL check removed | 2 validator tests |
| PHP strict version compare (`1.0` refused) | 1 validator test |
| Whitespace added to generated CSS | 2 generator tests |
| `fluid: false` removed | 2 generator tests |
| Tailwind utilities imported into a layer | 2 Tailwind tests |
| Contract edited without resyncing the bundle | 1 test |
| Resolution falls back to base, not nearest lower | 4 render tests |
| `esc_html` without the ampersand step, and URL allowlist bypassed, in real WordPress | `pass=621 fail=8` |

## Findings

Reproduce a finding by running the commands above; the named check fails if the behaviour changes. Controls are named `finding:` in [`wp/test.php`](../../../spikes/01-05-contracts/tokens/wp/test.php).

### High

1. **A late `the_content` hook publishes password-protected documents.** Core puts the password form in the content; a late replacement discards it. Anonymous HTTP received the protected text. Core REST did not leak in this run. Fix: check `post_password_required()`. Check: `finding: a late the_content hook without a guard leaks protected content`.
2. **Tailwind's default import cannot win against WordPress.** It places utilities in `@layer`, and an unlayered rule beats a layered one at any specificity; WordPress global styles are unlayered. Chromium 156 gave `h2` 99px from `:root :where(h2)` over `.text-lg` in a layer. Preflight would also reset element styles. Fix: import `tailwindcss/utilities.css` with no layer, and load it after global styles. Check: `layered utilities lose to unlayered WordPress styles` in [`tailwind.test.ts`](../../../spikes/01-05-contracts/tokens/test/tailwind.test.ts).
3. **An early `the_content` hook runs shortcodes in user text and rewrites it.** With priority 8, `[blixis_proof_probe]` executed and `--` was texturized. Any editor could then run any registered shortcode. A dynamic block is rendered at priority 9 and is probably affected the same way; that was not tested.

### Medium

4. **`esc_html` and `esc_attr` do not double-encode.** Stored `AT&amp;T` displays as `AT&T` on the public page and `AT&amp;T` in React, which is a parity failure, though not an injection. Fix: encode `&` first, as `blixis_esc_text()` does.
5. **Base cannot show a rendered page.** Its only template is a query loop of titles and excerpts, so element HTML never appears on a page. The proof child theme adds `singular.html` with `post-content`. Task 02-01 or 03-01 must supply it.
6. **Base presets conflict with tokens.** `styles.color.background` refers to preset `background`, and replacing the palette orphans it, because tokens use `surface`. The generator now sets `background` and `text` itself. Rename or align Base's slugs as well.
7. **Fluid typography breaks token parity.** Base sets `typography.fluid`, so 2rem became `clamp(1.25rem, 1.25rem + ((1vw - 0.2rem) * 1.442), 2rem)` while `--blixis-text-3xl` stayed 2rem. Fix: `fluid: false` per size.
8. **The Site Editor can diverge from tokens.** A user-origin palette entry changed `--wp--preset--color--primary` to `#000000` while `--blixis-color-primary` stayed `#155dfc`. This used the `wp_theme_json_data_user` filter, not a saved `wp_global_styles` post. It needs a policy; see owner decisions.
9. **A runtime breakpoint fails silently.** Tailwind 4.3.5 accepts `--breakpoint-x: var(--y)` and writes `@media (width >= var(--y))`. Chromium never matches it, at 200px or 1600px. `docs/examples/theme-config.json` suggests breakpoints are editable, and this resolves that contradiction: they are fixed, and any other value is `token.breakpoint.not_preset`.
10. **`docs/examples/tokens.css` uses plain `@theme`.** Utilities then resolve at `:root`, so an override on a section has no effect. `@theme inline` honours it. It also keeps Tailwind's default theme; `--*: initial` closes the names.
11. **`docs/examples/theme-config.json` fails v1:** no `motion`, `shadows`, `typeScale`, or `layout.wideWidth`, although CONFIGURATION.md lists them. A test pins the four errors.
12. **`update_option` alone is not enough.** It has no compare-and-swap, so a second writer loses updates silently, and global styles stay stale until `wp_clean_theme_json_cache()`. Both are proven; the row now uses a guarded `UPDATE`.
13. **Five PHP and JavaScript differences break naive parity:** `{}` and `[]` under `assoc`, `$` before a newline, `1.0` as a float, lone surrogates and NUL-leading keys, and syntax errors on deep input. Each has a fixture. Matching validators without these rules disagree on hostile input.

### Low and informational

14. `wp_kses` rewrites `javascript:alert(3)` to `href="alert(3)"`, which is safe but a dead link. Validate rich-text links on save.
15. The manifest's blanket `"html": "sanitize"` is ambiguous. The proof treats fields as `text`, `url`, or `inlineHtml`, and only `paragraph.html` is rich. Phase 05 should use per-field kinds.
16. `esc_url` alone admits `ftp:` and `//evil.test`, and turns `/\evil.test/x` into `/evil.test/x`. The URL allowlist runs first.
17. `--spacing-md` also defines `max-w-md` and `w-md`. This is harmless while classes come only from the registry.
18. The security document's "cache by revision and token version" is imprecise. Element HTML does not depend on token values, so fragments and pages need separate keys.
19. Core `wp/v2/pages/<id>` returns element HTML in `content.rendered` for published pages. The API review should treat that as an existing public path.
20. `themeRef.tokensVersion` in `docs/examples/content-document.json` is undefined. Rendering does not need it. Remove it, or define it as the contract version.
21. The harness prints harmless `LIBARCHIVE.xattr` tar warnings on macOS and one `wget` connection refusal during server start.

## Module ownership (feedback on ADR-001)

| Concern | Owner | Must not |
|---|---|---|
| Neutral templates, semantic structure, default presets | Base | Hold site values or the generator; receive any writes |
| Branding files and approved overrides; `theme.slug` identifies it | Child theme | Be the canonical token store or receive a generated `theme.json` |
| `BlixisThemeConfig` option, validator, generator, theme.json filter, wizard REST | Tokens module, shipped in Blocks (recommended) | Depend on React |
| Registry, renderer, compiled utilities | Blocks, released as one artifact | Accept classes from input |
| Editor, preview | Blocks admin only | Load on public pages |

Proven: with the plugin inactive the child theme serves the page with the plain post body, no token CSS, and no document exposure. With no valid config, or under another theme, Base presets remain. Parent files were byte- and mtime-identical across every save. "Independently deployable" is too strong: registry, renderer, and compiled utilities must ship together, or a class has no rule. A test now requires a rule for every class at every breakpoint.

## Gaps

- Compiled utilities were not enqueued in real WordPress. The cascade proof used a `:root :where(h2)` rule in the shape WordPress writes, in a browser, not a full page.
- Only Chrome 156 ran the browser proofs, through Playwright's `chrome` channel, because Playwright's own Chromium build is not installed. Firefox and Safari were not run.
- The preview proof uses `renderToStaticMarkup`, not the editor. `@wordpress/element` was not used.
- Parity is checked on a small purpose-built HTML parser and WordPress's `WP_HTML_Tag_Processor`. Visual regression was not run.
- The JSON Schema was evaluated by a small purpose-built evaluator, since the task adds no dependencies. No general JSON Schema library has run it.
- No persistent object cache, multisite, Apache, or nginx. The race was simulated by injecting a write between read and `UPDATE`, not by parallel requests.
- `fontWeight`, `lineHeight`, `aspectRatio`, and `visibility` from the manifests are not implemented. Only 4 of 20 elements are covered.
- Fonts are name strings. Registration, files, and licences belong to task 03-04.
- Contrast between chosen colours is not validated, though WCAG 2.2 AA is the target. Add it as a warning in the wizard.
- The audit event is an action with no store. REST nonce handling was bypassed by `rest_do_request`; only capability checks ran.
