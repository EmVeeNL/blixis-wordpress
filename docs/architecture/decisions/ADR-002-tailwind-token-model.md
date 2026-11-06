# ADR-002 — CSS-first token model

- **Date:** 2026-11-06
- **Status:** Accepted (design; implementation pending)
- **Owner:** Michael, through delegated 01-05 architecture review

## Context

The project needs a stable contract for this boundary. Task 01-05 reviewed the original planning decision against the token and renderer proofs.

## Accepted decision

Use Tailwind CSS v4 `@theme inline` for closed build-time utility names, validated runtime CSS custom properties for values, and fixed MVP breakpoints. PHP is the production token generator; TypeScript validates and previews.

## Alternative

A JavaScript Tailwind configuration as a runtime token source.

## Consequences and validation

New utility names and breakpoint variants require a rebuild. Implementation must verify token parity and prevent Site Editor changes from becoming a competing token source.

## Review evidence, task 01-05

- **Approval:** Accepted with the amendments below in delegated owner review on 2026-11-06.
- **Amendments:** Use `@theme inline` over closed names and unlayered utilities without preflight. Breakpoints are fixed build inputs. PHP is the only generator; TypeScript validates and previews.
- **Remaining consequences:** New names and breakpoints need a rebuild, and Site Editor edits can diverge from tokens unless a policy forbids them.
- **Evidence:** [Tokens](../reviews/01-05-tokens.md#findings), [contract](../../contracts/tokens/README.md); [integration note](../reviews/01-05-integration.md).
