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
