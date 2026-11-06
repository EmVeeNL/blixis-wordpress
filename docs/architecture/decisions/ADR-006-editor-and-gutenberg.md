# ADR-006 — One editor owner per page

- **Date:** 2026-11-06
- **Status:** Accepted (design; implementation pending)
- **Owner:** Michael, through delegated 01-05 architecture review

## Context

The project needs a stable contract for this boundary. Task 01-05 tested document ownership and core write paths.

## Accepted decision

A page belongs to Blixis when `_blixis_document` is present. Do not store a separate mode flag. Refuse core REST content writes to a Blixis-owned page and use an explicit conversion policy when handing it to the block editor.

## Alternative

Both editors silently writing the same content string.

## Consequences and validation

Requires import/export UX and safeguards against content loss. Core autosaves and non-REST writes need their own checks; the content hash detects changes outside the guarded path.

## Review evidence, task 01-05

- **Approval:** Accepted with the amendment below in delegated owner review on 2026-11-06.
- **Amendments:** Ownership follows the presence of `_blixis_document`, with no separate mode field that could fall out of step. Core REST content writes on an owned page get a 409, and a hash detects writes that bypass it.
- **Remaining consequences:** Import from existing block content is unbuilt, and the core `/autosaves` route is not covered by the 409.
- **Evidence:** [Document](../reviews/01-05-document.md#adr-006-recommend-accepted-with-one-amendment-after-owner-review-closes-q05-if-the-owner-agrees); [integration note](../reviews/01-05-integration.md).
