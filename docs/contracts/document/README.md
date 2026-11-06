# Document contract v1

**Status: accepted design baseline from task [01-05](../../roadmap/phases/01-discovery-foundation/05-architecture-contracts.md); not implemented in product code.** Delegated owner review accepted this v1 envelope, including the non-authoritative `documentId`. The reference validators are throwaway proofs in [`spikes/01-05-contracts/document`](../../../spikes/01-05-contracts/document/). The evidence is in the [review note](../../architecture/reviews/01-05-document.md).

## What is here

| Path | Purpose |
|---|---|
| [`v1/document.schema.json`](v1/document.schema.json) | JSON Schema (2020-12) for the structural envelope only |
| [`v1/element-props.json`](v1/element-props.json) | Accepted v1 prop baseline. The element specs do not state these yet; task 05-01 must align them before product validation can enforce `unknownProps: reject` |
| [`v1/valid/`](v1/valid/) | Documents every validator must accept. `generated.json` describes boundary documents too large to commit |
| [`v1/invalid/`](v1/invalid/) | Documents every validator must refuse. [`expected.json`](v1/invalid/expected.json) states each one's exact error codes, status, and reason. `.txt` files hold input that CI could not parse as JSON |
| [`migrations/`](migrations/) | Golden migrations and preservation pairs, stated in [`expected.json`](migrations/expected.json). Schema v2 in these fixtures is hypothetical and is not a planned format |

## Ownership

| Data | Owner | Rule |
|---|---|---|
| Title, slug, status, author, dates, excerpt, password, parent, template | WordPress | The document cannot carry them. Those top-level keys fail with `wp_owned_field`. A document save never changes them |
| `_blixis_document` post meta | Blixis Blocks | Raw JSON bytes. Protected, revisioned, `show_in_rest: false`, `auth_callback` false, written only by the guarded route |
| `post_content` | Blixis Blocks, derived | A non-authoritative projection. See below |
| `_blixis_content_hash` post meta | Blixis Blocks | SHA-256 of the stored `post_content`, revisioned, used to detect edits made outside Blixis |
| `themeRef` | Document, as a record | Records the theme and the `BlixisThemeConfig` `schemaVersion` the page was authored against. It does not select the theme, and neither rendering nor caching reads it |
| `documentId` | Document, as a record | Required in v1 but opaque and non-authoritative. A duplicated page repeats it, so it is never used for lookup, uniqueness, or authorization. The post ID is the identity |

### `post_content`

Each save writes the document's text and semantic HTML into `post_content` as a single `core/html` block:

```html
<!-- wp:html -->
<section><h2>Heading</h2><p>Text</p></section>
<!-- /wp:html -->
```

Write `[` and `]` in the block as `&#91;` and `&#93;`. Core runs `do_shortcode` over `post_content` before any later filter, so user text would otherwise execute shortcodes even when the renderer discards the result.

The document stays authoritative. With the plugin active, public pages render from the document. With the plugin off, or when the document cannot be read, WordPress serves this projection. Hidden nodes and unknown nodes stay out of it. It is written in the same transaction as the document, so each revision holds a matching pair.

Ownership of a page follows the document: a page with `_blixis_document` belongs to Blixis. Core REST writes to `content` on such a page get `409 blixis_owned`, and the block editor is off for it. Writes that bypass REST are detected through the hash. Handing a page to the block editor is an explicit conversion that keeps the projection as editable content.

## Document shape

```json
{
  "schemaVersion": 1,
  "documentId": "opaque-id",
  "root": ["s"],
  "nodes": {
    "s": { "id": "s", "type": "blixis/section", "version": 1, "props": {}, "children": ["h"] },
    "h": {
      "id": "h",
      "type": "blixis/heading",
      "version": 1,
      "props": { "text": "Hello", "level": 2 },
      "responsive": { "md": { "align": "center" } },
      "children": [],
      "locked": false
    }
  },
  "themeRef": { "theme": "blixis-base", "tokensVersion": 1 }
}
```

The top-level and node envelopes are closed. `responsive` and `locked` are optional. Breakpoints are `sm`, `md`, `lg`, and `xl`.

## Limits

| Limit | Value | Code |
|---|---|---|
| Document size | 1,048,576 bytes | `document_too_large` |
| JSON nesting, checked before decoding | 32 | `json_nesting_exceeded` |
| Nodes | 2,000 | `too_many_nodes` |
| Node depth, root is 1 | 16 | `depth_exceeded` |
| One string | 65,536 UTF-8 bytes | `string_too_long` |
| One URL | 2,048 UTF-8 bytes | `unsafe_url` |
| Items in a list prop | 200 | `invalid_prop_value` |

## Validation result

A validator takes raw bytes and, on the write path, the stored bytes. It returns `status`, every `codes` value, `errors` capped at 100 and sorted by path then code as UTF-8 bytes, `truncated`, and `preserved`.

| Status | Meaning | Write path | Read path |
|---|---|---|---|
| `valid` | Fully understood, or unknown nodes unchanged from storage | Store | Render from the document |
| `preserve` | Only `unsupported_schema_version`, `unsupported_element_version`, or `unknown_element_type` | Refuse | Do not touch the bytes. See below |
| `rejected` | Anything else | Refuse with `422` | Serve the projection. Never delete |

On read, a future `schemaVersion` falls back to the projection. An unknown node renders as nothing while its siblings render. A write may carry an unknown node only if it is deeply equal to the stored one, so a request cannot introduce unknown content that a later plugin version would then render.

### Error codes

Decoding: `document_too_large`, `json_nesting_exceeded`, `invalid_json`, `duplicate_key`, `not_object`.

