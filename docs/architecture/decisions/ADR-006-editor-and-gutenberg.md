# ADR-006 — One editor owner per page

- **Date:** 2026-11-06
- **Status:** Proposed
- **Owner:** Project owner, confirmation pending

## Context

The project needs a stable contract for this boundary. This record came from the downloaded planning pack; provisional acceptance is a working hypothesis, not final owner approval.

## Decision under review

Record an editor mode per page and use an explicit conversion policy between Blixis and Gutenberg.

## Alternative

Both editors silently writing the same content string.

## Consequences and validation

Requires import/export UX and safeguards against content loss. Validate with a proof of concept, relevant unit/integration tests, and owner/security review before changing the status to Accepted.

## Review evidence, task 01-05

- **Recommendation:** Accept with amendment. Owner decision pending; the status above does not change until then.
- **Amendments:** Ownership follows the presence of `_blixis_document`, with no separate mode field that could fall out of step. Core REST content writes on an owned page get a 409, and a hash detects writes that bypass it.
- **Remaining consequences:** Import from existing block content is unbuilt, and the core `/autosaves` route is not covered by the 409.
- **Evidence:** [Document](../reviews/01-05-document.md#adr-006-recommend-accepted-with-one-amendment-after-owner-review-closes-q05-if-the-owner-agrees); [integration note](../reviews/01-05-integration.md).
