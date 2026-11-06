# Security and performance

**Current:** the repository has minimal theme/plugin code and a PHP syntax check. The controls below are implementation requirements and release gates for future features, not claims that those features are secured.

Protect drafts, WordPress accounts, API keys, uploaded media/fonts, publication, and rendered HTML from anonymous users, lower-privilege users, forged requests, and abusive API clients. Every REST route needs a permission callback and post-specific capabilities. Cookie-authenticated writes need a REST nonce in addition to capability checks. Validate documents server-side: schema/version, node count/depth, nesting, URLs, HTML, and allowed props. Escape by output context using WordPress APIs. Never render untrusted scripts, event handlers, arbitrary inline styles, or generated Tailwind classes.

Keep keys in server storage, store only hashes where appropriate, mask them in UI/logs, and support rotation/revocation. Draft reviews use authenticated preview first. Any future share link needs a revision-specific, short-lived, revocable, hashed token with no cache/indexing exposure. Validate uploads by actual MIME and size; document licenses. Pin dependencies, audit them, and use least-privilege CI permissions. Roll out CSP with tested embed allowlists.

## Proposed budgets

| Metric | Initial target | Status |
|---|---|---|
| Mobile LCP p75 | ≤ 2.5 s | Unmeasured |
| INP p75 | ≤ 200 ms | Unmeasured |
| CLS p75 | ≤ 0.1 | Unmeasured |
| Own JS on a standard public page | Ideally ≤ 80 kB gzip | Unmeasured |
| Initial editor usability | Within 3 s on defined test hardware | Unmeasured |
| Warm-cache API p95 | ≤ 300 ms, excluding network | Unmeasured |

Measure against realistic content and a specified environment before treating these as gates. Public pages should use server-rendered HTML, responsive images and restrained fonts; editor code should be split and absent from public pages. Cache by revision and token version, and invalidate on publication and token changes. A release requires authorization, accessibility, dependency, abuse, upload, and performance evidence. For incidents, revoke affected keys, disable affected routes, preserve safe logs, inspect backups, and ship a regression test.
