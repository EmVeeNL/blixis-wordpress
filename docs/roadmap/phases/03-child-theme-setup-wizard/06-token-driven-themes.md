---
id: "03-06"
title: "Make Base and child themes use the tokens, and make the wizard friendly"
phase: "03"
status: Backlog
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-09"
updated_at: "2026-11-09"
depends_on: ["03-05"]
branch: null
pr_number: null
pr_url: null
commit_sha: null
merged_at: null
merge_commit_sha: null
started_at: null
completed_at: null
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

This task makes wizard choices visibly change Base, generated child themes, and the Showcase, and turns the wizard into something a site owner can use without CSS knowledge. Michael asked for all of this in one task on 2026-11-09. Planned work; no implementation or PR is claimed.

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
- The main button names what happens: **Continue** when an existing child theme is selected or nothing on a step changed, **Create theme and continue** for a new theme, **Save and continue** when a step has changes. (Michael's "same with the colour feature" is read as: the Colours step and every later step use the same rule. Confirm before building.)

**Controls instead of raw CSS**

- **Colours:** a colour picker plus a format switch (hex, RGB, HSL, OKLCH), the text value editable for precision, and contrast against surface shown next to each foreground colour.
- **Type scale, spacing, corner radius, layout widths:** a slider with a number field and a unit menu. Units offered: `px` and `rem` everywhere (the current contract); `em` for type scale and spacing; `%`, `ch`, and `vw` for layout widths only. Every unit beyond `px` and `rem` is a contract change in Part B's version 2. Slider ranges and steps per field are defined in the contract, not only in the interface. Type scale offers *keep proportions* to scale all sizes from the base size.
- **Shadows:** named presets (None, Subtle, Soft, Medium, Strong) shown as cards, plus an **Adjust** panel with sliders for offset, blur, spread, and opacity and a colour choice. The CSS text stays available behind **Edit as CSS** for experts.
- **Motion:** named speeds (Fast, Normal, Slow) with sliders in milliseconds, and easing presets with plain names (Smooth, Gentle start, Gentle stop, Linear, Springy). A **Play** button animates a sample; it never plays automatically and shows a static explanation under `prefers-reduced-motion`.

**Live previews on every step**

- Each step shows a small specimen: colour swatches with contrast results, a type specimen with headings and body text, a spacing ruler, radius samples, shadow cards, and the motion sample.
- The front-page preview (now on the review step) is available on every step and updates as values change, using the client validator and `previewProperties()` from [`@blixis/tokens`](../../../development/TOKENS.md). The server stays authoritative: every submit is still validated in PHP.

**Technology**

- These controls need JavaScript. The wizard stays usable without it (plain fields, server validation), and JavaScript enhances it. Build it with TypeScript 7 and the workspace tools; the choice between plain TypeScript and React (the phase 04 editor uses React) is an owner decision below.

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

## Owner decisions needed before work starts

1. **Contract version:** recommended `schemaVersion` 2 with automatic migration of stored v1 configs (Part B).
2. **Colour storage:** keep the chosen format (recommended) or convert everything to one format.
3. **Dark mode:** follow the visitor's system setting by default, with an optional *always light* / *always dark* override (recommended). A visitor-facing toggle is out of scope unless requested.
4. **Units:** the unit sets in Part C (recommended), or `px` and `rem` only.
5. **Wizard technology:** plain TypeScript with progressive enhancement (recommended for the wizard: small, works without JavaScript), or React to match the phase 04 editor.
6. **Button labels on later steps:** confirm the reading of "same with the colour feature" in Part C.

## Acceptance criteria

- [ ] **A:** with a fresh generated child theme active, changing body font, heading font, primary (link) colour, and spacing in the wizard visibly changes the public page and the preview; no hand edit of `theme.json` is needed; Base and the Showcase without a configuration look as before (screenshot comparison), and Base holds no branding.
- [ ] **B:** colours can be entered and stored in hex, RGB, HSL, and OKLCH; an optional dark palette applies under `prefers-color-scheme: dark` and with the site override; stored v1 configs migrate without loss; validators, fixtures, goldens, and docs agree.
- [ ] **C:** the progress list, conditional new-theme fields, button labels, sliders with unit menus, shadow presets and editor, motion presets with a play button, and per-step live previews work as described, with JavaScript on; the wizard still works with JavaScript off.
- [ ] **D:** keyboard use, labels, contrast warnings, reduced motion, and axe-core checks pass at 1280 and 320 px in Chromium and Firefox, in English, Dutch, and Arabic.
- [ ] The owner decisions above are recorded in this task and, where they change the contract, in the contract docs.
- [ ] **Owner check:** Michael tries every part on blixis.test and confirms before this task is marked Done.
- [ ] Reviewed PRs for every part are merged, with evidence and metadata recorded here.

## Testing requirements

Extend the 03-05 harness (or the shared harness from [R-02](../../../development/history/R-02-repository-maintenance.md) if it exists by then): visible effect on a fresh child theme; screenshot comparison for Base and the Showcase without configuration; v1 to v2 migration fixtures and parity between the PHP and TypeScript validators for every colour format and unit; dark mode in both colour schemes; keyboard and screen-reader checks for every new control; reduced motion; JavaScript on and off. Record exact commands and results in each PR.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `03-05`
- **Branch:** Not created.
- **Commit references:** None.
- **PR number and URL:** None.
- **Started / completed / closed:** Not recorded.
- **Status:** Backlog. It becomes Ready once Michael has answered the owner decisions above. Phase 03 exit (MVP-0) waits for this task. Follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-09 | New → Backlog | Added after Michael's manual test on blixis.test: a body font chosen in the wizard did not show until `theme.json` was edited by hand, and a generated child theme cannot look like the Showcase. Proposed criteria await owner confirmation. |
| 2026-11-09 | Scope extended (Backlog) | Michael added colour formats (hex, RGB, HSL, OKLCH), dark mode, and wizard usability: progress styling, conditional new-theme fields, button labels, sliders with units, friendly shadow and motion controls, and previews on every step. He asked whether the Site Editor uses Tailwind CSS v4 (answered above) and asked for all of it in this task. |
