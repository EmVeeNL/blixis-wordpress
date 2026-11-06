# ADR-009 — Compatibility and TypeScript tooling

**Status:** Accepted planning baseline, 2026-11-06. Implementation gates remain open.

## Context

Task [01-02](../../roadmap/phases/01-discovery-foundation/02-compatibility-spike.md) tested WordPress, PHP, Node, browser, Tailwind, and editor dependencies in isolated fixtures. The repository currently declares WordPress 6.6 and PHP 8.2 in its component headers. `typescript-eslint` 8.72.1 rejects TypeScript 7.0.2 through its peer requirement.

## Decision

- Target WordPress 7.0 and 7.1, PHP 8.3–8.5, MariaDB 11.4, and Node 26 LTS, pinned to 26.13.0 for builds. Versions tested outside these targets are evidence, not a support promise. Revisit this set when a new WordPress or PHP line ships.
- Use TypeScript 7.0.x and TSX for the editor. Use Oxlint with `oxlint-tsgolint` for type-aware linting and Oxfmt for formatting. Keep a separate TypeScript check until CI evidence justifies combining it with lint.
- Retest the theme and plugin activation gates when task 02-01 raises their headers. Task 01-04 must add version-pinned production lint, format, build, and failure-path checks. Task 04-01 must verify WordPress editor package integration. Task 06-04 must test real Safari and Edge.

## Evidence and limits

The [support matrix](../../development/SUPPORT_MATRIX.md) lists exact tested versions, reproducible commands, results, and gaps. The Oxc tool proof runs only in the [01-02 spike](../../../spikes/01-02-compatibility/README.md). It does not establish production CI coverage or browser support beyond the tested combinations.
