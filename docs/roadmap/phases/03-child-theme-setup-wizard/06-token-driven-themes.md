---
id: "03-06"
title: "Make Base and child themes use the tokens, and make the wizard friendly"
phase: "03"
status: Done
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-09"
updated_at: "2026-11-10"
depends_on: ["03-05"]
branch: "feat/03-06-wizard-design-controls"
pr_number: 44
pr_url: "https://github.com/EmVeeNL/blixis-wordpress/pull/44"
commit_sha: "fdb8b06"
merged_at: "2026-11-10T09:03:31Z"
merge_commit_sha: "ea7d13e36e767379504c1922025570f3165ab8c2"
started_at: "2026-11-09"
completed_at: "2026-11-10"
closed_at: null
blocked_reason: null
blocked_by: []
---

# 03-06 — Make Base and child themes use the tokens, and make the wizard friendly

## Description

Phase 03 stores, validates, previews, and applies design tokens, but the result is hard to see and the wizard is technical:

- Base's templates use only the background and text colour presets. A body font chosen in the wizard has no visible effect until someone edits the child theme's `theme.json` by hand, and the Showcase uses fixed colours.
- Colours are hex only and there is no dark mode.
- The wizard asks for raw CSS values (`0.875rem`, `0 4px 6px -1px #0000001a`, `cubic-bezier(0.4, 0, 0.2, 1)`) and shows a preview only on the last step.

This task makes wizard choices visibly change Base, generated child themes, and the Showcase, and turns the wizard into something a site owner can use without CSS knowledge. Michael asked for all of this in one task on 2026-11-09. Delivered in PRs #41 to #44 (see [tracking](#tracking-and-completion)).

Because the scope is large, deliver it in the parts below, each as its own reviewed pull request against this task. The task is Done only when all parts are merged and Michael has checked the result on blixis.test.

## Part A — Themes use the tokens

- **Base styles use the presets.** Base `theme.json` styles point body text, headings, links (including hover and focus), buttons, block gap and content spacing, and layout widths at the token presets (`var:preset|…`), keeping neutral defaults when no configuration applies. Base stays brand-neutral.
- **Generated child themes inherit them.** The [child theme generator](../../../development/CHILD_THEME.md) writes a `theme.json` that inherits those styles and adds no fixed values. An optional neutral starter (front-page template and patterns, structured like the Showcase without its branding) can be chosen when creating a theme.
- **Showcase reads tokens.** Showcase CSS uses `--blixis-*` custom properties with its current values as fallbacks, so it looks the same with no configuration and follows the wizard when it is the configured theme.

## Part B — Colour formats and dark mode (contract change)

- **Colour formats.** Each colour can be entered and stored as hex, `rgb()`, `hsl()`, or `oklch()`. The stored value keeps the chosen format, because converting `oklch()` to hex can lose colours outside sRGB. Both validators accept a strict grammar per format; the stylesheet and theme.json carry the value unchanged. Contrast checks convert to sRGB internally. This reopens decision 7 of the [01-05 integration note](../../../architecture/reviews/01-05-integration.md) (hex only in v1).
- **Dark mode.** A second set of colours (`colorsDark`, same names as `colors`) is optional. When it is set:
  - `--blixis-color-*` values switch under `@media (prefers-color-scheme: dark)`, and theme.json presets point at those custom properties so blocks follow them;
  - an optional site setting chooses *follow the visitor's system setting* (default), *always light*, or *always dark*;
  - the wizard's Colours step shows light and dark side by side, each with contrast warnings, and the preview can switch between them.
- **Contract.** Both changes alter the [token contract](../../../contracts/tokens/README.md). Recommended: `schemaVersion` 2 with a pure, tested migration that converts stored v1 configs on read and on save, so existing sites keep working. Validators (PHP and `@blixis/tokens`), fixtures, golden files, the 02-03 bridge tests, and the [token docs](../../../development/TOKENS.md) change together.

## Part C — Friendlier wizard

**Progress and step 1**

- Restyle the progress list as clear, numbered steps with a visible current step, completed marks, and a layout that wraps well at 320 px and in right-to-left languages. It stays a list of links with `aria-current="step"`, not ARIA tabs, because each step is its own page.
- The **New child theme** fields appear only when **Create a new child theme** is selected.
- The main button names what happens: **Continue** when an existing child theme is selected or nothing on a step changed, **Create theme and continue** for a new theme, **Save and continue** when a step has changes. (Owner decision 6: every step uses the same rule.)

**Controls instead of raw CSS**