Envelope: `missing_field`, `invalid_schema_version`, `unsupported_schema_version`, `wp_owned_field`, `unknown_top_level_field`, `invalid_document_id`, `invalid_theme_ref`, `invalid_root`, `invalid_nodes`, `too_many_nodes`.

Nodes: `invalid_node`, `invalid_node_id`, `id_key_mismatch`, `unknown_node_field`, `invalid_node_field`, `invalid_type`, `invalid_version`, `unknown_element_type`, `unsupported_element_version`, `invalid_children`.

Graph: `missing_reference`, `duplicate_root`, `multiple_parents`, `cycle`, `orphan_node`, `depth_exceeded`, `invalid_nesting`.

Props: `non_object_props`, `forbidden_key`, `forbidden_prop`, `unknown_prop`, `invalid_prop_value`, `string_too_long`, `html_in_text`, `unsafe_url`, `invalid_responsive`, `unknown_breakpoint`, `unknown_responsive_prop`.

Migration: `migration_failed`, `no_migration_path`, plus `unsupported_schema_version` and `invalid_schema_version`.

### Rules a JSON Schema cannot state

- **Nesting:** an edge is legal only when the parent lists the child in `allowedChildren` **and** the child lists the parent in `allowedParents`. A root node needs `root` in `allowedParents`.
- **Text props** are plain text, escaped at output. Tag-shaped text fails with `html_in_text`. This is defense in depth, not the escaping itself. `a<b` and `5 > 3` are legal; `a <b c> d` is refused, a known false positive.
- **URLs:** `http`, `https`, `mailto`, `tel`, a leading `/`, `#`, or `?`, or a bare relative path with no `:` before its first `/` or `?`. Control characters, spaces, backslashes, and `//` are refused. The renderer still calls `esc_url`.
- **Prototype keys** `__proto__`, `constructor`, and `prototype` fail anywhere with `forbidden_key`.
- **Forbidden prop names** such as `html`, `style`, `className`, and `on*` fail with `forbidden_prop` unless the element declares that name. `blixis/divider` declares `style` as an enum.

### Decoding rules for implementers

Store the bytes you validated and never re-encode them. These rules exist because TypeScript and PHP disagree by default, and each has a fixture:

- PHP decodes to `stdClass`. Associative decoding turns `{}` into `[]`.
- Node ids start with a letter. JavaScript reorders integer-like keys, and PHP turns them into integers.
- Lone surrogates, NUL-leading keys, and a byte order mark are `invalid_json` in both.
- Duplicate keys are refused rather than resolved as last-wins.
- `2.0` counts as the integer 2 in both.
- Sizes count UTF-8 bytes.

## Versioning

| | `schemaVersion` | Node `version` |
|---|---|---|
| **Covers** | Envelope, node envelope, graph rules, breakpoints, limits | The props of one element type |
| **Bump when** | A field is added or removed, because envelopes are closed; a meaning changes; a rule tightens so stored documents could fail | A prop of that element is added, removed, renamed, or changes type or meaning |
| **Do not bump for** | A new element type; a new prop on one element | A renderer or style change that keeps the props |
| **Migrates through** | A pure document step | A pure element step, independent of the document step |

A document step treats `props` as opaque, so an unknown node passes through unchanged. A prop-only change never touches `schemaVersion`.

## Migration boundary

1. A step is a pure function of the decoded document. Golden fixtures, frozen input, and idempotence tests hold it to that.
2. The read path migrates in memory and writes nothing.
3. Storage changes only through the guarded write, which creates a revision holding the old bytes.
4. A failed step yields a code and no output, and stored data stays as it was.
5. Rollback is by revision. A build that meets a newer document serves the projection and refuses to write until a compatible build returns or an older revision is restored. A reverse migration is not promised, because a later step may be lossy.
6. Export is `{format, exportVersion, raw, sha256}`. Import verifies the hash and then uses the guarded write. Core WXR export also carries the document byte-exact; import through the WordPress importer is untested.

## Conflict token and write

The token is `"sha256:<hex>"` over the stored document bytes, sent as `ETag` and required as `If-Match`.

| Case | Response |
|---|---|
| No `If-Match` | `428 precondition_required` |
| Token does not match, or the writer lost a race | `412 version_conflict` |
| Stored document is newer than this build | `409 stored_document_unsupported` |
| Invalid document | `422 invalid_document` with `errors` |

A token check alone is not enough. The write opens a transaction, locks the post row with `SELECT ... FOR UPDATE`, re-reads the meta rows, compares, writes the document, projection, and hash, and commits. Comparing `meta_value` by `=` is also not enough, because the column collation ignores case.

Autosave writes only to the user's autosave revision row. It validates, and it never changes the post, its status, or the live document. On a live page, a direct save returns `409` and goes there as well; an explicit publish promotes it through the write above. See the [integration note](../../architecture/reviews/01-05-integration.md).

## Renderer obligations found by this review

- Validate on every read. Restoring a revision does not go through the write path.
- Hook `the_content` after every core filter, and honor `post_password_required()` before replacing it. Without that check the document text reaches anonymous readers.
- Use the same text escaping as the [renderer contract](../tokens/README.md#renderer).
- Refuse any `tag` value outside the element's enum, even after validation.

## Reproduce

From `spikes/01-05-contracts`:

```bash
npx -y pnpm@12.18.0 run test             # TypeScript fixtures, plus PHP parity when php is on PATH
npx -y pnpm@12.18.0 run typecheck
wordpress/run.sh document 7.1.4 8.4      # real WordPress in a disposable stack
wordpress/run.sh document 7.0.8 8.5
```

After changing a fixture, run `node document/fixtures.ts` and `npx -y pnpm@12.18.0 exec oxfmt --write document` to rebuild the bundle the PHP side reads. A test fails if the bundle drifts.
