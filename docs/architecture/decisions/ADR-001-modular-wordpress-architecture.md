# ADR-001 — Separate WordPress modules

- **Date:** 2026-11-06
- **Status:** Accepted (provisional)
- **Owner:** Project owner, confirmation pending

## Context

The project needs a stable contract for this boundary. This record came from the downloaded planning pack; provisional acceptance is a working hypothesis, not final owner approval.

## Decision under review

Keep Base parent theme, child themes, Blocks editor plugin, and API module independently deployable.

## Alternative

Putting all functionality in one theme.

## Consequences and validation

Requires versioned interfaces and integration tests; owner confirmation is still needed. Validate with a proof of concept, relevant unit/integration tests, and owner/security review before changing the status to Accepted.
