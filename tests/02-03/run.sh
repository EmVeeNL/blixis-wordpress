#!/usr/bin/env bash
# Task 02-03 proof harness: real WordPress, disposable Compose project (random name,
# tmpfs database, no published ports, no bind mounts). It cannot reach ~/Sites/blixis,
# its database, or the `blixis` Compose project, and never uses `down -v` on anything
# else: only this run's own project is removed.
#
# Usage: tests/02-03/run.sh [--browser] [--plugin-dir DIR] [--out DIR] ["<wp> <php>" ...]
#   --browser     also drive Chromium (Playwright image) against the throwaway site
#   --plugin-dir  blixis-blocks plugin to test (default: this checkout's plugins/blixis-blocks)
#   --out         directory for screenshots and the browser report
# Exit: 0 all pass; 1 a check failed (product result); 2 harness fault.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 2
repo="$(cd ../.. && pwd -P)"
plugin_dir="$repo/plugins/blixis-blocks"
browser=0
out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --browser) browser=1; shift ;;
    --plugin-dir) plugin_dir="$(cd "$2" && pwd -P)"; shift 2 ;;
    --out) mkdir -p "$2"; out="$(cd "$2" && pwd -P)"; shift 2 ;;
    *) break ;;
  esac
done
COMBOS=("7.1.4 8.3" "7.0.8 8.5")
if [[ "$#" -gt 0 ]]; then COMBOS=("$@"); fi

cli_image() {
  local digest
  case "$1" in
    8.3) digest=a4fff017eb08c03187e90fe52d4bff8d3a4d4a5103de05829a6e747c4ca3056e ;;
    8.4) digest=37b7e3ed9b537788756f9b5c6dd8ec7c3f3053ee707abc67c776e453ba8f9e55 ;;
    8.5) digest=d16fa67b450f61a8e16d738e502f29dd30daa08c5e7d2bc39a1e32ec29815aed ;;
    *) echo "harness: no pinned WP-CLI image for PHP $1" >&2; return 1 ;;
  esac
  printf 'wordpress:cli-2.12.0-php%s@sha256:%s' "$1" "$digest"
}

T0203_DB_ROOT_PASSWORD="$(openssl rand -hex 24)"
T0203_ADMIN_PASSWORD="$(openssl rand -hex 24)"
COMPOSE_PROJECT_NAME="blixis-0203-$(openssl rand -hex 4)"
export T0203_DB_ROOT_PASSWORD T0203_ADMIN_PASSWORD COMPOSE_PROJECT_NAME
cleanup() { docker compose --profile browser down --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

# Stage the bundle in a temp dir (bsdtar on macOS has no --transform).
stage="$(mktemp -d)"
trap 'rm -rf "$stage"; cleanup' EXIT
mkdir -p "$stage/contract"
cp -R check.php seed.php run-wp.sh browser.mjs fixtures "$stage/"
for f in valid invalid golden token-map.json; do cp -R "$repo/docs/contracts/tokens/v1/$f" "$stage/contract/"; done
mkdir -p "$stage/blixis-base"
COPYFILE_DISABLE=1 tar --exclude=node_modules -cf - -C "$repo/themes/blixis-base" . | tar -xf - -C "$stage/blixis-base"
cp -R "$plugin_dir" "$stage/blixis-blocks"
send() { COPYFILE_DISABLE=1 tar -cf - -C "$stage" .; }

if [[ $browser -eq 1 ]]; then
  mkdir -p "$stage/node_modules"
  for package in playwright playwright-core; do
    source_dir="$repo/node_modules/.pnpm/$package@1.65.0/node_modules/$package"
    if [[ ! -d "$source_dir" ]]; then echo "HARNESS FAULT: run pnpm install --frozen-lockfile before --browser"; exit 2; fi
    cp -R "$source_dir" "$stage/node_modules/$package"
  done
fi

product_fail=0
harness_fault=0
first=1
for combo in "${COMBOS[@]}"; do
  read -r wp php <<<"$combo"
  echo "== WordPress $wp, PHP $php"
  if ! T0203_CLI_IMAGE="$(cli_image "$php")"; then harness_fault=1; continue; fi
  export T0203_CLI_IMAGE
  cleanup
  if ! docker compose up -d --wait db runner >/dev/null 2>&1; then echo "HARNESS FAULT: stack did not start"; harness_fault=1; continue; fi
  docker compose exec -T runner sh -c 'mkdir -p /tmp/t && tar -xf - -C /tmp/t' < <(send)
  keep=""
  if [[ $browser -eq 1 && $first -eq 1 ]]; then keep=1; fi
  result="$(docker compose exec -T -e T0203_KEEP_SERVER="$keep" runner sh -c 'exec sh /tmp/t/run-wp.sh "$0"' "$wp" 2>&1)"
  printf '%s\n' "$result" | grep -E '^(PASS|FAIL|NOTE|HARNESS) ' || true
  if printf '%s\n' "$result" | grep -q '^HARNESS '; then harness_fault=1
  elif ! printf '%s\n' "$result" | grep -q '^DONE '; then echo "HARNESS FAULT: no DONE marker"; printf '%s\n' "$result" | tail -15; harness_fault=1
  elif printf '%s\n' "$result" | grep -q '^FAIL '; then product_fail=1; fi
  pass=$(printf '%s\n' "$result" | grep -c '^PASS ' || true); failn=$(printf '%s\n' "$result" | grep -c '^FAIL ' || true)
  echo "-- $pass passed, $failn failed"

  if [[ -n "$keep" ]]; then
    echo "== Browser stage"
    : "${out:=$(mktemp -d)}"
    if ! docker compose --profile browser up -d browser >/dev/null 2>&1; then echo "HARNESS FAULT: browser container did not start"; harness_fault=1
    else
      # Seed content in the same site, then drive Chromium.
      docker compose exec -T runner sh -c 'cd /tmp/wp && wp eval-file /tmp/t/seed.php' 2>&1 | grep -E '^(NOTE|HARNESS) ' || true
      docker compose exec -T browser sh -c 'mkdir -p /work && cd /work && tar -xf -' < <(COPYFILE_DISABLE=1 tar -cf - -C "$stage" browser.mjs node_modules)
      bres="$(docker compose exec -T browser sh -c 'cd /work && node browser.mjs' 2>&1)"
      brc=$?
      printf '%s\n' "$bres" | grep -E '^(PASS|FAIL|NOTE|HARNESS) ' || true
      if [[ $brc -ne 0 ]] && ! printf '%s\n' "$bres" | grep -q '^FAIL '; then echo "HARNESS FAULT: browser script exited $brc"; printf '%s\n' "$bres" | tail -10; harness_fault=1; fi
      printf '%s\n' "$bres" | grep -q '^FAIL ' && product_fail=1
      docker compose cp browser:/work/shots/. "$out/" >/dev/null 2>&1 && echo "NOTE screenshots copied to $out"
    fi
  fi
  first=0
done

if [[ $harness_fault -ne 0 ]]; then echo "RESULT: harness fault"; exit 2; fi
if [[ $product_fail -ne 0 ]]; then echo "RESULT: checks failed"; exit 1; fi
echo "RESULT: all checks passed"
