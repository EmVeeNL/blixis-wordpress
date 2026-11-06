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
