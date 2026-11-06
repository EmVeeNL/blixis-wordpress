# ADR-007 — Scoped Content API keys

- **Date:** 2026-11-06
- **Status:** Accepted (design; implementation pending)
- **Owner:** Michael, through delegated 01-05 architecture review

## Context

The project needs a stable contract for this boundary. Task 01-05 tested API authentication, visibility, and quota boundaries against real WordPress fixtures.

## Accepted decision

Store only keyed hashes of bearer keys, use a minimal `read:published` scope, and enforce publication status server-side. A key identifies an API client, never a WordPress user. A production site must supply a dedicated server-side pepper outside the database; if it is missing, key issuance and validation fail closed.

## Alternative

Unlimited plaintext API keys.

## Consequences and validation

Requires key rotation, audit, atomic quotas, edge rate limits, cache isolation, and deployment guidance for the pepper. The 01-05 proof uses a `wp_salt` fallback, so dedicated-pepper configuration and rotation remain task 08-01 implementation gates.

## Review evidence, task 01-05

- **Approval:** Accepted with the amendments below in delegated owner review on 2026-11-06. The optional `wp_salt` fallback is rejected for production because it can reside in the same database as key hashes.
- **Amendments:** Keys are stored as a keyed hash with a key ID and a dedicated external pepper in production. A key identifies a client and never logs in a WordPress user. Cookies and application passwords do not widen visibility. HTTPS trusts forwarded headers only from a configured peer. Quotas use an atomic counter, with volumetric limits at the edge.
- **Remaining consequences:** Needs a key interface, a counter table or edge, and documentation that rotating salts invalidates keys.
- **Evidence:** [API](../reviews/01-05-api.md#recommended-status), [contract](../../contracts/api/README.md); [integration note](../reviews/01-05-integration.md).
