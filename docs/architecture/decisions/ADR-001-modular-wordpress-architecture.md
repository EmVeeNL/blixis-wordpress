# ADR-001 — Separate WordPress modules

- **Date:** 2026-11-06
- **Status:** Accepted (design; implementation pending)
- **Owner:** Michael, through delegated 01-05 architecture review

## Context

The project needs a stable contract for this boundary. Task 01-05 reviewed the original planning decision against the contract proofs.

## Accepted decision

Keep Base, child themes, Blocks, and the API module separately versioned. The registry, renderer, compiled utilities, and token module ship together inside Blocks; their versions and class coverage must agree. The API uses a versioned renderer interface and owns its own namespace.

## Alternative

Putting all functionality in one theme.

## Consequences and validation

Requires versioned interfaces and integration tests. Behavior when Blocks is inactive remains to be designed in task 08-01. Acceptance here is a design decision, not proof that the modules exist.

## Review evidence, task 01-05

- **Approval:** Accepted with the amendments below in delegated owner review on 2026-11-06.
- **Amendments:** "Independently deployable" is too strong. Base, child theme, Blocks, and the API module are separately versioned; registry, renderer, and compiled utilities ship together inside Blocks, and the tokens module lives there too. The API module uses `blixis/v1`, Blocks `blixis-editor/v1`, and key administration `blixis-admin/v1`.
- **Remaining consequences:** Behavior of the API when Blocks is inactive is not yet designed. Task 08-01 owns it. A class-coverage test must gate each Blocks build.
- **Evidence:** [Tokens](../reviews/01-05-tokens.md#module-ownership-feedback-on-adr-001), [API](../reviews/01-05-api.md#recommended-status); [integration note](../reviews/01-05-integration.md).
