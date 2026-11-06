---
id: "01-05"
title: "Validate architecture contracts and ADRs"
phase: "01"
status: In Review
priority: P0
owner: "EmVeeNL"
created_at: "2026-11-06"
updated_at: "2026-11-06"
depends_on: ["01-04"]
branch: "docs/01-05-architecture-contracts"
pr_number: 16
pr_url: "https://github.com/EmVeeNL/blixis-wordpress/pull/16"
commit_sha: "866eec11b51beeb74ba31ab5de4e0c093c8bd688"
merged_at: null
merge_commit_sha: null
started_at: "2026-11-06"
completed_at: null
closed_at: null
blocked_reason: null
blocked_by: []
---

# 01-05 — Validate architecture contracts and ADRs

## Description

Review data ownership, schema and token contracts, rendering and API trust boundaries; resolve provisional ADRs with the owner. The contracts in [`docs/contracts`](../../../contracts/README.md) are accepted design baselines after delegated review; no product implementation is claimed.

## Technical requirements

- Confirm ownership of WordPress post fields, protected document meta, theme configuration, element manifests, renderer, editor, and Content API.
- Review versioning, migrations, revision support, permission boundaries, public/draft separation, token generation, and cache invalidation using fixtures or proofs of concept.
- Resolve provisional [ADRs](../../../architecture/DECISIONS.md) and relevant [open questions](../../../architecture/OPEN_QUESTIONS.md) with the project owner; record alternatives and consequences.
- Publish stable contract examples for schema, tokens, and API before dependent implementation tasks become `Ready`.

## Acceptance criteria

- [x] Module ownership and data flow are unambiguous across architecture, ADRs, examples, and roadmap.
- [x] Schema, token, renderer, and API boundaries have versioned examples and negative security cases.
- [x] Relevant ADRs have an evidence-backed status and owner decision; remaining questions have explicit follow-up owners.
- [ ] The reviewed PR is merged with architecture/security review notes and task metadata.

## Testing requirements

Run contract fixtures for valid/invalid document graphs, token values, migration boundaries, and authorization cases where prototypes exist. Complete an architecture and threat-model review; validate links and record approvals, gaps, and exact test results.

## Test results

At commit `866eec1` on 2026-11-06:

| Check | Result |
|---|---|
| [Quality run](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42305010143) | All 15 jobs pass |
| [PHP lint run](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42305010157) | Pass |
| `contracts`: `pnpm --filter blixis-contract-spike run test` | 289 pass, 0 fail, 0 skipped |
| `contracts-wordpress`: `run.sh document`, WordPress 7.1.4/PHP 8.4 and 7.0.8/8.5 | pass=319 fail=0 on each |
| `contracts-wordpress`: `run.sh tokens`, both combinations | pass=615 fail=0 on each |
| `contracts-wordpress`: `run.sh api`, both combinations | pass=2281 and pass=2269, fail=0. The sweep covers fewer core routes on 7.0.8 |
| Local: `run.sh <area> 7.1.4 8.3` for all three | Same counts as 7.1.4/8.4 |
| Local fault: projection without entity-encoded brackets | `pass=315 fail=4`, as intended |
| Local fault: `paragraph.html` restored in the renderer registry | 4 tests fail, as intended |

Reviewer fault runs are in each [review note](../../../architecture/reviews/01-05-integration.md). The architecture and threat-model reviews are complete. Delegated owner decisions and implementation gaps are recorded in that note. The design is accepted; the combined save-to-publish path, real deployment conditions, and the other 16 elements remain unproven.

## Tracking and completion

- **Priority:** P0
- **Dependencies:** `01-04`
- **Branch:** `docs/01-05-architecture-contracts`.
- **Commit references:** `866eec1` is the commit tested below.
- **PR number and URL:** [#16](https://github.com/EmVeeNL/blixis-wordpress/pull/16).
- **Started / completed / closed:** Started 2026-11-06; not completed.
- **Status:** In Review. Criteria 1–3 have accepted design evidence; criterion 4 still needs PR merge evidence. Follow [status workflow](../../../development/STATUS_WORKFLOW.md).

## Status history

| Date | Transition | Evidence |
|---|---|---|
| 2026-11-06 | Initial planning → Backlog | Downloaded project plan; no implementation evidence |
| 2026-11-06 | Backlog → Ready | Dependency `01-04` was completed in PR [#12](https://github.com/EmVeeNL/blixis-wordpress/pull/12), merged as `4fa55e6668d01bc9e447f66e783dbf327dd34a97`; owner and acceptance criteria are recorded. |
| 2026-11-06 | Ready → Busy | Branch `docs/01-05-architecture-contracts` created from `a88559c`; three independent reviews started |
| 2026-11-06 | Busy → In Review | PR [#16](https://github.com/EmVeeNL/blixis-wordpress/pull/16), commit `866eec1`; results above. Owner decisions and review pending |
| 2026-11-06 | In Review, decisions resolved | Delegated owner review accepted ADR-001–007 as design, left ADR-008 Proposed, resolved Q04–Q06 and Q10–Q11, required an external API-key pepper in production, and retained `documentId` as a non-authoritative v1 record. The 16 outcomes and limits are in the [integration note](../../../architecture/reviews/01-05-integration.md). |
