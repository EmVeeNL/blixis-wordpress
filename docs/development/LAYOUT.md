# Layout configuration

**Implemented (task [03-07](../roadmap/phases/03-child-theme-setup-wizard/07-theme-layouts-and-style-presets.md) Part A):** the versioned `BlixisLayoutConfig` contract, its PHP and TypeScript validators, and its stored option. **Planned, not implemented:** Base rendering the settings through its header and footer parts, and the wizard step that edits them. This page says what exists and how the planned parts will use it.

## What the configuration is

The layout configuration holds the layout a child theme was created from and the header and footer settings a site owner can change at any time:

- sticky header, a USP bar of up to three short texts, logo position, an optional call-to-action button, search, and the mobile menu mode;
- footer at the bottom of short pages, one to four columns (site info, menu, contact, social links), a copyright line with `{year}` and `{site}`, and a back-to-top link.

It is separate from the [design tokens](TOKENS.md). Tokens describe how things look and drive the stylesheet; the layout configuration describes which parts exist and how they behave. The page content of a layout (the front page and patterns) is written once into the child theme by the [generator](CHILD_THEME.md) and edited in the Site Editor; it is not part of this configuration.

The full contract, with every rule, error code, and choice, is in [`docs/contracts/layout`](../contracts/layout/README.md).

## Code

| Part | Location | Role |
|---|---|---|
| Server validator | `plugins/blixis-blocks/inc/layout/validate.php` | `validate_bytes()` returns a normalized config or sorted `{code, path}` errors. Authoritative. `defaults($slug)` is the pure default configuration; `migrate_config()` is the pure version step |
| Store | `plugins/blixis-blocks/inc/layout/store.php` | `store_read()`, `store_write($bytes, $expected_revision)`, `store_rollback($expected_revision)`, `previous_config()`, `can_manage()`; the option `blixis_layout_config` |
| Contract data | `plugins/blixis-blocks/inc/layout/layout-map.json` | A copy of the contract's map, kept identical by a test |
| Browser validator | `packages/tokens/src/layout.ts`, exported from `@blixis/tokens` | `validateLayoutBytes()`, `validateLayoutText()`, `layoutDefaults()`, `migrateLayoutConfig()`. It returns the same result as PHP for every fixture; the server stays authoritative |

The validator lives in `@blixis/tokens` rather than a new package because it shares the byte-level helpers (depth check, error ordering) and the slug rule with the token validator, and the wizard already depends on that package.

## Where it is stored and who may change it

One autoloaded option, `blixis_layout_config`, holds `revision`, `hash`, `config`, and `previous`. A save is one compare-and-swap `UPDATE`; two writers cannot silently overwrite each other (`blixis_layout_conflict`, 409). A read revalidates and checks the hash, and a row that fails falls back to `previous_config()` and then to Base's plain parts. A rollback writes the previous config as a new revision, so it can be undone. The row is not a registered setting, not in the REST settings route, and not printed anywhere.

Changing the configuration needs the `edit_theme_options` capability. The store functions do not check it; every route or wizard handler that calls `store_write()` or `store_rollback()` must call `can_manage()` first, check its nonce, and refuse invalid input with the validator's errors. Drafts (the wizard's unsaved values) will live in user meta like the token draft and are read only by their owner on a preview request that carries a nonce; nothing public reads a draft and a draft is never cached.

## Plain text and URLs

Texts (USP items, button text, contact, copyright) are plain text. They are stored trimmed, not escaped, and every output site must escape them for its context (`esc_html()` for text nodes, `esc_attr()` for attributes). Links (the button, the social links) are validated by the contract and must still pass `esc_url()` on output. Copyright text has two placeholders: Base will replace `{year}` with the current year and `{site}` with the site title after escaping the rest.

## How the setup wizard writes the draft

The wizard keeps a full layout config in the user's draft (user meta `blixis_setup_draft`, keys `layout` and `layout_base_revision`), with `theme.slug` equal to the token theme of the draft. Without a saved layout it starts from `defaults( $slug )`. Choosing a layout for a new theme sets `layout.layout`; the Header and footer step edits `header` and `footer`; the preview endpoint `blixis_setup_layout_preview` stores a validated layout in the draft. Saving on the review step writes the tokens, then the layout with `store_write( bytes, layout_base_revision )`, and only when it differs from the saved layout, belongs to another theme, or is a first save after the owner has used the step. Details: [Header and footer step](SETUP_WIZARD.md#header-and-footer-step).

## How the next step will render it (planned)

Base renders the settings through its header and footer parts and a small amount of CSS, so changing a setting needs no file writes. The intended mapping, to be confirmed when it is built:

| Setting | Rendering |
|---|---|
| `header.sticky` | A class on the header that sets `position: sticky` below the admin bar, with `scroll-padding-top` on the root so focused elements and anchor targets are not hidden; no motion, so it needs no reduced-motion rule |
| `header.usp` | A `ul` above the `header` landmark with a check icon (inline SVG, decorative) per item; still one `banner` landmark |
| `header.logo` | A class that centres the logo row |
| `header.cta` | A core button block in the header with the validated URL |
| `header.search` | The core search block |
| `header.mobileMenu` | The core navigation block's `overlayMenu` attribute: `mobile` for small screens only, `always` for every width |
| `footer.stickToBottom` | The page wrapper is a column flexbox with `min-height: 100dvh` and the content area growing; no fixed positioning and no overflow at 320 px |
| `footer.columns`, `contact`, `social`, `copyright`, `backToTop` | Footer part with up to four columns in the fixed order, a list of labelled social links, the copyright paragraph, and an in-page link to the top |

The wizard's **Header and footer** step will edit a draft, preview it with the 03-06 live preview, save with the revision the page was loaded at, and offer rollback, in the same way the token steps do.

## Tests

- `npx -y pnpm@12.18.0 --filter @blixis/tokens run test` runs every fixture through the TypeScript validator and the PHP validator (`packages/tokens/test/layout.test.ts`, with `layout-php-cli.php` loading the plugin code without WordPress). It also compares the two on every code point in the interesting ranges, on a URL corpus with written-down verdicts, and on 4,000 random mutations, and checks the JSON Schema against the fixtures.
- `tests/03-05/check-layout.php` runs in the 03-05 harness (`bash tests/03-05/run.sh`, part of the `setup-wizard` CI job) on a real WordPress: compare-and-swap including a writer that loses a race, the hash check, fallback to the previous config, rollback and undo, the capability helper, and that nothing public exposes the row.
