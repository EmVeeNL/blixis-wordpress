# ADR-005 — Protected draft review

- **Date:** 2026-11-06
- **Status:** Accepted (design; implementation pending)
- **Owner:** Michael, through delegated 01-05 architecture review

## Context

The project needs a stable contract for this boundary. Task 01-05 tested preview and publication boundaries against real WordPress fixtures.

## Accepted decision

Use authenticated WordPress previews only for the MVP. Non-public views are `no-store` and `noindex`. Draft edits of a live page stay in per-user autosave revisions until an explicit publish by a user with `edit_post` and `publish_pages`. External review links remain a later, separate decision.

## Alternative

Unlimited public draft URLs.

## Consequences and validation

External review adds threat and operational work; do not ship it until separately approved and tested. Reviewers need WordPress accounts with access to the page; a view-only reviewer capability remains unbuilt.

## Review evidence, task 01-05

- **Approval:** Accepted with the amendments below in delegated owner review on 2026-11-06.
- **Amendments:** Authenticated preview only for MVP; `no-store` and `noindex` on non-public views; draft edits of a live page in per-user autosave revisions, promoted by a publish requiring `edit_post` and `publish_pages`.
- **Remaining consequences:** Reviewers need accounts that can edit the page, because WordPress has no view-only draft capability. Link requirements are recorded for a later decision.
- **Evidence:** [API](../reviews/01-05-api.md#external-review-links-evaluated-not-built); [integration note](../reviews/01-05-integration.md).
