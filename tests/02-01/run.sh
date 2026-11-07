#!/usr/bin/env bash
# Task 02-01 integration harness. Runs WordPress + PHP combinations in a throwaway
# Compose project (random name, tmpfs database, no published ports, no bind mounts).
# It cannot reach ~/Sites/blixis, its database, links, or the `blixis` Compose project.
#
# Usage: tests/02-01/run.sh [--static-only] ["<wp> <php> <pass|reject>" ...]
# Exit: 0 all checks pass; 1 one or more checks failed (product result);
#       2 harness fault (Docker, download, install, missing result).
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
here="$(pwd -P)"
repo="$(cd ../.. && pwd -P)"

static_rc=0
php "$here/static.php" "$repo" || static_rc=$?
if [[ "${1:-}" == "--static-only" ]]; then exit "$static_rc"; fi

# wp_version php_minor expectation. Floors: WordPress 7.0, PHP 8.3.
COMBOS=(
  "7.1.4 8.3 pass" "7.1.4 8.5 pass" "7.0.8 8.3 pass" "7.0.8 8.5 pass"
  "7.1.4 8.2 reject" "6.9.11 8.3 reject"
)
if [[ "$#" -gt 0 ]]; then COMBOS=("$@"); fi

cli_image() {
  local digest
  case "$1" in
    8.2) digest=be56991798a70b0491f406f0a088ec3f12b5cb915ab6949dced0d9052861265b ;;
    8.3) digest=a4fff017eb08c03187e90fe52d4bff8d3a4d4a5103de05829a6e747c4ca3056e ;;
    8.4) digest=37b7e3ed9b537788756f9b5c6dd8ec7c3f3053ee707abc67c776e453ba8f9e55 ;;
    8.5) digest=d16fa67b450f61a8e16d738e502f29dd30daa08c5e7d2bc39a1e32ec29815aed ;;
    *) echo "harness: no pinned WP-CLI image for PHP $1" >&2; return 1 ;;
  esac
  printf 'wordpress:cli-2.12.0-php%s@sha256:%s' "$1" "$digest"
}

T0201_DB_ROOT_PASSWORD="$(openssl rand -hex 24)"
export T0201_DB_ROOT_PASSWORD
COMPOSE_PROJECT_NAME="blixis-0201-$(openssl rand -hex 4)"
export COMPOSE_PROJECT_NAME
T0201_CLI_IMAGE="$(cli_image 8.3)"
export T0201_CLI_IMAGE
cleanup() { docker compose --profile run down --remove-orphans -v >/dev/null 2>&1 || true; }
trap cleanup EXIT

bundle() {
  COPYFILE_DISABLE=1 tar -cf - check.php run-combo.sh -C "$repo/docs/contracts/tokens/v1/golden" default.theme.json -C "$repo/themes" blixis-base -C "$repo/plugins" blixis-blocks
}

if ! docker compose up -d --wait db >/dev/null; then
  echo "HARNESS FAULT: database did not start" >&2; exit 2
fi

product_fail=$static_rc
harness_fault=0
for combo in "${COMBOS[@]}"; do
  read -r wp php expect <<<"$combo"
  echo "== WordPress $wp, PHP $php, expect $expect"
  if ! T0201_CLI_IMAGE="$(cli_image "$php")"; then harness_fault=1; continue; fi
  export T0201_CLI_IMAGE
  out="$(bundle | docker compose --profile run run --rm --no-deps -T runner sh -c \
    'mkdir -p /tmp/t && tar -xf - -C /tmp/t && exec sh /tmp/t/run-combo.sh "$0" "$1"' "$wp" "$expect" 2>&1)"
  printf '%s\n' "$out" | grep -E '^(PASS|FAIL|HARNESS) ' || true
  if printf '%s\n' "$out" | grep -q '^HARNESS '; then harness_fault=1
  elif ! printf '%s\n' "$out" | grep -q '^DONE '; then echo "HARNESS FAULT: no DONE marker for $combo"; printf '%s\n' "$out" | tail -15; harness_fault=1
  elif printf '%s\n' "$out" | grep -q '^FAIL '; then product_fail=1; fi
done

if [[ $harness_fault -ne 0 ]]; then echo "RESULT: harness fault"; exit 2; fi
if [[ $product_fail -ne 0 ]]; then echo "RESULT: checks failed"; exit 1; fi
echo "RESULT: all checks passed"
