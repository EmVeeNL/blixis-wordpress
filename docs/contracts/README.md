# Architecture contracts

Versioned contracts from [task 01-05](../roadmap/phases/01-discovery-foundation/05-architecture-contracts.md). **Status: proposed; the owner has not approved them, and no product code implements them.** Throwaway proofs in [`spikes/01-05-contracts`](../../spikes/01-05-contracts/README.md) run every fixture in CI.

| Contract | Covers | Evidence |
|---|---|---|
| [Document](document/README.md) | Ownership, graph, limits, versioning, migration, conflict token | [Review](../architecture/reviews/01-05-document.md) |
| [Tokens and renderer](tokens/README.md) | `BlixisThemeConfig`, generation, Tailwind boundary, escaping, cache keys | [Review](../architecture/reviews/01-05-tokens.md) |
| [Content API](api/README.md) | Routes, authorization matrix, keys, caching, errors | [Review](../architecture/reviews/01-05-api.md) |

The three reviews ran independently. The [integration note](../architecture/reviews/01-05-integration.md) records where they disagreed, how that was resolved, and what the owner still decides.

Validator codes such as `invalid_nesting` and `token.breakpoint.not_preset` are internal to the editor and setup routes. Only the uppercase codes in the API contract are public.
