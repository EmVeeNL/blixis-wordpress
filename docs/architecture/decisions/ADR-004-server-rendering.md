# ADR-004 — Server-rendered public pages

- **Date:** 2026-11-06
- **Status:** Accepted (provisional)
- **Owner:** Project owner, confirmation pending

## Context

The project needs a stable contract for this boundary. This record came from the downloaded planning pack; provisional acceptance is a working hypothesis, not final owner approval.

## Decision under review

Use PHP/server rendering for public semantic HTML and React only in the admin editor.

## Alternative

Rendering the entire public site client-side.

## Consequences and validation

Requires preview/render parity tests and contextual escaping. Validate with a proof of concept, relevant unit/integration tests, and owner/security review before changing the status to Accepted.
