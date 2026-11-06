# ADR-007 — Scoped Content API keys

- **Date:** 2026-11-06
- **Status:** Proposed
- **Owner:** Project owner, confirmation pending

## Context

The project needs a stable contract for this boundary. This record came from the downloaded planning pack; provisional acceptance is a working hypothesis, not final owner approval.

## Decision under review

Store only hashes of bearer keys, use a minimal read:published scope, and enforce publication status server-side.

## Alternative

Unlimited plaintext API keys.

## Consequences and validation

Requires key rotation, audit, rate limits, and cache isolation. Validate with a proof of concept, relevant unit/integration tests, and owner/security review before changing the status to Accepted.

## Review evidence, task 01-05

- **Recommendation:** Accept with amendments. Owner decision pending; the status above does not change until then.
- **Amendments:** Keys are stored as a keyed hash with a key ID. A key identifies a client and never logs in a WordPress user. Cookies and application passwords do not widen visibility. HTTPS trusts forwarded headers only from a configured peer. Quotas use an atomic counter, with volumetric limits at the edge.
- **Remaining consequences:** Needs a key interface, a counter table or edge, and documentation that rotating salts invalidates keys.
- **Evidence:** [API](../reviews/01-05-api.md#recommended-status), [contract](../../contracts/api/README.md); [integration note](../reviews/01-05-integration.md).
