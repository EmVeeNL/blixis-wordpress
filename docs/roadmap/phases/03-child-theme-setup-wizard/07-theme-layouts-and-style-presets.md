---
id: "03-07"
title: "Create a theme from layouts, header and footer settings, and style presets"
phase: "03"
status: Backlog
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-10"
updated_at: "2026-11-10"
depends_on: ["03-06"]
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

# 03-07 — Create a theme from layouts, header and footer settings, and style presets

## Description

Creating a child theme in the wizard (step 1) offers only a name, a slug, and an optional neutral starter. A new site still needs hand work in the Site Editor before it looks like a site: the header and footer are Base's plain parts, and every token starts from the contract defaults.

This task lets a site owner create a theme by choosing:

- a **layout** from a list, previewed before the theme is created;
- **header settings**, such as a sticky header and a USP bar;
- **footer settings**, such as keeping the footer at the bottom of short pages;
- a **style preset**, a complete set of tokens to start from.

Michael asked for this on 2026-11-10. Planned work; no implementation or PR is claimed. Base stays brand-neutral: layouts, presets, and their sample content are neutral, use system fonts, and contain no unlicensed images.

## Owner decisions

Michael chose these on 2026-11-10:

1. **Header and footer settings can be changed at any time.** They are stored as a versioned layout configuration, validated like the tokens, with preview and rollback in the wizard. The layout's page content (front page and patterns) is written once into the child theme and edited afterwards in the Site Editor.
2. **"Footer at the bottom"** means the footer sits at the bottom of the window on short pages and scrolls normally on long pages. It is not a fixed footer.
3. **Style presets are token sets in the wizard.** Choosing one fills the wizard draft, and every value can still be adjusted. They are not WordPress style variations, because the Site Editor policy from 03-05 removes user presets while a Blixis configuration applies.
4. **Priority P0.** Phase 03 exit (MVP-0) waits for this task.

## Proposal (to confirm)

**Layouts.** A list of cards with a thumbnail and one line each, as a radio group:

- Blank (header, content, footer only);
- Business (hero, three features, call to action);
- Portfolio (intro, project grid);
- Blog (latest posts with a featured post);
- Landing page (one page with sections and anchor navigation).

Each layout is a front-page template plus editable patterns in the generated child theme, built from core blocks and Base's presets. It replaces today's `starter` choice (`none` becomes Blank, `neutral` becomes Business); the REST generator keeps accepting the old values.

**Header settings:**

- sticky header (stays at the top while scrolling, below the admin bar);
- USP bar above the header: on or off, with up to three short texts, shown with a check icon;
- logo position: left or centred;
- optional call-to-action button (text and link);
- search: on or off;
- mobile menu: core navigation overlay, always or only on small screens.

**Footer settings:**

- footer at the bottom on short pages;
- columns: one to four (site info, menu, contact, social links);
- copyright line with the year filled in automatically;
- "back to top" link: on or off.

**Style presets.** About six neutral token sets that pass the v2 validator and the contrast checks, for example Neutral, Warm, Fresh, Bold, Minimal, and one with a dark palette. Each is shown as a card with swatches and a type sample.

**Where the settings live.** A new versioned contract for the layout configuration (header and footer settings and the chosen layout), stored per child theme next to the tokens. It has the same guarantees as the tokens: PHP and TypeScript validators, fixtures, compare-and-swap saves, drafts, preview, and rollback. Base renders the settings through its header and footer parts and a small amount of CSS, so changing a setting needs no file writes. Text from the settings (USP texts, button text, copyright) is plain text, escaped on output; links are validated URLs.

**Wizard.** Step 1 gets the layout list and the style presets for a new theme. A new step, **Header and footer**, comes after Spacing and layout, with the live preview from 03-06. The step tabs, cards, rows, and controls reuse the 03-06 design.

## Acceptance criteria

- [ ] Creating a theme in the wizard offers the layout list and the style presets. The created child theme renders the chosen layout and starts from the chosen preset; the preview shows both before anything is created.
- [ ] Every header and footer setting above works on the public page and in the preview, and can be changed later with preview, save, and rollback.
- [ ] The layout configuration has a versioned contract with PHP and TypeScript validators that agree on shared fixtures, and stored values are migrated if the contract changes.
- [ ] Every preset passes the v2 token validator and has no contrast warnings for text, links, and buttons.
- [ ] The sticky header does not hide focused elements or anchor targets (`scroll-padding-top`), respects the admin bar, and keeps one `banner` landmark. The USP bar is a list, not decoration only. The footer at the bottom does not cause overflow at 320 px.
- [ ] Every layout passes the 02-04 semantic checks (one `main`, one h1, labelled navigation, skip link) and axe-core at 1280 and 320 px in Chromium and Firefox, in English, Dutch, and Arabic, with JavaScript on and off.
- [ ] Base holds no branding; layouts and presets contain no unlicensed images or remote fonts.
- [ ] Endpoints and wizard handlers check capabilities and nonces, validate input, and escape output; drafts are never cached for other users.
- [ ] **Owner check:** Michael tries every layout, setting, and preset on blixis.test and confirms before this task is marked Done.
- [ ] Reviewed PRs are merged, with evidence and metadata recorded here.

## Testing requirements

Extend the 03-06 harness: create a theme for each layout and preset in a disposable WordPress; check each header and footer setting on the public page and in the preview; contract fixtures through both validators; the semantic and accessibility checks above; reduced motion for the sticky header; no external requests. Record exact commands and results in each PR, and run the harness in the `setup-wizard` CI job.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `03-06`
- **Branch:** Not created.
- **Commit references:** None.
- **PR number and URL:** None.
- **Started / completed / closed:** Not recorded.
- **Status:** Backlog. The owner decisions are recorded; the proposed layouts, settings, and presets await Michael's confirmation before Ready. Follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-10 | New → Backlog | Michael asked for theme creation from layouts, header and footer settings, and style presets, and chose owner decisions 1 to 4. The proposal awaits his confirmation. |
