# ADR-002 — CSS-first token model

- **Date:** 2026-11-06
- **Status:** Accepted (provisional)
- **Owner:** Project owner, confirmation pending

## Context

The project needs a stable contract for this boundary. This record came from the downloaded planning pack; provisional acceptance is a working hypothesis, not final owner approval.

## Decision under review

Use Tailwind CSS v4 @theme for build-time utilities, validated runtime CSS custom properties for values, and fixed MVP breakpoints.

## Alternative

A JavaScript Tailwind configuration as a runtime token source.

## Consequences and validation

New utility names and breakpoint variants require a rebuild; validate token parity. Validate with a proof of concept, relevant unit/integration tests, and owner/security review before changing the status to Accepted.

## Review evidence, task 01-05

- **Recommendation:** Accept with amendments. Owner decision pending; the status above does not change until then.
- **Amendments:** Use `@theme inline` over closed names and unlayered utilities without preflight. Breakpoints are fixed build inputs. PHP is the only generator; TypeScript validates and previews.
- **Remaining consequences:** New names and breakpoints need a rebuild, and Site Editor edits can diverge from tokens unless a policy forbids them.
- **Evidence:** [Tokens](../reviews/01-05-tokens.md#findings), [contract](../../contracts/tokens/README.md); [integration note](../reviews/01-05-integration.md).
