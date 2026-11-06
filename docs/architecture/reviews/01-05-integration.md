# 01-05 integration note

**Status: integration of three independent reviews, not owner approval.** The reviews cover [document schema and migrations](01-05-document.md), [tokens and rendering](01-05-tokens.md), and [API permissions and draft security](01-05-api.md). Each ran in its own worktree and branch. This note records what happened when their results met.

## Conflicts between the reviews

| Topic | Disagreement | Resolution | Proof |
|---|---|---|---|
| Rich text | The document contract refused any HTML prop; the renderer accepted `paragraph.html` through `wp_kses` | Plain text only in version 1, which matches the element specification. Removed from the renderer. Owner may overrule | Cross-contract test; `paragraph-html-prop-refused` case |
| `the_content` priority | The document proof hooked at 8; the tokens review showed 8 runs shortcodes in user text | Hook last, with a password guard | Document proof moved; WordPress tests rerun |
| Render cache key | Tokens keyed on a monotonic `documentRevision` that nothing provides; the document review measured revision IDs and `post_modified` as unreliable | Key on the stored document hash that the conflict token already computes | Goldens regenerated |
| Text escaping | The document proof used plain `esc_html`, which keeps entities; tokens showed that breaks preview parity | One rule: encode `&` first | Document proof changed; new check |
| `themeRef.tokensVersion` | Required by the document contract, undefined per the tokens review | Means the `BlixisThemeConfig` `schemaVersion` the page was authored against. A record only: rendering and caching do not read it | Cross-contract test |
| Live page saves | The document contract's `PUT` writes the live document; the API review showed that saving is then publishing | On a live page, `PUT` returns `409` and edits go to the autosave revision. Publish promotes them through the locked write | **Each half is proven separately, not as one path.** Task 04-02 owns the combined path |
| API ETag and tokens | The API review asked whether token changes must alter `html` | No: element HTML holds class names only, which the tokens review proved | Existing token test |
| Conflict codes | `VERSION_CONFLICT` in the API plan; `412` and `428` in the document contract | Editor routes use `If-Match` codes. The read-only API has no conflict code | Cross-contract test |

## A defect only the combination showed

**High, now fixed in the contract: a late renderer does not stop shortcodes in the projection.** The document review put user text into `post_content`. The tokens review moved the renderer after core's filters. Together, core's `do_shortcode` still runs over the projection first and discards only the result, so any page author's text could execute any registered shortcode, with its side effects, on each view, with or without the plugin.

Reproduce: `spikes/01-05-contracts/wordpress/run.sh document`, which prints `unescaped_projection_runs_shortcode_before_late_renderer=true`. The fix writes `[` and `]` as numeric entities in the projection. Checks confirm no shortcode runs with the renderer active or in fallback, the text still displays literally, and the entities stay inert after `wp_kses_post`.

## Decisions the owner must make

Nothing below is approved. The contracts assume the recommendation until the owner says otherwise.

| # | Decision | Recommendation |
|---|---|---|
| 1 | ADR-001 to ADR-007 status | Accept with the amendments in each ADR. ADR-008 stays Proposed |
| 2 | `post_content` holds a projection (ADR-003) | `core/html`, with brackets as entities |
| 3 | Page ownership (ADR-006, Q05) | Presence of the document; no mode field |
| 4 | Text props in version 1 | Plain text; inline marks later through a version bump |
| 5 | Nesting | Allow `section > container` and card with quote or video; remove `container > section` |
| 6 | Limits | 1 MiB, 2,000 nodes, depth 16. Set the revision cap after measuring real pages |
| 7 | Breakpoints and tokens | Fixed 40, 48, 64, 80rem with no `2xl`; hex colors and ASCII font names in version 1; rollback depth one |
| 8 | Token module and permission (Q04) | Inside Blocks; `edit_theme_options`; one JSON option plus export |
| 9 | Site Editor | Not a token source; it cannot change a Blixis token |
| 10 | Unknown elements | Render nothing publicly; diagnostics need `edit_post` |
| 11 | External review (Q06) | Authenticated only for MVP |
| 12 | API writes and access (Q10, Q11) | Read-only; authenticated by default |
| 13 | API exposure | No raw document in version 1; pages only; accept 60-second staleness in anonymous mode |
| 14 | API keys and quotas | Optional pepper constant with `wp_salt` fallback; counter table plus edge limits |
| 15 | Roles | No Blixis role gets `edit_published_pages` without `publish_pages` |
| 16 | `documentId` | Remove before version 1 ships; the API does not need it |

## Follow-up owners

Each open question has an owner and decision point in [Open questions](../OPEN_QUESTIONS.md). Michael owns the decisions above before 01-05 can be Done. Technical follow-ups were added to tasks 02-01, 03-05, 04-02, 05-01, 08-01, and 08-04.

## Applied and deferred edits

Applied here: architecture, API plan, configuration, security guidance, examples, ADR evidence, and roadmap requirements. Deferred to task 05-01, pending decision 5: the element specifications and their asymmetry fixtures. The 01-02 spike still registers its meta with the capability callback that the API review showed is unsafe; it is throwaway and never runs on a real site, so it stays as evidence.

## Remaining gaps

The combined save path above; real TLS, reverse proxies, CDNs, Apache, FPM, and persistent object caches; Multisite; 16 of 20 elements in the renderer; visual regression; Firefox and Safari for the Tailwind proofs; compiled utilities on a real WordPress page; load beyond eight writers; the real block editor interface. The individual notes list more.

## Results after integration

See the [task record](../../roadmap/phases/01-discovery-foundation/05-architecture-contracts.md). The individual review notes give each agent's own results; counts changed slightly here (the fixes above added document checks and removed token checks for the rich-text prop).
