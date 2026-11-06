# CI checks

CI covers the code that exists today: the theme, the plugin, shell scripts, documentation, and the 01-02 and 01-05 spikes, which are the only TypeScript source. A product package adds its own jobs or joins these when it arrives. Both workflows run on every pull request and on pushes to `main`, with read-only `contents` permission.

## Checks

| Check | Workflow | What it runs | To fix a failure | Required on `main` |
|---|---|---|---|---|
| `docs` | PHP lint | `python3 scripts/check-docs.py` | Repair the reported link or task field | Yes |
| `syntax` | PHP lint | `php -l` on theme and plugin PHP with the runner's PHP | Fix the reported parse error | Yes |
| `php-lint (8.3)`, `(8.4)`, `(8.5)` | Quality | `composer validate`, `php -l` on all tracked PHP, `composer lint` | Follow the PHP_CodeSniffer report; `vendor/bin/phpcbf` fixes marked issues | Yes |
| `typescript` | Quality | `pnpm typecheck`, `pnpm lint` (Oxlint, `oxlint-tsgolint`, warnings fail), `pnpm format:check` (Oxfmt) | The failed step names the tool; run the same command locally | Yes |
| `build` | Quality | `pnpm build`, including Tailwind output assertions | Run `pnpm build` and read the first failure | Yes |
| `browser-tests` | Quality | Spike drag and drop tests on Playwright's Chromium, Firefox, and WebKit | See the [spike](../../spikes/01-02-compatibility/README.md) for local commands | Yes |
| `scripts` | Quality | `bash -n`, ShellCheck, `scripts/test-setup-links.sh`, Compose configuration, JSON parsing, actionlint | The failed step names the tool | Yes |
| `wordpress-integration` | Quality | Theme and plugin activation plus REST, revision, and preview smoke tests in a throwaway stack | Read the report step; failed checks are listed by name | Yes |
| `contracts` | Quality | The [contract fixtures](../contracts/README.md) in TypeScript and PHP, cross-contract checks, and browser proofs; any skipped test fails | Run `pnpm run test` in `spikes/01-05-contracts`; a changed golden is a contract change | Not yet; add after this merges |
| `contracts-wordpress (document)`, `(tokens)`, `(api)` | Quality | Contract proofs on WordPress 7.1.4 with PHP 8.4 and WordPress 7.0.8 with PHP 8.5 in a throwaway stack | Run `spikes/01-05-contracts/wordpress/run.sh <area>` and read the `FAIL` lines | Not yet; add after this merges |
| `secrets` | Quality | gitleaks on history reachable from `HEAD` | Rotate a real credential, then remove it from the branch. Add a false positive's fingerprint to `.gitleaksignore` with the reason | Yes |
| `licenses` | Quality | License check of installed npm packages | Review the flagged package before changing the allowed list | Yes |
| `dependency-audit` | Quality | `pnpm audit`, `composer audit` | Update the affected package | No |

`dependency-audit` stays advisory because a newly published advisory can fail it on any unrelated pull request. `wordpress-integration` downloads WordPress from wordpress.org, so an outage there can fail it; rerun the job.

## Pinning

Actions, the Playwright image, the WordPress and MariaDB test images, ShellCheck, actionlint, and gitleaks are pinned by commit SHA or image digest. Node and pnpm come from `.nvmrc` and `package.json`, npm and Composer packages from their lockfiles, and the Composer tool constraints are exact. Runners are `ubuntu-24.04`. `setup-php` selects a PHP minor version, so its patch version moves with the action's image. Checkouts do not keep credentials.

## Branch protection

Since PR [#12](https://github.com/EmVeeNL/blixis-wordpress/pull/12) merged on 2026-11-06, `main` protection requires the 12 checks marked Yes above from the GitHub Actions app (app ID `15368`). The checks ran successfully on the merged commit: [Quality](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42292818868) and [PHP lint](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42292818870). Protection is strict (branches must be up to date), requires a PR and resolved conversations, applies to admins, and blocks force pushes and deletion. Zero approving reviews are required while Michael is the sole developer.

Verify the live configuration with:

```bash
gh api repos/EmVeeNL/blixis-wordpress/branches/main/protection/required_status_checks \
  --jq '{strict, checks}'
```

When checks change, update protection through the GitHub branch-protection API only after the new jobs have reported on `main`. Pin each required check to the GitHub Actions app. Raise the review count when a second reviewer is available.

## Known gaps

- GitHub's dependency graph is off, so `actions/dependency-review-action` fails with "Dependency review is not supported on this repository". It is not installed. `dependency-audit` covers known advisories instead.
- Stale branches are not scanned by `secrets`. GitHub's secret scanning and push protection are on for known provider patterns.
- `syntax` uses the runner's PHP. `php-lint` covers the target versions.
- The Compose configuration step has no recorded failure run. Its failure path was not exercised.

## Failure-path evidence

Task 01-04 tested each check on 2026-11-06 with throwaway draft PRs [#13](https://github.com/EmVeeNL/blixis-wordpress/pull/13) and [#14](https://github.com/EmVeeNL/blixis-wordpress/pull/14). Each commit held one deliberate fault. Both PRs are closed and their branches deleted. GitHub keeps their commits under the PR refs; the only secret is a generated fake value.

| Deliberate fault | Check and step that failed | Run |
|---|---|---|
| Broken documentation link | `docs` | [42257656401](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42257656401) |
| PHP parse error | `syntax` | [42257667886](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42257667886) |
| PHP parse error | `php-lint` on all three versions, syntax step | [42257669489](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42257669489) |
| Unescaped `$_GET` echo | `php-lint` on all three versions, PHP_CodeSniffer step | [42257690664](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42257690664) |
| Type error | `typescript` type check step; also `build` and `browser-tests` | [42257706451](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42257706451) |
| Floating promise (type-aware rule) | `typescript` Oxlint step | [42257725563](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42257725563) |
| Bad formatting | `typescript` Oxfmt step | [42257744137](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42257744137) |
| Tailwind utility removed from its source | `build`; also `browser-tests` and the Oxfmt step, because the edit changed formatting | [42257760092](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42257760092) |
| Failing browser test | `browser-tests` | [42257774134](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42257774134) |
| Unquoted shell variable | `scripts` ShellCheck step | [42257789503](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42257789503) |
| Link script stops refusing conflicts | `scripts` link test step | [42257805720](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42257805720) |
| Invalid JSON file | `scripts` JSON step | [42257823895](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42257823895) |
| Invalid workflow expression | `scripts` actionlint step | [42257837040](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42257837040) |
| Plugin requires PHP 9.0 | `wordpress-integration` report step | [42257855313](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42257855313) |
| Generated fake API key | `secrets` only, with 20 commits scanned | [42260181052](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42260181052) |
| License allowed list loses MIT | `licenses` | [42259808970](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42259808970) |
| Vulnerable `lodash` 4.17.20 | `dependency-audit` | [42257906393](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42257906393) |

After the faults were removed, all jobs passed: Quality [42259829610](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42259829610) and PHP lint [42259829502](https://github.com/EmVeeNL/blixis-wordpress/actions/runs/42259829502). The first batch's `secrets` job also failed on runs from before the fake key was committed, because it then scanned all branches. That finding is why the scan is now limited to `HEAD`, and the runs listed for `secrets` and `licenses` come from after that change. A secret stays in a branch's history after its file is removed, so `secrets` passes again only once the commit is gone from the branch.

This testing also found two silent passes, both fixed: Oxlint warnings exited 0 until `--deny-warnings` was added, and the first license fault did not change the file, so it was redone.
