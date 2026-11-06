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
