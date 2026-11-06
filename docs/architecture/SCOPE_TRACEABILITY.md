# Scope and requirement traceability

**Status: Proposed. Not approved.** Task [01-01](../roadmap/phases/01-discovery-foundation/01-requirements-and-scope.md) prepared this from the repository documents only. No stakeholder interview or journey walkthrough has taken place, and everything here describes plans, not implemented features. The owner's decision is recorded in the [approval record](#approval-record) below and in the task file; until then, treat this page as a proposal.

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

The PRD groups requirements under ID ranges, with seven capabilities in FR-04–08 and five in FR-09–11. This register proposes one definition per ID and adds no new product scope. Responsive controls were in Journey 2, MVP-1, and task 05-06 but had no requirement ID; they are placed in FR-07. Michael ([@EmVeeNL](https://github.com/EmVeeNL)) is the owner of every row. Priority comes from the task files.

| ID | Requirement | Persona | Journey | Tasks | Milestone | Priority | Testable outcome |
|---|---|---|---|---|---|---|---|
| FR-01 | Stable, neutral Base parent theme | Site builder, developer | J1 | 02-01, 02-04, 02-05 | MVP-0 | P0 | Base installs without site branding and its templates pass landmark and keyboard checks |
| FR-02 | Configurable child theme | Site builder | J1 | 03-01, 03-03 | MVP-0 | P0 | The wizard produces an installable child theme and never writes to the parent |
| FR-03 | Validated tokens and Tailwind CSS v4 | Site builder | J1 | 02-02, 02-03, 03-02, 03-04, 03-05 | MVP-0 | P0 | Invalid tokens are rejected on server and client; valid tokens match in editor, preview, and public page, and can be rolled back |
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

**Tasks without a requirement of their own:** 01-01 to 01-05 are foundation work. 06-02 to 06-05 carry the nonfunctional requirements and release gates. 09-03 and 09-05 are exploration with no product commitment.

## Milestones and phases

The four [MVP milestones](../roadmap/MVP.md) did not cover Phases 01, 06, or 09. This is the proposed mapping.

| Milestone | Phases | Requirements | Exit task |
|---|---|---|---|
| Prerequisite | 01 | Foundation | 01-05 |
| MVP-0 | 02, 03 | FR-01–03 | 03-05 |
| MVP-1 | 04, 05, 06 | FR-04–11 | 06-05 |
| MVP-2 | 07 | FR-12 | 07-05 |
| MVP-3 | 08 | FR-13 | 08-05 |
| After MVP | 09 | FR-14–16 | None |

## Wilde Groei before and after launch

No client discovery has happened, so this list comes from documents and must be checked with the client in task 07-01.

- **Needed before launch:** FR-01–12, the elements the approved pages use, SEO metadata, forms, consent, legal content, backup and restore, staging approval, monitoring, and editor training.
- **Can follow launch:** FR-13 (Content API), FR-14–16, and tasks 09-03 and 09-05.
- **First to shrink if needed:** element variations and advanced controls, as [MVP scope](../roadmap/MVP.md) already says. Security, recovery, and accessible operation are not reduced.

## Proposed release gates

[MVP scope](../roadmap/MVP.md) lists release gates as one group. This table assigns each gate to a milestone. Performance budgets are [unmeasured targets](../security/SECURITY_AND_PERFORMANCE.md), so the MVP-1 gate is a repeatable measurement against an owner-accepted budget rather than a claim that today's targets are met.

| Milestone | Gate |
|---|---|
| MVP-0 | Server and client token validation; parent source protected; keyboard-operable wizard; token rollback; semantic templates |
| MVP-1 | Server and editor schema validation; permission tests; draft isolation; keyboard interaction; WCAG review; backup and restore; documented migrations; repeatable performance measurements; security audit; integration regression |
| MVP-2 | Client approval on staging; public-page accessibility review; consent and legal content reviewed; verified backup and restore; editor training complete |
| MVP-3 | Key revocation and scope tests; draft and protected-meta isolation; rate limits and CORS allowlist; published API documentation and rollback runbook |

## Conflicts found

| # | Conflict | Proposed resolution | State |
|---|---|---|---|
| C1 | The PRD's success statement includes the API, while MVP scope lets the first client site launch without it | Separate them: MVP-2 success needs no API, and full product success needs MVP-3 | Applied to the PRD in this proposal |
| C2 | Q07 chooses Wilde Groei's elements "after discovery" in Phase 05, but discovery task 07-01 depends on 06-05 and MVP scope already fixes 20 elements | Keep the 20-element set as the default; the owner confirms it before 05-02, and gaps found in 07-01 are handled as additions | Awaiting owner decision (Q07) |
| C3 | Phase 06 belonged to no milestone | Make it the exit of MVP-1 | Applied to MVP scope in this proposal |
| C4 | Responsive controls had no requirement ID | Place them in FR-07, keeping FR-01–16 stable | Awaiting owner decision |
| C5 | PRD users and journey names did not match | Use the persona table above | Applied in this proposal |
| C6 | The task asks for stakeholder interviews and walkthroughs, and no evidence of any exists | The owner decides who takes part; nothing is recorded until it happens | Awaiting owner decision |

The roadmap's option to move the API earlier stays conditional and is not a conflict: it requires approved contracts and a dependency change, because 08-01 currently depends on 07-05. No proposal here changes a module or data contract, so no ADR is added.

## Journey walkthrough

Use this during owner or stakeholder review. Each step is checked against the documents because the features do not exist yet. Record who took part, objections, and the outcome in the task history and PR.

1. **Editor (J2):** can every step from draft to reopen be traced to FR-04–09 and FR-11?
2. **Reviewer (J3):** are the authenticated-only preview and the deferral of external links (Q06) acceptable for MVP-1?
3. **Publisher (J4):** is publishing explicit, and is it acceptable that autosave and preview never publish?
4. **API (J5):** is launching Wilde Groei without the API acceptable, with read-only and authenticated defaults (Q10, Q11)?

## Approval record

| Date | Reviewer | Scope reviewed | Decision | Evidence |
|---|---|---|---|---|
| Not yet recorded | Michael ([@EmVeeNL](https://github.com/EmVeeNL)) | PRD, MVP scope, release gates | Pending | None |