- **Colours:** a colour picker plus a format switch (hex, RGB, HSL, OKLCH), the text value editable for precision, and contrast against surface shown next to each foreground colour.
- **Type scale, spacing, corner radius, layout widths:** a slider with a number field and a unit menu. Units offered: `px` and `rem` everywhere (the current contract); `em` for type scale and spacing; `%`, `ch`, and `vw` for layout widths only. Every unit beyond `px` and `rem` is a contract change in Part B's version 2. Slider ranges and steps per field are defined in the contract, not only in the interface. Type scale offers *keep proportions* to scale all sizes from the base size.
- **Shadows:** named presets (None, Subtle, Soft, Medium, Strong) shown as cards, plus an **Adjust** panel with sliders for offset, blur, spread, and opacity and a colour choice. The CSS text stays available behind **Edit as CSS** for experts.
- **Motion:** named speeds (Fast, Normal, Slow) with sliders in milliseconds, and easing presets with plain names (Smooth, Gentle start, Gentle stop, Linear, Springy). A **Play** button animates a sample; it never plays automatically and shows a static explanation under `prefers-reduced-motion`.

**Live previews on every step**

- Each step shows a small specimen: colour swatches with contrast results, a type specimen with headings and body text, a spacing ruler, radius samples, shadow cards, and the motion sample.
- The front-page preview (now on the review step) is available on every step and updates as values change, using the client validator and `previewProperties()` from [`@blixis/tokens`](../../../development/TOKENS.md). The server stays authoritative: every submit is still validated in PHP.

**Technology**

- These controls need JavaScript. The wizard stays usable without it (plain fields, server validation), and JavaScript enhances it. Build it with TypeScript 7 and the workspace tools; plain TypeScript with progressive enhancement, per owner decision 5.

## Part D — Accessibility for the new controls

- Every slider has a visible label and value, a linked number field, and works with arrow, Page Up/Down, Home, and End keys. Unit menus and format switches are native `select` elements or follow the WAI-ARIA listbox pattern.
- Contrast warnings for text, links, and buttons below 4.5:1 (3:1 for large text and interface parts), in light and dark mode.
- Previews are announced politely to screen readers only on request, not on every keystroke.
- axe-core finds no violations at 1280 and 320 px in Chromium and Firefox, with JavaScript on and off.

## Questions answered in this task

**Does Appearance → Editor use Tailwind CSS v4 styling?** Partly, and indirectly:

- The Site Editor's own controls (colours, typography, spacing, Styles panel) work with WordPress **global styles**: `theme.json` presets turned into CSS custom properties such as `--wp--preset--color--primary`. They never write Tailwind classes. Blixis fills those presets from the tokens (03-05), so the editor offers the wizard's colours, fonts, and sizes as presets.
- Blixis Base also loads its compiled Tailwind v4 utilities into the editor (`add_editor_style`, task 02-02), so Base template parts that use those utility classes look the same in the editor as on the site. The build is small (about 1 KB) because Base uses few utilities; it holds no token values, only `var(--blixis-*)` references.
- So the editor shows Tailwind-built utilities where Base's templates use them, but editing in the Site Editor is WordPress styling, not Tailwind. The future Blixis Blocks editor (phase 04) will apply Tailwind utilities from its element registry; arbitrary Tailwind classes typed by users are not supported, by design (ADR-002).

## Owner decisions

Michael accepted the recommendations on 2026-11-09 ("for now, use the recommendations"):

1. **Contract version:** `schemaVersion` 2, with a pure, tested migration that converts stored v1 configs on read and on save.
2. **Colour storage:** each colour keeps the format it was entered in (hex, RGB, HSL, or OKLCH).
3. **Dark mode:** follows the visitor's system setting by default, with an optional site override for *always light* or *always dark*. No visitor-facing toggle.
4. **Units:** `px` and `rem` everywhere, `em` for type scale and spacing, `%`, `ch`, and `vw` for layout widths only.
5. **Wizard technology:** plain TypeScript 7 with progressive enhancement; the wizard keeps working without JavaScript. React stays for the phase 04 editor.
6. **Button labels:** every step uses the same rule: **Continue** when nothing changed or an existing theme is selected, **Create theme and continue** for a new theme, **Save and continue** when a step has changes.

These are working decisions "for now"; revisit them before Part B if anything changes.

## Acceptance criteria

- [x] **A:** with a fresh generated child theme active, changing body font, heading font, primary (link) colour, and spacing in the wizard visibly changes the public page and the preview; no hand edit of `theme.json` is needed; Base and the Showcase without a configuration look as before (screenshot comparison), and Base holds no branding. *Evidence:* the 03-05 harness checks the configured body font, heading font, and spacing on a fresh generated child theme's public page, and the primary colour in the preview; 02-05 and 03-05 capture Base, the Showcase, and the neutral starter with and without a configuration. *Deviation:* unconfigured Base now uses system-ui headings and preset link and button styles, so it does not look exactly as before; Michael accepted this look on 2026-11-09. The Showcase keeps its look through its fallbacks.
- [x] **B:** colours can be entered and stored in hex, RGB, HSL, and OKLCH; an optional dark palette applies under `prefers-color-scheme: dark` and with the site override; stored v1 configs migrate without loss; validators, fixtures, goldens, and docs agree.
- [x] **C:** the progress list, conditional new-theme fields, button labels, sliders with unit menus, shadow presets and editor, motion presets with a play button, and per-step live previews work as described, with JavaScript on; the wizard still works with JavaScript off.
- [x] **D:** keyboard use, labels, contrast warnings, reduced motion, and axe-core checks pass at 1280 and 320 px in Chromium and Firefox, in English, Dutch, and Arabic.
- [x] The owner decisions above are reflected in the contract docs where they change the contract.
- [x] **Owner check:** Michael tries every part on blixis.test and confirms before this task is marked Done.
- [x] Reviewed PRs for every part are merged, with evidence and metadata recorded here.

