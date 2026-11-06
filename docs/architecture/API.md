# Content API contract proposal

**Status: proposed for phase 08.** No Content API routes, keys, or quotas are implemented. The versioned [API contract](../contracts/api/README.md) from task 01-05 replaces the candidate details below where they differ.

| Method | Candidate route | Purpose |
|---|---|---|
| GET | `/wp-json/blixis/v1/content` | Paginated published-content list |
| GET | `/wp-json/blixis/v1/content/{id}` | Published structured or rendered content |
| GET | `/wp-json/blixis/v1/schema` | Public contract version, without element metadata |
| GET | `/wp-json/blixis/v1/health` | Minimal operational status without secrets |

Version responses and document schemas. Enforce `publish` status and an allowlist of fields on the server regardless of query parameters; return 404 for hidden IDs. V1 is read-only. Require HTTPS bearer keys with keyed hashes stored server-side; a key identifies a client and never logs in a WordPress user, minimal `read:published` scope, one-time display, rotation, revocation, and key-ID-only logs. Auth is on by default; anonymous public mode requires explicit configuration. CORS is not authorization.

Error codes are `INVALID_QUERY` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `HTTPS_REQUIRED`, `NOT_FOUND` (404), `METHOD_NOT_ALLOWED` (405), `RATE_LIMITED` (429), and `INTERNAL_ERROR` (500); a read-only API has no version conflict. Editor routes use their own namespace and `If-Match` codes. Set pagination caps, ETag/conditional GET, cache TTL and invalidation. Never cache a draft response publicly. Test privilege escalation, draft leakage, ID enumeration, CORS, rate limits, cache isolation, and key rotation before release. Final route shape, key storage, and public mode require [ADR-007](decisions/ADR-007-api-authentication.md) approval.
