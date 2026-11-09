# Scope and requirement traceability

**Status: Approved for planning on 2026-11-06.** Task [01-01](../roadmap/phases/01-discovery-foundation/01-requirements-and-scope.md) reconciled the repository documents. The owner delegated scope approval and PR handling to the architecture review in the task conversation. A document-based role walkthrough is recorded below; no independent stakeholder interview or working-product test has taken place. All features remain planned until implemented and verified.

## Personas

The [PRD](PRD.md) names five target users, while its journeys also use "site builder" and "publisher". This table reconciles those names. Publisher is a capability rather than a separate user type.

| Persona | PRD users covered | Journey |
|---|---|---|
| Site builder | Site administrator, designer | J1 |
| Content editor | Content editor | J2 |
| Reviewer | Reviewer | J3 |
| Publisher | Editor or administrator with publish capability | J4 |
| Administrator | Site administrator | J5 |
| Developer | Developer | J1 (child theme), J5 (API consumer) |

**Journeys** are the five in the PRD: J1 tokens and child theme, J2 draft editing, J3 authorized review, J4 explicit publication, J5 controlled API exposure.

## Requirement register

The PRD groups requirements under ID ranges, with seven capabilities in FR-04–08 and five in FR-09–11. This register defines one capability per ID. Responsive controls belong to FR-07. FR-17 records the owner's v1.1 Multisite decision. Michael ([@EmVeeNL](https://github.com/EmVeeNL)) is the owner of every row. Priority comes from the task files.

| ID | Requirement | Persona | Journey | Tasks | Milestone | Priority | Testable outcome |
|---|---|---|---|---|---|---|---|
| FR-01 | Stable, neutral Base parent theme | Site builder, developer | J1 | 02-01, 02-04, 02-05 | MVP-0 | P0 | Base installs without site branding and its templates pass landmark and keyboard checks |
| FR-02 | Configurable child theme | Site builder | J1 | 03-01, 03-03 | MVP-0 | P0 | The wizard produces an installable child theme and never writes to the parent |
| FR-03 | Validated tokens and Tailwind CSS v4 | Site builder | J1 | 02-02, 02-03, 03-02, 03-04, 03-05, 03-06 | MVP-0 | P0 | Invalid tokens are rejected on server and client; valid tokens match in the wizard preview and public page, and can be rolled back. Editor parity is verified in MVP-1 |
| FR-04 | Canvas, tree, drag/drop, and context actions | Content editor | J2 | 04-01, 04-03, 04-05 | MVP-1 | P0 | Elements can be added and reordered by pointer and keyboard; invalid nesting is refused |
| FR-05 | Undo and redo | Content editor | J2 | 04-02 | MVP-1 | P0 | Each document change can be undone and redone with selection and dirty state intact |
| FR-06 | Schema-driven free elements | Content editor, developer | J2 | 05-01, 05-02, 05-03 | MVP-1 | P0 | Every element validates against a versioned schema and renders through the allowlisted PHP renderer |
| FR-07 | Element inspector and responsive controls | Content editor | J2 | 04-04, 05-06 | MVP-1 | P0 | Controls come from the schema; a breakpoint value changes only in explicit breakpoint editing |
| FR-08 | Page metadata | Content editor | J2 | 04-04 | MVP-1 | P0 | Page settings stay available and persist through WordPress post fields |
| FR-09 | Autosave and revisions | Content editor, publisher | J2, J4 | 05-04 | MVP-1 | P0 | A reopened document matches what was saved, a revision restores, and autosave never publishes |
| FR-10 | Secure preview | Reviewer, publisher | J3, J4 | 05-05 | MVP-1 | P0 | Authorized users see the draft; anonymous and lower-privilege requests do not, and preview never publishes |
| FR-11 | Accessible editor with the free core element set | Content editor | J2 | 05-02, 05-03, 06-01 | MVP-1 | P0 | All 20 elements can be used by keyboard and the audit finds no open blocking WCAG 2.2 AA issue |
| FR-12 | First Wilde Groei website | All except developer | J1–J4 | 07-01 to 07-05 | MVP-2 | P1 | The client approves a site that can be edited without code and handover is complete |
| FR-13 | Controlled read-only Content API | Administrator, developer | J5 | 08-01 to 08-05 | MVP-3 | P1 | Scoped keys return allowed published fields only; drafts and protected meta are never returned |
| FR-14 | Frontend editing (proposed) | Content editor | None required | 09-01 | None | P2 | The evaluation records rendering and security constraints and a go or no-go |
| FR-15 | Premium marketplace (proposed) | Administrator | None required | 09-02 | None | P2 | The design preserves existing free content; no billing is built |
| FR-16 | Live collaboration (proposed) | Content editor, reviewer | None required | 09-04 | None | P2 | The evaluation covers permissions, presence, and conflicts and records a go or no-go |
| FR-17 | WordPress Multisite support | Network and site administrators, developer | Network administration | 09-06 | v1.1 | P1 | Two network sites isolate content, tokens, keys, permissions, and caches while preserving single-site upgrades |

**Tasks without a requirement of their own:** 01-01 to 01-05 are foundation work. 06-02 to 06-05 carry the nonfunctional requirements and release gates. 09-03 and 09-05 are exploration with no product commitment.

## Milestones and phases

The four [MVP milestones](../roadmap/MVP.md) are build checkpoints. The first release line is v1.0.x on single-site WordPress. Phase 01 is prerequisite work, Phase 06 exits MVP-1, and Multisite is planned for v1.1.

