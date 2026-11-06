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

## Review evidence, task 01-05

- **Recommendation:** Accept with amendments. Owner decision pending; the status above does not change until then.
- **Amendments:** "Independently deployable" is too strong. Base, child theme, Blocks, and the API module are separately versioned; registry, renderer, and compiled utilities ship together inside Blocks, and the tokens module lives there too. The API module uses `blixis/v1`, Blocks `blixis-editor/v1`, and key administration `blixis-admin/v1`.
- **Remaining consequences:** Behavior of the API when Blocks is inactive is not yet designed. Task 08-01 owns it. A class-coverage test must gate each Blocks build.
- **Evidence:** [Tokens](../reviews/01-05-tokens.md#module-ownership-feedback-on-adr-001), [API](../reviews/01-05-api.md#recommended-status); [integration note](../reviews/01-05-integration.md).
