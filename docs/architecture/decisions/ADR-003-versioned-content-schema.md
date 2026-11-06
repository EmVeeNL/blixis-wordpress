# ADR-003 — Versioned document graph

- **Date:** 2026-11-06
- **Status:** Accepted (provisional)
- **Owner:** Project owner, confirmation pending

## Context

The project needs a stable contract for this boundary. This record came from the downloaded planning pack; provisional acceptance is a working hypothesis, not final owner approval.

## Decision under review

Store a schemaVersion document and versioned nodes in protected WordPress post meta.

## Alternative

HTML blobs or native blocks as the sole storage model.

## Consequences and validation

Needs explicit meta revision support, migration fixtures, limits, and safe unknown-version behavior. Validate with a proof of concept, relevant unit/integration tests, and owner/security review before changing the status to Accepted.

## Review evidence, task 01-05

- **Recommendation:** Accept with amendments. Owner decision pending; the status above does not change until then.
- **Amendments:** `post_content` holds a `core/html` projection; raw bytes are stored and hashed; writes lock the post row; every read validates; `auth_callback` is false; revisions are capped; `schemaVersion` and element `version` are separate; only PHP runs migrations.
- **Remaining consequences:** A second text copy in `post_content`, a re-projection job when renderer output changes, revision growth to manage. Alternatives also considered: custom table, which loses core revisions and export.
- **Evidence:** [Document](../reviews/01-05-document.md#adr-recommendations), [contract](../../contracts/document/README.md); [integration note](../reviews/01-05-integration.md).
