# Content API contract v1.0

**Status: accepted design baseline from task 01-05.** No product API exists; phase 08 implements this contract. The WordPress [proofs](../../../spikes/01-05-contracts/api/README.md) exercised the request rules. A dedicated production pepper is an approved implementation requirement that the proof did not test; see below. The reasoning is in the [review note](../../architecture/reviews/01-05-api.md).

| File | Purpose |
|---|---|
| [`authz-matrix.json`](authz-matrix.json) | Negative authorization cases. The WordPress test run consumes it over real HTTP. |
| [`cache-policy.json`](cache-policy.json) | Exact caching headers per response class. |
| [`examples/`](examples/) | The v1 body for each route. Error bodies are in [`examples/errors/`](examples/errors/). |

## Routes

Namespace `blixis/v1`. Read-only. Accepts `GET`, `HEAD`, and `OPTIONS`.

| Route | Access | Allowed query | Example |
|---|---|---|---|
| `/content` | Key, or anonymous mode | `page`, `per_page` (1–50, default 20), `slug` | [`content-list.json`](examples/content-list.json) |
| `/content/{id}` | Key, or anonymous mode | None | [`content-item.json`](examples/content-item.json) |
| `/schema` | Public | None | [`schema.json`](examples/schema.json) |
| `/health` | Public | None | [`health.json`](examples/health.json) |

`{id}` is a canonical positive integer. `007` and `abc` do not match it and get `NOT_FOUND`.

Editor routes and key administration live in their own namespaces, `blixis-editor/v1` (owned by Blocks) and `blixis-admin/v1` (owned by the API module). They are not part of this public contract, but the matrix covers their negative cases.

## Visibility

A response may contain only a post that meets all of these at the moment of the request:

- `post_status` is exactly `publish`.
- `post_password` is empty.
- `post_type` is on the allowlist, which is `page` in v1, and is publicly viewable.

Everything else is `NOT_FOUND`, with the same status, headers, and body as an ID that never existed. Those cases are draft, pending, future, private, trash, auto-draft, password-protected, unpublished after publication, revisions, attachments, non-public types, and other post types.

No WordPress credential changes this. A cookie, a nonce, or an application password on these routes is ignored, and rendering always runs logged out. Rules a consumer can rely on:

- Item fields are exactly `item_fields` in the schema. There is no author, email, meta, or raw document. The raw `_blixis_document` is not part of v1.
- `link` is the WordPress permalink, so a published child of an unpublished parent discloses the parent's slug. WordPress's public URL does the same.
- Unknown query parameters get `INVALID_QUERY`. That includes `status`, `context`, `_fields`, `include`, `password`, `_envelope`, `_jsonp`, `_embed`, and `_method`.

## Authentication

- Credential: `Authorization: Bearer <key>`. A key in a query string or cookie is not read.
- Format: `bxk_<16 hex key ID>_<43 base64url secret>`, from 32 CSPRNG bytes. Shown once at creation.
- Storage: key ID, HMAC-SHA-256 of the secret, hash version, scopes, created, expires, revoked, replaced-by. Never the secret.
- Production key hashing requires a dedicated high-entropy `BLIXIS_API_KEY_PEPPER` supplied through server configuration outside the database and repository. Without it, key issuance and validation fail closed. A `wp_salt()` fallback is not accepted for production because the salt can reside in the same database as the hashes. Task 08-01 must test provisioning, loss, and rotation; the 01-05 proof used the fallback only to exercise HMAC behavior.
- Scope: `read:published`.
- A key identifies a client. It never sets a WordPress user, so it opens no `/wp/v2` route, editor route, or key administration.
- Keyed mode is the default. Anonymous mode needs explicit configuration, and it only removes the need for a key: visibility is unchanged. A key presented in anonymous mode is still validated.
- Rotation replaces a key at once. For overlap, create a second key and revoke the first later.
- Logs may contain the stored key ID and an outcome. They never contain presented input, a secret, or a hash.

## HTTPS and proxies

A key is accepted only when `is_ssl()` is true, or when the direct peer is on a configured trusted-proxy list and sends `X-Forwarded-Proto: https`. From any other peer, forwarded headers count for nothing. Otherwise the response is `HTTPS_REQUIRED`. Keyed mode applies this to every request. Anonymous mode applies it only when a key is presented.

A `wp-config.php` snippet that sets `$_SERVER['HTTPS']` from `X-Forwarded-Proto` without checking the peer defeats this check, and the plugin cannot detect it. Site setup must not use one.

## CORS

CORS is not authorization. Only origins on an explicit allowlist get `Access-Control-Allow-Origin`, echoed exactly. `Access-Control-Allow-Credentials` is never sent. The default list is empty. A non-browser client is unaffected, and an allowed origin without a key still gets `UNAUTHORIZED`.

## Errors

Every 4xx and 5xx body has the shape `{contract_version, code, message, data: {status}}`, with a fixed message per code. A request ID, when added, goes in a header and never in the body, because it would make hidden-ID responses distinguishable.

| Code | HTTP | Meaning |
|---|---|---|
| `INVALID_QUERY` | 400 | Unknown parameter or invalid value |
| `UNAUTHORIZED` | 401 | No key, or a wrong, unknown, revoked, expired, rotated, or malformed one. Identical in every case, with `WWW-Authenticate: Bearer realm="blixis-content"` |
| `FORBIDDEN` | 403 | Valid key without the required scope |
| `HTTPS_REQUIRED` | 403 | Transport requirement not met |
| `NOT_FOUND` | 404 | Hidden, missing, or no such route |
| `METHOD_NOT_ALLOWED` | 405 | Any write method. `Allow: GET, HEAD, OPTIONS` |
| `RATE_LIMITED` | 429 | Limit exceeded. `Retry-After` in seconds |
| `INTERNAL_ERROR` | 500 | Any caught failure. Details go to the log only |

Evaluation order on content routes is transport, key, rate limit, query, then lookup. An unauthenticated caller therefore learns nothing about IDs. `VERSION_CONFLICT` from the earlier proposal is not in v1, because a read-only API has no write to conflict with.

## Caching

See [`cache-policy.json`](cache-policy.json). Summary:

| Response | `Cache-Control` | `ETag` |
|---|---|---|
| Anonymous-mode success | `public, max-age=60, must-revalidate` | Yes |
| Key-authorized success | `private, max-age=0, must-revalidate` | Yes |
| `/schema` | `public, max-age=300` | Yes |
| `/health` | `no-store` | No |
| Any error | `no-store` | No |

All carry `Vary: Authorization, Origin`. An `ETag` is an opaque, strong hash of the response body. A `304` is possible only after the visibility check passes, so a stale validator for an unpublished page gets `404`, not `304`.

A public response can stay in a shared cache for up to 60 seconds after unpublishing unless the site purges it. That is the accepted upper bound for anonymous mode. Keyed mode has no shared-cache window.

Any front-end response showing unpublished or autosaved content carries `no-store` and `X-Robots-Tag: noindex, nofollow`, and a robots `noindex` tag in HTML.

## Rate limits

A limit counts keys by key ID and anonymous clients by address. Only a trusted proxy can set the address through `X-Forwarded-For`. Counting uses one atomic statement. Transients and `wp_cache_incr()` on a default install do not enforce a limit. WordPress cannot shed load before PHP and the database start, so volumetric protection belongs at the edge.

## Compatibility

`contract_version` changes in minor steps for additions, and the namespace changes for removals or renames. A field never changes meaning within `blixis/v1`.
