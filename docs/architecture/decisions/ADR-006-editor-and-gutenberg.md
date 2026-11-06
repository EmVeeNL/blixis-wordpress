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