| Milestone | Phases | Requirements | Exit task |
|---|---|---|---|
| Prerequisite | 01 | Foundation | 01-05 |
| MVP-0 | 02, 03 | FR-01–03 | 03-06 |
| MVP-1 | 04, 05, 06 | FR-04–11 | 06-05 |
| MVP-2 | 07 | FR-12 | 07-05 |
| MVP-3 | 08 | FR-13 | 08-05 |
| After MVP | 09-01 to 09-05 | FR-14–16 | None |
| v1.1 planned | 09-06 | FR-17 | 09-06 |

## Wilde Groei before and after launch

No client discovery has happened, so this list comes from documents and must be checked with the client in task 07-01.

- **Needed before launch:** FR-01–12, the elements the approved pages use, SEO metadata, forms, consent, legal content, backup and restore, staging approval, monitoring, and editor training.
- **Can follow launch:** FR-13 (Content API), FR-14–17, and tasks 09-03 and 09-05. Multisite belongs to v1.1, after the first v1.0.x release line.
- **First to shrink if needed:** element variations and advanced controls, as [MVP scope](../roadmap/MVP.md) already says. Security, recovery, and accessible operation are not reduced.

## Proposed release gates

[MVP scope](../roadmap/MVP.md) lists release gates as one group. This table assigns each gate to a milestone. Performance budgets are [unmeasured targets](../security/SECURITY_AND_PERFORMANCE.md), so the MVP-1 gate is a repeatable measurement against an owner-accepted budget rather than a claim that today's targets are met.

| Milestone | Gate |
|---|---|
| MVP-0 | Server and client token validation; parent source protected; keyboard-operable wizard; token rollback; semantic templates |
| MVP-1 | Editor and public token parity; server and editor schema validation; permission tests; draft isolation; keyboard interaction; WCAG 2.2 AA review; backup and restore; documented migrations; repeatable performance measurements; security audit; integration regression |
| MVP-2 | Client approval on staging; public-page accessibility review; consent and legal content reviewed; verified backup and restore; editor training complete |
| MVP-3 | Key revocation and scope tests; draft and protected-meta isolation; rate limits and CORS allowlist; published API documentation and rollback runbook |
| v1.1 Multisite | Two-site isolation for content, tokens, keys, permissions, and caches; safe single-site upgrade and rollback; network-admin and site-admin integration tests |

## Conflicts found

| # | Conflict | Proposed resolution | State |
|---|---|---|---|
| C1 | The PRD's success statement includes the API, while MVP scope lets the first client site launch without it | Separate them: MVP-2 success needs no API, and full product success needs MVP-3 | Applied to the PRD in this proposal |
| C2 | Q07 chooses Wilde Groei's elements "after discovery" in Phase 05, but full discovery task 07-01 follows implementation | Keep the 20-element baseline; review a preliminary content/element inventory before 05-02, with later additions requiring a scope change | Resolved for planning; full client discovery remains 07-01 |
| C3 | Phase 06 belonged to no milestone | Make it the exit of MVP-1 | Applied to MVP scope in this proposal |
| C4 | Responsive controls had no requirement ID | Place them in FR-07, keeping the existing IDs stable | Resolved for planning |
| C5 | PRD users and journey names did not match | Use the persona table above | Applied in this proposal |
| C6 | The task asks for stakeholder interviews and walkthroughs, and no independent interview evidence exists | Complete a delegated, document-based role walkthrough now; validate actual client needs in 07-01 | Planning walkthrough recorded below; independent interviews remain unclaimed |
| C7 | FR-03 required editor parity at MVP-0, before the editor exists | Check wizard/public parity at MVP-0 and editor parity at MVP-1 | Resolved for planning |
| C8 | Multisite was outside the first release but had no release target or task | Single-site v1.0.x; Multisite planned for v1.1 in task 09-06 | Resolved by owner instruction |

The roadmap's option to move the API earlier stays conditional and is not a conflict: it requires approved contracts and a dependency change, because 08-01 currently depends on 07-05. No proposal here changes a module or data contract, so no ADR is added.

## Journey walkthrough

On 2026-11-06 the delegated architecture review walked the planned journeys against the PRD, this register, and the roadmap. This is a **document review**, not a usability test or interview. The owner approved this planning method; client validation remains in 07-01.

| Role and journey | Planning result | Limit |
|---|---|---|
| Site builder (J1) | FR-01–03 and phases 02–03 cover child-theme setup, token validation, preview, and public output. | Implemented in phases 02 and 03 (setup wizard, validation, preview, rollback). 03-06 makes Base and child themes use the tokens visibly; editor parity waits for MVP-1. Phase 03 exit awaits 03-06 and owner acceptance. |
| Editor (J2) | FR-04–09 and FR-11 cover draft creation, edit, reordering, responsive controls, save, and reopen. | No editor or usability test exists. |
| Reviewer (J3) | FR-10 covers authenticated draft preview and negative access tests. | Q06 sets authenticated-only preview for MVP; external share links require a later scope decision. |
| Publisher (J4) | FR-09–10 and the PRD keep publish explicit; autosave and preview cannot publish. | WordPress role and capability behavior needs implementation tests. |
| Administrator/API consumer (J5) | FR-13 follows the first client site; the accepted design is read-only and authenticated by default. | Q10–Q11 are design decisions; phase 08 still needs implementation and tests. |

## Approval record

| Date | Reviewer | Scope reviewed | Decision | Evidence |
|---|---|---|---|---|
| 2026-11-06 | Michael ([@EmVeeNL](https://github.com/EmVeeNL)), via delegated architecture review | PRD, MVP scope, release gates, and the v1.1 Multisite target | Approved for planning after the corrections above | Owner task-conversation instruction authorizes the reviewer to approve, update, and merge PR #6 if the scope is acceptable; Multisite v1.1 is the owner's explicit decision |
