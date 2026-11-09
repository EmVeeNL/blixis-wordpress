# Setup wizard

Task [03-03](../roadmap/phases/03-child-theme-setup-wizard/03-wizard-ui.md) adds **Appearance → Blixis setup** to Blixis Blocks. It is a server-rendered form in five steps: child theme, colours, typography, spacing and layout, and review. It needs no JavaScript build; one inline line moves focus to the error summary.

Saving stores the configuration, and it applies at once while its child theme is the active theme. The review step shows a preview of the draft and offers a rollback to the previous saved configuration (task 03-05, see [applying tokens](TOKENS.md#applying-tokens)).

## Steps

1. **Child theme.** Choose an existing child theme of Blixis Base, or create one with the [child theme generator](CHILD_THEME.md). Creating needs `install_themes`; the theme is not activated. Later steps stay unavailable until a theme is chosen.
2. **Colours**, 3. **Typography** (font families and type scale), 4. **Spacing and layout** (spacing, radius, layout widths, shadows, motion). Every field comes from the [token map](../contracts/tokens/v2/token-map.json) and starts from the contract defaults, with system fonts. Font fields are a choice of generic families and the usable families installed under Appearance → Fonts, with a table of every installed family, its licence, and why it can or cannot be used ([local fonts](FONTS.md)). Breakpoints are fixed and not shown.
5. **Review and save.** Lists every value and the saved revision, previews the draft on the front page at 390, 820, and 1280 px, and offers save, discard draft, and roll back.

The progress indicator is an ordered list of step links. Reachable steps, including the current step, remain links; the current link has `aria-current="step"`. Number markers are visible, completed steps also show a check mark and the translated text `(completed)`, so completion is not conveyed by colour alone. Its flex layout wraps at narrow widths and uses logical CSS properties for right-to-left layouts. Each section is a `fieldset` with a `legend`; each field has a label, a hint, and, after a failed submit, an error linked with `aria-describedby` and `aria-invalid`. An error summary at the top receives focus and links to each field. Token values are entered left to right, also in right-to-left languages.

On step 1, the new-theme fieldset is hidden when an existing child theme is selected. CSS `:has()` ties visibility to the native radio selection without JavaScript. Browsers without `:has()` show the fields as a fallback, and a server-rendered validation error forces them visible so rejected values and errors remain available. When hidden, the fieldset uses `display: none`, so its controls do not enter keyboard order or the accessibility tree.

The primary action label follows owner decision 6 on every step: `Continue` for an existing theme or an unchanged step, `Create theme and continue` for a new theme, and `Save and continue` for a step whose draft differs from the saved configuration (or contract defaults before the first save). On review, an unsaved draft shows `Save and continue`; after the draft matches the saved configuration it shows `Continue`. The server chooses the initial label from the draft, and CSS switches it to the create label when the new-theme radio is checked. The server never relies on the displayed text to validate or process a submission. The button exposes this localization-aware contract for progressive enhancement:

- `data-label-continue`: translated `Continue`
- `data-label-save`: translated `Save and continue`
- `data-label-create`: translated `Create theme and continue`

An enhancement may change only the visible button text as fields change. The form action remains `next`; PHP validation and draft handling stay authoritative.

## Validation, drafts, and saving

- Every submit is checked on the server with the [contract validator](TOKENS.md). A step reports only the errors of its own sections. Rejected input is shown again unchanged.
- Valid steps are kept as a per-user draft (user meta `blixis_setup_draft`), so a reload, a new session, or a failed save resumes where the user stopped. Without a draft, the wizard starts from the saved configuration, or from the defaults.
- Saving writes the option `blixis_theme_config` (`revision`, `hash`, `config`, `previous`) with a compare-and-swap on the stored bytes. If another administrator saved in the meantime, the save is refused with a conflict message and the draft is kept. **Discard draft and load saved values** starts again from the saved configuration. A stored row whose hash or contents do not validate is not trusted.
- Every request needs `edit_theme_options` and a nonce for its step. Editors, subscribers, and anonymous visitors get 403 or nothing, and forged submissions without a nonce are refused.

## Tests

`bash tests/03-03/run.sh --browsers chromium,firefox` runs on disposable WordPress 7.1.4/PHP 8.3 and 7.0.8/PHP 8.5, with the nl_NL and ar language packs, in a throwaway Compose project that cannot reach the local site. CI runs it in the `setup-wizard` job.

- **In process (19 checks):** store creation, invalid configs refused, stale and concurrent writes conflict, previous config kept, colours normalized, autoload, tampered rows untrusted, per-step errors.
- **First browser, full flow:** keyboard-only theme creation with an invalid slug, error summary focus and field linking, values kept after errors, CSS injection refused, reload and new-session recovery, save as revision 1, a conflicting save by a second administrator, the kept draft, and discarding it.
- **Every browser:** keyboard order and visible focus, axe-core on every step at 1280 and 320 px, no horizontal overflow at 320 px, Dutch and Arabic (right to left), and 403 for editors and subscribers on the page and the handler.
- **After the browsers:** the stored configuration and its revision, the created child theme, no theme from refused requests, Blixis Base unchanged, and no PHP errors or notices.
