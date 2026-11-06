# ADR-005 — Protected draft review

- **Date:** 2026-11-06
- **Status:** Proposed
- **Owner:** Project owner, confirmation pending

## Context

The project needs a stable contract for this boundary. This record came from the downloaded planning pack; provisional acceptance is a working hypothesis, not final owner approval.

## Decision under review

Start with authenticated WordPress previews; evaluate external links only with revision scope, TTL, hash, and revocation.

## Alternative

Unlimited public draft URLs.

## Consequences and validation

External review adds threat and operational work; do not ship until tested. Validate with a proof of concept, relevant unit/integration tests, and owner/security review before changing the status to Accepted.

## Review evidence, task 01-05

- **Recommendation:** Accept with amendments. Owner decision pending; the status above does not change until then.
- **Amendments:** Authenticated preview only for MVP; `no-store` and `noindex` on non-public views; draft edits of a live page in per-user autosave revisions, promoted by a publish requiring `edit_post` and `publish_pages`.
- **Remaining consequences:** Reviewers need accounts that can edit the page, because WordPress has no view-only draft capability. Link requirements are recorded for a later decision.
- **Evidence:** [API](../reviews/01-05-api.md#external-review-links-evaluated-not-built); [integration note](../reviews/01-05-integration.md).