## Testing requirements

Extend the 03-05 harness (or the shared harness from [R-02](../../../development/history/R-02-repository-maintenance.md) if it exists by then): visible effect on a fresh child theme; screenshot comparison for Base and the Showcase without configuration; v1 to v2 migration fixtures and parity between the PHP and TypeScript validators for every colour format and unit; dark mode in both colour schemes; keyboard and screen-reader checks for every new control; reduced motion; JavaScript on and off. Record exact commands and results in each PR.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `03-05`
- **Branches:** `feat/03-06-token-contract-v2` (Part B), `feat/03-06-token-driven-themes` (Part A), `feat/03-06-wizard-controls` (Parts C and D), `feat/03-06-wizard-design-controls` (visual redesign, which merged `feat/03-06-wizard-design-shell`).
- **PRs and merge commits** (each squash-merged after every required check passed):
  - [#41](https://github.com/EmVeeNL/blixis-wordpress/pull/41) as `b7dfc9180c976aa60cc8b8cfd047f4ca2dcca604` at 2026-11-09T22:12:00Z: Part B, contract version 2.
  - [#42](https://github.com/EmVeeNL/blixis-wordpress/pull/42) as `8fbae0db42d7854755ae95038196f951b239dd68` at 2026-11-09T22:29:08Z: Part A, Base and child themes use the presets.
  - [#43](https://github.com/EmVeeNL/blixis-wordpress/pull/43) as `696263b359693482d3dcea78dd6267eb09fa79cd` at 2026-11-09T23:09:51Z: Parts C and D, controls and previews.
  - [#44](https://github.com/EmVeeNL/blixis-wordpress/pull/44) as `ea7d13e36e767379504c1922025570f3165ab8c2` at 2026-11-10T09:03:31Z: visual redesign (step tabs, cards, side preview, admin accent); last branch commit `fdb8b06`.
- **Tests:** `tests/03-06/run.sh --browsers chromium,firefox` passes on WordPress 7.1.4/PHP 8.3 and 7.0.8/PHP 8.5, including axe-core at 1280 and 320 px in English, Dutch, and Arabic with JavaScript on and off (at `fdb8b06`: 225 Chromium and 224 Firefox checks per stack, 0 failed). 03-03, 03-04, 03-05, the contract fixtures in PHP and TypeScript, and the 01-05 spike also pass. `Quality` passed on `main` at `ea7d13e` ([run](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42787509377)). From this status change on, CI runs the 03-06 harness in the `setup-wizard` job.
- **Started / completed / closed:** Started 2026-11-09; completed 2026-11-10; not released.
- **Status:** Done. All parts are merged and Michael confirmed the result on 2026-11-10. Status records merged in [#46](https://github.com/EmVeeNL/blixis-wordpress/pull/46). Follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-09 | New → Backlog | Added after Michael's manual test on blixis.test: a body font chosen in the wizard did not show until `theme.json` was edited by hand, and a generated child theme cannot look like the Showcase. Proposed criteria await owner confirmation. |
| 2026-11-09 | Scope extended (Backlog) | Michael added colour formats (hex, RGB, HSL, OKLCH), dark mode, and wizard usability: progress styling, conditional new-theme fields, button labels, sliders with units, friendly shadow and motion controls, and previews on every step. He asked whether the Site Editor uses Tailwind CSS v4 (answered above) and asked for all of it in this task. |
| 2026-11-09 | Backlog → Ready | Michael accepted the recommended owner decisions; dependency `03-05` is Done; criteria and owner recorded. |
| 2026-11-09 | Ready → Busy | Work started on the task branches above, from `22ed24e`. |
| 2026-11-10 | Busy → In Review | PRs [#41](https://github.com/EmVeeNL/blixis-wordpress/pull/41) to [#44](https://github.com/EmVeeNL/blixis-wordpress/pull/44) merged, last as `ea7d13e`; evidence above. Done waits for Michael's check on blixis.test. |
| 2026-11-10 | In Review → Done | Michael checked the result on blixis.test and asked to mark the task Done. PRs #41 to #44 merged; `Quality` passed on `main` at `ea7d13e`, and the 03-06 harness has run in CI since #46. |
