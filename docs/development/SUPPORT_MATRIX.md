# Support matrix

**Status: provisional.** Task `01-02` tested the versions below on 2026-11-06. The tested results are evidence. The supported floors are proposals until the owner decides them (Q01), and code headers still declare WordPress 6.6 and PHP 8.2. Reproduction steps and raw results are in the [compatibility spike](../../spikes/01-02-compatibility/README.md).

## Tested results

| Component | Tested | Result |
|---|---|---|
| WordPress and PHP | 7.1.4 and 7.0.8 on PHP 8.2.35, 8.3.36, 8.4.27, 8.5.12; 6.9.11 on 8.2, 8.4; 6.6.11 on 8.2, 8.3 | 12 of 12 combinations pass all 37 checks |
| Refused versions | WordPress 7.1.4 on PHP 8.1.34; WordPress 6.5.8 on PHP 8.2.35 | Theme and plugin correctly refuse to activate |
| Database | MariaDB 11.4.13 | Pass; same major line as `compose.yaml` |
| Node | 26.13.0, 24.22.2, 22.23.4 | Clean `npm ci` and build pass |
| Failing Node | 20.20.0, 18.20.8 | Build exits 1; 20 cannot run the `.ts` check scripts (`ERR_UNKNOWN_FILE_EXTENSION`), 18 also reports `EBADENGINE` warnings |
| TypeScript | 7.0.2, strict mode, TSX | Type check passes and rejects a deliberate type error |
| Tailwind CSS | 4.3.5 with `@tailwindcss/cli` 4.3.5 | `@theme` utilities, custom breakpoint, `motion-reduce`, runtime `--blixis-*` value, and unused-class removal verified |
| React | 18.3.1 | Version bundled by every tested WordPress release; used for the proof |
| Drag/drop | `@dnd-kit/core` 6.3.1 | 10 pointer and keyboard tests pass, including nesting refusal, announcements, focus, and cancel |
| Bundler | Vite 8.3.6, `@vitejs/plugin-react` 6.2.1 | Pass |
| Browsers | Chrome 156.0.8078.80; Chrome for Testing 158.0.8127.18; Firefox 159.0; WebKit 27.2 | 30 of 30 runs pass in each (Playwright 1.65.0); see gaps for Safari and Edge |

## Proposed support policy

| Component | Proposal | Reason |
|---|---|---|
| WordPress | 7.0 and 7.1, raising the 6.6 header in task 02-01 | Only the 7.1 branch has full support; older versions passed, so this is a maintenance choice rather than a technical limit |
| PHP | 8.3 to 8.5, raising the 8.2 header in task 02-01 | PHP 8.2 security support ends on 2026-12-31 and it lacks `json_validate()` |
| MariaDB | 11.4 | The only tested database |
| Node | 26 LTS for builds, pinned to 26.13.0 | Matches the one-line policy and the local toolchain; 24 and 22 also pass |
| TypeScript | 7.0.x, TSX only | Owner preference on 2026-11-06; the type check passes |
| Tailwind CSS, `@dnd-kit/core`, React | 4.3.5, 6.3.1, 18.3.1 | Exact pins from this proof |
| Browsers | Current Chrome, Firefox, Safari, Edge | Unchanged policy; real Safari and Edge must be run by task 06-04 |

## Gaps and constraints

| Gap or constraint | Impact | Mitigation |
|---|---|---|
| Safari 27.0.1 not run: "You must enable 'Allow remote automation'" | WebKit 27.2 is a Playwright build, not Safari | Run real Safari in task 06-04 |
| Edge not installed | Not run | Run it in task 06-04; Chromium results are only indirect evidence |
| `typescript-eslint` 8.72.1 requires `typescript <6.1.0` and npm refuses it with 7.0.2 (ERESOLVE) | Type-aware linting cannot use TypeScript 7 yet | Choose a linting approach in task 01-04; not tested here |
| `@wordpress/*` packages and `@wordpress/scripts` not tested with TypeScript 7 | Unknown for editor builds | Verify in task 04-01 |
| Drag/drop proof ran on a standalone page with bundled React | Not proven inside wp-admin or against the `wp-element` script | Verify in task 04-01 |
| `@dnd-kit/core` 6.3.1 was published on 2024-12-05 | Slow release pace; maintenance risk | Isolate it behind an adapter. `@dnd-kit/react` 0.5.3 is pre-1.0; neither it nor Pragmatic Drag and Drop was tested |
| Tests used the PHP built-in server through `wp server` | Apache, nginx, and object caches not tested | Cover them in tasks 01-04 and 06-04 |
| MySQL, Multisite, and WordPress 7.2 beta not tested | Unknown | Multisite is planned for v1.1 in task 09-06; recheck WordPress releases before task 02-01 |
| WP-CLI 2.12.0 logs one deprecation on PHP 8.5 | From WP-CLI's `Colors` class, not WordPress or Blixis | Track it; no Blixis log lines appeared |
| CI runs only `php -l` and documentation checks | This matrix is not enforced in CI | Add the jobs in task 01-04 |

## Findings for the document model

- Keep `_blixis_document` registered with `show_in_rest` off. With it on, an anonymous request to a published page received the meta value.
- Use `wp_slash()` before `update_post_meta()`. Without it, JSON containing backslashes is corrupted.
- `revisions_enabled` stores and restores the document byte-exact, and a meta-only change creates a revision.
- The default Author role cannot edit pages, so page editing needs Editor or an explicit capability grant.

## Licenses

All 67 installed packages have recognized licenses: MIT 54, Apache-2.0 6, 0BSD 2, ISC 2, MPL-2.0 2, BSD-3-Clause 1 ([list](../../spikes/01-02-compatibility/results/licenses.txt)). The MPL-2.0 packages are `lightningcss`, used only at build time. Tabler icons, used by the planned icon IDs, are MIT in `@tabler/icons-react` 3.50.0. No fonts are in the repository.

Two items are open: the repository has no `LICENSE` file, and no rights record was found for `docs/assets/blixis-base-preview.png` or `docs/assets/blixis-logo.webp`. This review is a package-metadata check, not legal advice.
