# ADR-003 — Versioned document graph

- **Date:** 2026-11-06
- **Status:** Accepted (design; implementation pending)
- **Owner:** Michael, through delegated 01-05 architecture review

## Context

The project needs a stable contract for this boundary. Task 01-05 reviewed the original planning decision against document and WordPress proofs.

## Accepted decision

Store a `schemaVersion` document and versioned nodes as raw JSON bytes in protected, revisioned WordPress post meta. Keep a safe `core/html` projection in `post_content` for search and plugin-off fallback. A guarded route validates every write, uses a post-row lock for conflict-safe updates, and preserves revisions. `documentId` remains a required opaque record in v1; WordPress post ID alone identifies and authorizes the page.

## Alternative

HTML blobs or native blocks as the sole storage model.

## Consequences and validation

Needs explicit meta revision support, migration fixtures, limits, and safe unknown-version behavior. Do not use `documentId` for lookup, authorization, or uniqueness. Its duplication on a copied page is harmless under that rule; reconsider removal only through a later schema-version decision.

## Review evidence, task 01-05

- **Approval:** Accepted with the amendments below in delegated owner review on 2026-11-06. The 01-05 suggestion to remove `documentId` before v1 is rejected to keep the tested v1 envelope stable; it remains non-authoritative.
- **Amendments:** `post_content` holds a `core/html` projection; raw bytes are stored and hashed; writes lock the post row; every read validates; `auth_callback` is false; a revision cap is set after measuring real pages; `schemaVersion` and element `version` are separate; only PHP runs migrations.
- **Remaining consequences:** A second text copy in `post_content`, a re-projection job when renderer output changes, revision growth to manage. Alternatives also considered: custom table, which loses core revisions and export.
- **Evidence:** [Document](../reviews/01-05-document.md#adr-recommendations), [contract](../../contracts/document/README.md); [integration note](../reviews/01-05-integration.md).
