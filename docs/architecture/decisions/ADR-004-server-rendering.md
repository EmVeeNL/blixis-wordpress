# ADR-004 — Server-rendered public pages

- **Date:** 2026-11-06
- **Status:** Accepted (design; implementation pending)
- **Owner:** Michael, through delegated 01-05 architecture review

## Context

The project needs a stable contract for this boundary. Task 01-05 reviewed the original planning decision against renderer and WordPress proofs.

## Accepted decision

Use allowlisted PHP rendering for public semantic HTML and React only in the admin editor. Run the `the_content` replacement after core filters, guard password-protected posts, and keep diagnostics out of public HTML.

## Alternative

Rendering the entire public site client-side.

## Consequences and validation

Requires preview/render parity tests, contextual escaping, and regression checks for shortcodes, protected posts, and unknown elements. Visual parity remains unproven until implementation.

## Review evidence, task 01-05

- **Approval:** Accepted with the amendments below in delegated owner review on 2026-11-06.
- **Amendments:** Parity is compared on parsed DOM with shared fixtures, device preview uses an iframe, diagnostics stay out of public HTML, and the hook on `the_content` runs last with a password guard.
- **Remaining consequences:** Every element needs parity fixtures. Visual regression is still unproven.
- **Evidence:** [Tokens](../reviews/01-05-tokens.md#findings), [integration](../reviews/01-05-integration.md); [integration note](../reviews/01-05-integration.md).
