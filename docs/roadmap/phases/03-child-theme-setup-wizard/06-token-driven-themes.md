---
id: "03-06"
title: "Make Base and child themes use the tokens"
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

# 03-06 — Make Base and child themes use the tokens

## Description

Phase 03 stores, validates, previews, and applies design tokens, but Base's templates use only the background and text colour presets. A body font chosen in the wizard has no visible effect until someone edits the child theme's `theme.json` by hand, and the Showcase uses fixed colours. This task makes wizard choices visibly change Base, newly generated child themes, and the Showcase, so MVP-0 ("token setup and preview") delivers what it promises. Planned work; no implementation or PR is claimed.

## Technical requirements

- **Base styles use the presets.** Base `theme.json` styles point body text, headings, links (including hover and focus), buttons, block gap and content spacing, and layout widths at the token presets (`var:preset|…`), keeping neutral defaults when no configuration applies. Base stays brand-neutral.
- **Generated child themes inherit them.** The [child theme generator](../../../development/CHILD_THEME.md) writes a `theme.json` that inherits those styles and adds no fixed values. An optional starter (neutral front-page template and patterns, structured like the Showcase but without its branding) can be chosen when creating a theme.
- **Showcase reads tokens.** Showcase CSS uses `--blixis-*` custom properties with its current values as fallbacks, so it looks the same with no configuration and follows the wizard when it is the configured theme.
- **Contract.** The [token contract](../../../contracts/tokens/README.md) theme.json mapping and its golden files gain the style references. Recommended: an additive change within contract v1 rather than a version bump; this needs the owner's decision before implementation. Update the 02-03 bridge tests, the 01-05 contract fixtures, and the [token docs](../../../development/TOKENS.md#applying-tokens) together.
- **Preview.** The wizard preview of a plain Base child theme visibly reflects body font, heading font, link colour, and spacing changes.
- Keep accessibility: link and button colours from tokens must keep at least 4.5:1 contrast against the surface colour, or the wizard warns.

## Acceptance criteria

- [ ] With a fresh generated child theme active, changing body font, heading font, primary (link) colour, and spacing in the wizard visibly changes the public page and the preview, in Chromium and Firefox on WordPress 7.0 and 7.1.
- [ ] No hand edit of `theme.json` is needed for the body font to apply; the font loads from the Font Library on the site only.
- [ ] Base without a configuration and the Showcase without a configuration look as before (screenshot comparison), and Base contains no site branding.
- [ ] The contract change is decided by the owner and recorded; golden files, bridge tests, and docs agree.
- [ ] Link and button colour contrast is checked, with a wizard warning below 4.5:1.
- [ ] **Owner check:** Michael tries it on blixis.test and confirms before this task is marked Done.
- [ ] A reviewed PR is merged, with evidence and metadata recorded here.

## Testing requirements

Extend the 03-05 harness: wizard changes reflected on a fresh child theme's public page and preview; Base and Showcase screenshots unchanged without configuration; contrast warning; contract fixtures and 02-03 bridge goldens updated. Record exact commands and results in the PR.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `03-05`
- **Branch:** Not created.
- **Commit references:** None.
- **PR number and URL:** None.
- **Started / completed / closed:** Not recorded.
- **Status:** Backlog. It becomes Ready once Michael confirms these criteria and the contract decision above. Phase 03 exit (MVP-0) waits for this task. Follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-09 | New → Backlog | Added after Michael's manual test on blixis.test: a body font chosen in the wizard did not show until `theme.json` was edited by hand, and a generated child theme cannot look like the Showcase. Proposed criteria await owner confirmation. |
