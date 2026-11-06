# 01-05 review: document schema and migrations

**Integrated later:** this note records the review as it ran. Where the [integration note](01-05-integration.md) differs, the integration note wins.

**Status: independent review, not owner approval.** Every ADR status and shared-document edit below is a recommendation. The contract it proposes is in [`docs/contracts/document`](../../contracts/document/README.md); the proofs are in [`spikes/01-05-contracts/document`](../../../spikes/01-05-contracts/document/).

## Scope

Reviewed ownership of WordPress fields and `post_content`; graph validation in TypeScript and PHP; versioning, migration, rollback, and preservation; storage, revisions, conflict detection, and autosave on real WordPress. Tokens and the Content API belong to the other reviewers. The renderer here is only enough to test `post_content`.

## Summary

The plan's core holds up: a versioned graph in protected post meta works, byte-exact, on every tested combination. **The plan is wrong or silent in four places that would have shipped defects:**

1. It never says what `post_content` holds. Left empty, search fails even with the plugin active.
2. Its conflict detection, a token check before a write, loses updates under real concurrency, and the obvious fix still corrupts first writes.
3. Its element specs have no prop types, so the required `unknownProps: reject` cannot be enforced from them.
4. Its own sample document fails its own element spec.

## Findings

Reproduction for each: run the commands under [Results](#results). `OBSERVE` lines are in the `run.sh` output.

### High

**D1. An empty `post_content` loses content, and search fails even with the plugin on.** The plan does not define `post_content`. Measured over real HTTP against a block theme (WordPress 7.1.4, all four combinations identical):

| Strategy | Search, plugin on | Page, off | Search, off | Excerpt, off | Feed, off | `parse_blocks` first block |
|---|---|---|---|---|---|---|
| Empty | **No** | **No** | **No** | **No** | **No** | none |
| Plain text | Yes | Yes | Yes | Yes | Yes | none |
| Semantic HTML | Yes | Yes | Yes | Yes | Yes | none |
| Custom `blixis/document` block | Yes | Yes | Yes | **No** | Yes | `blixis/document` |
| **`core/html` block (recommended)** | Yes | Yes | Yes | Yes | Yes | `core/html` |

The custom block loses its excerpt once unregistered, which rules out the option I expected to prefer. Plain text and bare HTML also survive. I prefer `core/html` over them because it keeps structure and is a delimited block, where bare HTML would parse as freeform content. How each one looks in the real block editor was not tested.

*Costs of the recommendation:* the projection goes stale until the next save if the renderer changes, and it duplicates the document's text in the database. A future bulk re-projection is required when renderer output changes.

**D2. Check-then-write loses updates; a compare-and-swap still corrupts first writes.** Eight concurrent `PUT`s with the same token against four separate PHP processes sharing one database (`concurrent_8_*`):

| Write method | Updates: 200 / 412 | First writes: 200 / 412 | `single` meta rows after first writes |
|---|---|---|---|
| Token check, then `update_post_meta` | **4 / 4** | **4 / 4** | **3 to 4** |
| `UPDATE ... WHERE SHA2(meta_value) = token` | 1 / 7 | **2 to 4 winners** | **2 to 4**, and they remain after a later save |
| Lock post row, re-read, compare, write (proposed) | 1 / 7 | 1 / 7 | 1 |

A 300 ms delay was added between check and write to widen the window. Ranges vary with timing across the final four runs; the proposed write gave 1 / 7 and one row in every run. `add_post_meta(..., unique: true)` is not atomic. The proposed write also rolls back document, `post_content`, and revision together when a failure is injected before commit. Not built: a repair for a page that already has duplicate rows; the proposed write answers 412 for it indefinitely.

**D3. The element specs cannot be enforced.** `docs/elements/*.json` give defaults and responsive names, but no types. A server cannot tell which props are URLs, and `validation.urls` and `unknownProps` have nothing to apply to. Two specific hazards follow:
- `blixis/section` has a `tag` prop that becomes an element name, with no enum (`section-tag-script.json`).
- `blixis/divider` has a `style` prop, which collides with the rule against style props.

[`element-props.json`](../../contracts/document/v1/element-props.json) proposes the missing table, and every spec default validates against it.

**D4. Renderer password leak.** A renderer that replaces `the_content` shows the document to anonymous readers of a password-protected post, because core's password form arrives as the filter's input and is discarded (`renderer_without_password_guard_leaks_document=true`). With a guard, the page, feed, core REST, and anonymous `WP_Query` search do not expose it. Task 04 needs this as a test.

**D5. Restoring a revision bypasses every write check, and can go live at once.** Core's restore never runs the validator. Restoring an autosave on a published page made its content live immediately (`restoring_an_autosave_on_a_published_page_goes_live_immediately=true`). Restoring a revision from before the first Blixis save **deletes the live document** (`restore_of_pre_blixis_revision_deletes_live_document=true`); it stays recoverable from the revision that holds it. Hence: validate on every read (tested: a directly written invalid document never renders), and treat restore as publication in the editor's UX.

### Medium

**D6. The sample document violates its own spec.** `docs/examples/content-document.json` places `blixis/heading` at root, and `heading.json` does not allow `root`. It fails with `invalid_nesting`. It also references `blixis-starter`, which does not exist in the repository (`theme-config.json` uses the same slug).

**D7. Nesting declarations disagree in four places.** `section > container` and `container > section` are declared by the parent only: container and section both allow only `root` as a parent. `card > quote` and `card > video` are declared by the child only. The contract requires both sides to agree, so all four are refused today. Under that rule the longest legal chain is 5 nodes, so the depth limit guards hostile input and future elements, not current content. No cycle is currently legal.

**D8. HTML policy contradiction.** Every spec says `validation.html: "sanitize"`; `ELEMENTS.md` says reject arbitrary HTML. The contract rejects, since text props are plain and no spec declares a rich-text prop. The tag check is a heuristic with one known false positive, `a <b c> d`, which the editor must explain to the user. Escaping remains the real control.

**D9. "schemaVersion" means three things.** Document format; theme config format (`theme-config.json`); and, in `element-manifest.example.ts`, a field on an element where the specs say `specVersion`. Rename the manifest's field to `specVersion`.

**D10. Weak conflict tokens, measured.** `post_modified` missed a direct meta write and collided within one second. The latest revision ID did not change with revisions off. `meta_value = %s` treats case-only edits as equal. A hash of the stored bytes has none of these problems; its only blind spot is an identical rewrite, which is not a conflict. It does not cover WordPress fields, which keep their own routes. `API.md` lists `VERSION_CONFLICT (409)` for the read-only Content API; the editor route here uses 412 and 428 because `If-Match` is the mechanism. The two should not be merged.

**D11. Lock and visibility have no storage.** All specs declare `supports.lock` and `supports.visibility`, and some list `visibility` under responsive fields, but no document field exists. With a closed envelope, adding one later costs a schema bump, so v1 adds optional `locked` and treats `visibility` as a boolean prop. Hidden nodes stay out of `post_content` (tested).

**D12. Storage cost is unbounded.** `wp_revisions_to_keep` defaults to unlimited (-1), and each revision copies the document: 100 saves of a 1 MiB document is about 100 MiB. A `WP_Query` for 20 posts with 256 KiB documents raised memory use by 14.7 MiB in one run, against 5 MiB of documents. There is no clean baseline, because the comparison run without the meta cache started by releasing that memory. Every archive query loads whole documents unless `update_post_meta_cache` is off. Cap revisions for owned pages and measure with real content before setting budgets.

**D13. Core autosave traps.** `wp_create_post_autosave` returned 0 on its second call when the post fields had not changed, so a document-only autosave would be dropped. The proof writes the revision row directly. The core `/autosaves` route defines `DOING_AUTOSAVE`, which stops revisions for the rest of the process, and it still accepted `content` on an owned page (200). It left the live document and content untouched, but the 409 lock does not cover that route.

### Low

**D14. TypeScript and PHP disagree by default on eight inputs:** `{}` under associative decoding, integer-like keys, lone surrogates, NUL-leading keys, a byte order mark, `2.0`, string length units, and duplicate keys. Each has a fixture, and the contract fixes the behavior. This is why bytes must be stored rather than re-encoded (`assoc_reencode_turns_empty_props_into_array`).

**D15. Example drift.** `element-manifest.example.ts` differs from `heading.json`: default props, `allowedParents` (no card or cta), responsive fields, tab casing. Spec defaults are Dutch while the example is English, which also bears on a neutral parent.

**D16. `documentId` is redundant.** The post ID is the identity and a duplicated page repeats `documentId`. The contract keeps it as an opaque record only. Removing it now is cheaper than later.

**D17. Migrations in two languages double the risk.** Goldens run identically in both here, but the product should run migrations in PHP only and send the editor already-migrated documents. Element migrations in TypeScript would need the same goldens.

## Confirmed from 01-02, not repeated at length

Byte-exact storage through `wp_slash`, unslashed writes corrupting JSON, `show_in_rest` exposure, meta-only revisions, and core REST denials. New coverage adds real fixtures, `auth_callback` false, and 1 MiB limit documents.

## Results

All on 2026-11-06, macOS arm64, Docker, Node 26.13.0, PHP 8.4.27 locally, MariaDB 11.4.13.

| Command, from `spikes/01-05-contracts` | Result |
|---|---|
| `npx -y pnpm@12.18.0 run test` | 171 pass, 0 fail, including TypeScript and PHP results compared byte for byte |
| `npx -y pnpm@12.18.0 run typecheck` | Pass |
| `npx -y pnpm@12.18.0 run lint` | Pass |
| `npx -y pnpm@12.18.0 run format:check` | Pass |
| `php -l` on 7 PHP files | Pass |
| `wordpress/run.sh document 7.1.4 8.4` | pass=312 fail=0 |
| `wordpress/run.sh document 7.0.8 8.5` | pass=312 fail=0 |
| `wordpress/run.sh document 7.1.4 8.3` | pass=312 fail=0 |
| `wordpress/run.sh document 7.0.8 8.3` | pass=312 fail=0 |

- **Fixtures:** 142 checks, all producing the stated codes: 16 valid documents (7 generated), 91 invalid (9 generated), 4 preservation pairs, 25 URL cases, and 6 migrations. In WordPress these run alongside 170 storage, revision, conflict, autosave, and HTTP checks.
- **Parity:** the result digest `8e0ca43e...106fa6` is identical from TypeScript, local PHP 8.4, and PHP 8.3, 8.4, and 8.5 in the containers.
- **Mutation check, one-off, not committed:** 22 deliberate defects in the validators and migrators (dropped cycle, orphan, parent, URL, duplicate-key, BOM, and preservation checks; associative decoding). All 22 failed the tests.
- **JSON Schema:** checked with the repository's small evaluator and, once, with Python `jsonschema` 4.26.0, with 0 disagreements. Nine semantic fixtures pass the schema by design and fail only in the validators.
- **Timing:** PHP validation took 22 ms for 2,000 nodes and 85 ms for 1 MiB of padding in the container.

### Failures during the review

Reported because they changed the design or the tests:

- My first text rule refused `a<b 5 > 3`, and my first URL rule allowed `&#106;avascript:alert(1)`. The fixtures caught both, and both were fixed.
- My first proposed write was the SHA2 swap. D2 came from measuring it.
- Two WordPress checks failed because of test faults, not product behavior. A core autosave call in-process set `DOING_AUTOSAVE` and stopped later revisions (now over HTTP, and noted in D13). A search check matched a theme block that lists recent posts on the no-results page (now checked against `WP_Query`, with a control page).

## Gaps

Not tested:

- The real block editor UI, the Classic Editor, or XML-RPC. Only the `use_block_editor_for_post` filter, core REST, and `edit_post_meta` were exercised.
- Import through the WordPress importer; WXR export only.
- Persistent object caches, including any per-item size limit on the meta cache.
- Multisite, which is planned for v1.1.
- Load beyond eight writers, deadlocks at scale, and non-transactional table engines.
- SEO or search plugins that read `post_content` or `the_content`.
- Interaction of the renderer with `wpautop` and later `the_content` filters. The proof filters at priority 8.
- Images in the projection. The proof emits none.
- Bulk migration at scale, or a re-projection job.
- Whether token values exist in the active theme. The validator checks shape only.
- Converting existing block content **into** a Blixis document. Only the Blixis-to-block-editor direction exists.
- Accessibility rules such as required `alt`, which the spec declares and the validator does not enforce. These likely belong at publish time.

## ADR recommendations

### ADR-003: recommend **Accepted, with amendments**, after owner review

*Evidence:* all sections above. *Amendments:* `post_content` projection; raw byte storage; the write procedure in D2; validation on every read; `auth_callback` false; revision cap; two-axis versioning; PHP as the sole migration runtime.

| Alternative | Why not |
|---|---|
| HTML blob as sole storage | No stable editing model, and it cannot express element versions or preservation |
| Native blocks as sole storage | Not tested here; this is reasoning only. Attributes and structure would live in `post_content`, where kses and other editors can rewrite them, and block markup has no place for unknown-version preservation |
| Custom table | Solves D12 and locking, but loses core revisions, WXR, and restore, which all passed here. Revisit only if D12 measurements demand it |

*Consequences:* a second copy of text in `post_content`; revision growth to manage; a re-projection job whenever renderer output changes; two validators to keep in step if the editor validates locally too.

### ADR-006: recommend **Accepted, with one amendment**, after owner review; closes Q05 if the owner agrees

*Amendment:* derive ownership from the presence of `_blixis_document` rather than recording a separate editor mode. Restoring a pre-Blixis revision removes the document and so returns the page to the block editor, correctly and with no second field to fall out of step (tested). A separate mode field would need revisioning to stay correct, and could then still disagree.

| Alternative | Why not |
|---|---|
| Both editors write `post_content` | Silent divergence, measured: core and programmatic writes change only the projection |
| Separate revisioned mode field | Works, but adds a state that can contradict the document |
| Block editor edits the projection and syncs back | Requires parsing HTML into the graph, with loss |

*Consequences:* a 409 lock on core REST content writes; a hash to detect writes that bypass it, including edits made while the plugin is off (tested); an explicit conversion UX, with restore as the undo. Import from existing block content remains unbuilt, and Q12 (other themes) is unaffected.

## Proposed edits to shared documents

For the integrator. None have been applied.

**`docs/architecture/ARCHITECTURE.md`**, in "Document and rendering contract", after "publication date.": add:

> `post_content` holds a derived, non-authoritative projection of the document as one `core/html` block, written in the same transaction, so search, excerpts, feeds, and plugin deactivation keep working. The document is authoritative. A page with a document belongs to Blixis. See the document contract in `docs/contracts/document/README.md`, linked relative to this file.

In the same section, replace "Unknown versions must preserve stored content and fail safely." with:

> Unknown versions must preserve stored bytes: a future `schemaVersion` serves the projection and refuses writes; an unknown node renders as nothing, and a write may carry it only unchanged. Validate on every read, because revision restore bypasses the write path.

In "Editor and publication", replace "conflict detection against a revision or ETag" with:

> conflict detection through an `If-Match` hash of the stored document, re-checked under a post-row lock in the write transaction

**`docs/architecture/decisions/ADR-003-versioned-content-schema.md` and `ADR-006-editor-and-gutenberg.md`:** apply the amendments above, once the owner decides.

**`docs/architecture/DECISIONS.md` and `OPEN_QUESTIONS.md`:** update the 003 and 006 rows and Q05 with the owner's decision.

**`docs/examples/content-document.json`:** wrap the heading in a section, as in [`section-heading.json`](../../contracts/document/v1/valid/section-heading.json), and use `blixis-base` until a starter theme exists. The spike test accepts the fixed file. Then delete `shipped-sample-root-heading.json` and its manifest entry.

**`docs/examples/element-manifest.example.ts`:** rename `schemaVersion` to `specVersion`, and match `heading.json`.

**`docs/elements/*.json`** (task 05-01, once the owner rules on nesting):
- Merge `element-props.json` into the specs.
- Change `validation.html` to `reject`.
- Replace `maxDepth: "server-policy"` with 16 or a reference to the contract.
- `container.json`: `allowedParents` becomes `["root", "blixis/section"]`; remove `blixis/section` from its `allowedChildren`.
- `card.json`: add `blixis/quote` and `blixis/video` to `allowedChildren`.
- `divider.json`: rename `style` to `lineStyle`.

After a nesting change, update the two `nesting-*-asymmetry` fixtures and the spike's asymmetry and depth tests. The longest legal chain becomes 6.

**`docs/architecture/ELEMENTS.md`:** add a link to the contract.

**`docs/security/SECURITY_AND_PERFORMANCE.md`:** add the limits table, the password rule (D4), and the restore rule (D5).

## Decisions only the owner can make

| Decision | Recommendation |
|---|---|
| `post_content` strategy | `core/html` projection |
| Ownership signal (ADR-006) | Presence of the document, no separate mode |
| Nesting: does `section > container` exist? May a card hold a quote and a video? | Yes to both, as in the edits above. `container > section` should go, because it would make nesting recursive |
| Text props in v1 | Plain text only. Inline formatting later, as structured marks, through an element version bump |
| Limits | 1 MiB, 2,000 nodes, depth 16, then revisit with real pages |
| Revision cap for owned pages | Pick a number after D12 is measured on real content; 25 is a starting proposal, not a measured value |
| `locked` and `visibility` storage | As in the contract |
| Keep `documentId` | Remove it before v1 ships, unless the Content API needs it |
