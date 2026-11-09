# Setup wizard

Task [03-03](../roadmap/phases/03-child-theme-setup-wizard/03-wizard-ui.md) adds **Appearance → Blixis setup** to Blixis Blocks. It is a server-rendered form in five steps: child theme, colours, typography, spacing and layout, and review. It needs no JavaScript build; one inline line moves focus to the error summary.

Saving stores the configuration, and it applies at once while its child theme is the active theme. The review step shows a preview of the draft and offers a rollback to the previous saved configuration (task 03-05, see [applying tokens](TOKENS.md#applying-tokens)).

## Steps

1. **Child theme.** Choose an existing child theme of Blixis Base, or create one with the [child theme generator](CHILD_THEME.md). Creating needs `install_themes`; the theme is not activated. Later steps stay unavailable until a theme is chosen.
2. **Colours**, 3. **Typography** (font families and type scale), 4. **Spacing and layout** (spacing, radius, layout widths, shadows, motion). Every field comes from the [token map](../contracts/tokens/v1/token-map.json) and starts from the contract defaults, with system fonts. Font fields are a choice of generic families and the usable families installed under Appearance → Fonts, with a table of every installed family, its licence, and why it can or cannot be used ([local fonts](FONTS.md)). Breakpoints are fixed and not shown.
5. **Review and save.** Lists every value and the saved revision, previews the draft on the front page at 390, 820, and 1280 px, and offers save, discard draft, and roll back.

The progress list marks the current step with `aria-current="step"` and completed steps in text. Each section is a `fieldset` with a `legend`; each field has a label, a hint, and, after a failed submit, an error linked with `aria-describedby` and `aria-invalid`. An error summary at the top receives focus and links to each field. Token values are entered left to right, also in right-to-left languages.

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
