# Content API contract proposal

**Status: proposed for phase 08.** No Content API routes, keys, or quotas are implemented.

| Method | Candidate route | Purpose |
|---|---|---|
| GET | `/wp-json/blixis/v1/content` | Paginated published-content list |
| GET | `/wp-json/blixis/v1/content/{id}` | Published structured or rendered content |
| GET | `/wp-json/blixis/v1/schema` | Public contract version and element metadata |
| GET | `/wp-json/blixis/v1/health` | Minimal operational status without secrets |

Version responses and document schemas. Enforce `publish` status and an allowlist of fields on the server regardless of query parameters; return 404 for hidden IDs. V1 is read-only. Require HTTPS bearer keys with hashes stored server-side, minimal `read:published` scope, one-time display, rotation, revocation, and key-ID-only logs. Auth is on by default; anonymous public mode requires explicit configuration. CORS is not authorization.

Candidate error codes are `INVALID_QUERY` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VERSION_CONFLICT` (409), and `RATE_LIMITED` (429). Set pagination caps, ETag/conditional GET, cache TTL and invalidation. Never cache a draft response publicly. Test privilege escalation, draft leakage, ID enumeration, CORS, rate limits, cache isolation, and key rotation before release. Final route shape, key storage, and public mode require [ADR-007](decisions/ADR-007-api-authentication.md) approval.
