# ADR-005 — Protected draft review

- **Date:** 2026-11-06
- **Status:** Proposed
- **Owner:** Project owner, confirmation pending

## Context

The project needs a stable contract for this boundary. This record came from the downloaded planning pack; provisional acceptance is a working hypothesis, not final owner approval.

## Decision under review

Start with authenticated WordPress previews; evaluate external links only with revision scope, TTL, hash, and revocation.

## Alternative

Unlimited public draft URLs.

## Consequences and validation

External review adds threat and operational work; do not ship until tested. Validate with a proof of concept, relevant unit/integration tests, and owner/security review before changing the status to Accepted.
