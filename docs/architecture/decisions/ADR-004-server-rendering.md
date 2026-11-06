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

## Review evidence, task 01-05

- **Recommendation:** Accept with amendments. Owner decision pending; the status above does not change until then.
- **Amendments:** Parity is compared on parsed DOM with shared fixtures, device preview uses an iframe, diagnostics stay out of public HTML, and the hook on `the_content` runs last with a password guard.
- **Remaining consequences:** Every element needs parity fixtures. Visual regression is still unproven.
- **Evidence:** [Tokens](../reviews/01-05-tokens.md#findings), [integration](../reviews/01-05-integration.md); [integration note](../reviews/01-05-integration.md).
