# MVP scope

| Milestone | Scope | Phases (proposed) | Status |
|---|---|---|---|
| MVP-0 | Base theme, starter child theme, token setup and preview | 02, 03 | Planned |
| MVP-1 | Visual editor, free elements, responsive controls, save/revisions, secure preview, and hardening | 04, 05, 06 | Planned |
| MVP-2 | Wilde Groei site, editorial flow, SEO, accessibility and handover | 07 | Planned |
| MVP-3 | Published-content API, scoped keys, cache and operations | 08 | Planned |

Phase 01 is the prerequisite for all milestones; Phase 09 follows the MVP. [Scope traceability](../architecture/SCOPE_TRACEABILITY.md) proposes the requirement mapping and per-milestone gates, pending owner approval.

The API is a product pillar, but the first client site need not wait for it. It may move earlier only after the content and security contracts are approved. The minimal theme and plugin entry point in this repository are groundwork, not any completed MVP milestone.

The free v1 set is Section, Container, Columns, Column, Heading, Paragraph, Image, Button, Spacer, Divider, Icon, List, Quote, Video, Accordion, Tabs, Card, CTA, Navigation, and Form Embed. [Element specifications](../architecture/ELEMENTS.md) are plans, not implementations.

Release gates include server and editor schema validation, permission tests, draft isolation, keyboard interaction, WCAG review, backup/restore, documented migrations, and repeatable performance measurements. If scope must shrink, defer element variations and advanced controls before core security, recovery, and accessible operation.
