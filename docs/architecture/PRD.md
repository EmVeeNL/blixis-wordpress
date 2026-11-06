# Product requirements

## Problem and users

Blixis aims to make WordPress page building predictable, fast, and maintainable through one design-token model, structured content, and native publication. Target users are site administrators, designers, content editors, reviewers, and developers. The first real site is planned for Wilde Groei; no client site has been delivered.

## Required journeys

1. A site builder configures a child theme once and sees the same tokens in editor, preview, and public pages.
2. An editor creates a draft, adds and reorders elements, edits content, checks responsive variants, saves, and reopens the same document without data loss.
3. A reviewer sees an authorized draft preview without publication or a public content leak.
4. A publisher explicitly publishes; autosave and preview never publish.
5. An administrator later exposes only approved published fields through the Content API.

## Functional requirements

| IDs | Requirement | Target phase |
|---|---|---|
| FR-01–03 | Stable Base parent theme, configurable child theme, validated tokens, Tailwind CSS v4 | 02–03 |
| FR-04–08 | Canvas/tree, drag/drop, undo, schema-driven free elements, inspector, context menu, page metadata | 04–05 |
| FR-09–11 | Autosave, revisions, secure preview, accessible editor, free core element set | 05–06 |
| FR-12 | First Wilde Groei website | 07 |
| FR-13 | Controlled read-only Content API | 08 |
| FR-14–16 | Frontend editing, premium marketplace, live collaboration | 09, proposed |

The [MVP plan](../roadmap/MVP.md) and [roadmap](../roadmap/ROADMAP.md) define delivery order. Phase numbers describe plans, not implementation claims.

## Nonfunctional requirements and acceptance

All REST actions require capability checks, input validation, output escaping, and protected draft boundaries. Public pages should avoid editor JavaScript and target WCAG 2.2 AA. Recoverable migrations, backup/rollback, and revision integrity are release requirements. Performance targets are in the [security and performance guide](../security/SECURITY_AND_PERFORMANCE.md); they are targets, not measured results. Supported runtime versions must be established by task `01-02`.

Success is an approved Wilde Groei site built with a child theme and Blixis Blocks, editable without code, with accessible public HTML and an API limited to allowed published content. The proposed 15-minute first-page goal requires user validation. Marketplace, billing, live co-editing, arbitrary scripts/CSS, and multisite orchestration are outside initial scope.
