# Content API plan

Use versioned REST routes with explicit schemas and permission callbacks. Public routes return published, intentionally public fields only. Authenticated draft, preview, and mutation routes check capabilities for the specific post and validate nonces or application authentication as appropriate. Add pagination, cache semantics, rate limits where needed, and integration tests before release.
