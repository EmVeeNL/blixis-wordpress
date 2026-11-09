#!/usr/bin/env bash
# Task 03-03 harness: the Blixis setup wizard against a real WordPress in a disposable Compose
# project (random name, tmpfs database, no published ports, no bind mounts). It cannot reach
# ~/Sites/blixis, its database, links, or the `blixis` project; only this run's project is removed.
#
# Usage: tests/03-03/run.sh [--out DIR] [--browsers chromium,firefox] ["<wp> <php>" ...]
#   T0303_NODE_MODULES  node_modules holding the locked playwright 1.65.0 (default: repo root)
# Exit: 0 all pass; 1 a check failed (product result); 2 harness fault.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 2
repo="$(cd ../.. && pwd -P)"
browsers=chromium
out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) mkdir -p "$2"; out="$(cd "$2" && pwd -P)"; shift 2 ;;
    --browsers) browsers="$2"; shift 2 ;;
    *) break ;;
  esac
done
COMBOS=("7.1.4 8.3" "7.0.8 8.5")
if [[ "$#" -gt 0 ]]; then COMBOS=("$@"); fi

# Host-side: the wizard defaults are the contract defaults with system fonts (Q13 is open).
node -e '
const [a, b] = process.argv.slice(1).map((f) => JSON.parse(require("node:fs").readFileSync(f, "utf8")));
b.fonts = a.fonts;
if (JSON.stringify(a) !== JSON.stringify(b)) { console.log("FAIL [static] wizard defaults drifted from the contract defaults"); process.exit(1); }
console.log("PASS [static] wizard defaults match the contract except fonts");
' "$repo/plugins/blixis-blocks/inc/setup/defaults.json" "$repo/docs/contracts/tokens/v1/valid/default.json" || exit 1

# Pinned test-time dependency, verified by integrity. Not shipped, not in the lockfile.
AXE_VERSION=4.14.0
AXE_INTEGRITY='sha512-9WTZxEjsZ7b13TH8JPmbV2z8CHbl80/2hm3XPEG4JgNdQLK81IBRXmSxHfMAOkSqQeRxT/0dwNDz2GOm3zzpcQ=='
cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/blixis-tests"
mkdir -p "$cache_dir" 2>/dev/null && [[ -w "$cache_dir" ]] || cache_dir="$(mktemp -d)"
axe_tgz="$cache_dir/axe-core-$AXE_VERSION.tgz"
axe_ok() { [[ -f "$axe_tgz" && "sha512-$(openssl dgst -sha512 -binary "$axe_tgz" | openssl base64 -A)" == "$AXE_INTEGRITY" ]]; }
if ! axe_ok; then
  curl -fsSL -o "$axe_tgz" "https://registry.npmjs.org/axe-core/-/axe-core-$AXE_VERSION.tgz" || { echo "HARNESS FAULT: axe-core download failed"; exit 2; }
  axe_ok || { rm -f "$axe_tgz"; echo "HARNESS FAULT: axe-core integrity mismatch"; exit 2; }
fi

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

T0303_DB_ROOT_PASSWORD="$(openssl rand -hex 24)"
T0303_ADMIN_PASSWORD="$(openssl rand -hex 24)"
COMPOSE_PROJECT_NAME="blixis-0303-$(openssl rand -hex 4)"
export T0303_DB_ROOT_PASSWORD T0303_ADMIN_PASSWORD COMPOSE_PROJECT_NAME
cleanup() { docker compose --profile browser down --remove-orphans >/dev/null 2>&1 || true; }
stage="$(mktemp -d)"
trap 'rm -rf "$stage"; cleanup' EXIT

# Stage the bundle in a temp dir (bsdtar on macOS has no --transform).
cp -R run-wp.sh check.php verify.php browser.mjs "$stage/"
mkdir -p "$stage/blixis-base" "$stage/blixis-blocks" "$stage/vendor" "$stage/node_modules"
COPYFILE_DISABLE=1 tar --exclude=node_modules -cf - -C "$repo/themes/blixis-base" . | tar -xf - -C "$stage/blixis-base"
COPYFILE_DISABLE=1 tar -cf - -C "$repo/plugins/blixis-blocks" . | tar -xf - -C "$stage/blixis-blocks"
tar -xzf "$axe_tgz" -C "$stage/vendor" --strip-components=1 package/axe.min.js
for package in playwright playwright-core; do
  source_dir="${T0303_NODE_MODULES:-$repo/node_modules}/.pnpm/$package@1.65.0/node_modules/$package"
  if [[ ! -d "$source_dir" ]]; then echo "HARNESS FAULT: run pnpm install --frozen-lockfile first"; exit 2; fi
  cp -R "$source_dir" "$stage/node_modules/$package"
done
# macOS extended attributes only make GNU tar in the containers noisy.
command -v xattr >/dev/null && xattr -cr "$stage" 2>/dev/null
: "${out:=$(mktemp -d)}"

product_fail=0
harness_fault=0
for combo in "${COMBOS[@]}"; do
  read -r wp php <<<"$combo"
  echo "== WordPress $wp, PHP $php"
  if ! T0303_CLI_IMAGE="$(cli_image "$php")"; then harness_fault=1; continue; fi
  export T0303_CLI_IMAGE
  cleanup
  if ! docker compose up -d --wait db runner >/dev/null 2>&1; then echo "HARNESS FAULT: stack did not start"; harness_fault=1; continue; fi
  docker compose exec -T runner sh -c 'mkdir -p /tmp/t && tar -xf - -C /tmp/t' < <(COPYFILE_DISABLE=1 tar -cf - -C "$stage" .)
  result="$(docker compose exec -T runner sh -c 'exec sh /tmp/t/run-wp.sh "$0"' "$wp" 2>&1)"
  printf '%s\n' "$result" | grep -E '^(FAIL|NOTE|HARNESS) ' || true
  printf '%s\n' "$result" | grep -q '^FAIL ' && product_fail=1
  echo "-- in-process: $(printf '%s\n' "$result" | grep -c '^PASS ') passed"
  if printf '%s\n' "$result" | grep -q '^HARNESS '; then harness_fault=1; continue; fi
  if ! printf '%s\n' "$result" | grep -q '^DONE '; then echo "HARNESS FAULT: no DONE marker"; printf '%s\n' "$result" | tail -15; harness_fault=1; continue; fi

  if ! docker compose --profile browser up -d browser >/dev/null 2>&1; then echo "HARNESS FAULT: browser container did not start"; harness_fault=1; continue; fi
  docker compose exec -T browser sh -c 'rm -rf /work && mkdir -p /work && cd /work && tar -xf -' < <(COPYFILE_DISABLE=1 tar -cf - -C "$stage" browser.mjs node_modules vendor)
  bres="$(docker compose exec -T -e T0303_BROWSERS="$browsers" -e T0303_ADMIN_PASSWORD="$T0303_ADMIN_PASSWORD" browser sh -c 'cd /work && node browser.mjs' 2>&1)"
  brc=$?
  mkdir -p "$out/wp-$wp-php-$php" && printf '%s\n' "$bres" > "$out/wp-$wp-php-$php/browser.log"
  printf '%s\n' "$bres" | grep -E '^(PASS|FAIL|NOTE|HARNESS) ' | grep -v '^PASS ' || true
  pass=$(printf '%s\n' "$bres" | grep -c '^PASS ' || true); failn=$(printf '%s\n' "$bres" | grep -c '^FAIL ' || true)
  echo "-- $pass passed, $failn failed"
  if printf '%s\n' "$bres" | grep -q '^HARNESS '; then harness_fault=1
  elif ! printf '%s\n' "$bres" | grep -q '^DONE-BROWSER '; then echo "HARNESS FAULT: browser script ended without DONE-BROWSER (exit $brc)"; printf '%s\n' "$bres" | tail -25; harness_fault=1
  elif [[ $failn -ne 0 ]]; then product_fail=1; fi
  mkdir -p "$out/wp-$wp-php-$php"
  docker compose cp browser:/work/shots/. "$out/wp-$wp-php-$php/" >/dev/null 2>&1 && echo "NOTE artifacts copied to $out/wp-$wp-php-$php"
  vres="$(docker compose exec -T runner sh -c 'cd /tmp/wp && wp eval-file /tmp/t/verify.php' 2>&1)"
  printf '%s\n' "$vres" | grep -E '^(FAIL|NOTE) ' || true
  printf '%s\n' "$vres" | grep -q '^FAIL ' && product_fail=1
  printf '%s\n' "$vres" | grep -q '^PASS ' || { echo "HARNESS FAULT: verify.php produced no result"; harness_fault=1; }
  echo "-- after browser: $(printf '%s\n' "$vres" | grep -c '^PASS ') passed"
done

if [[ $harness_fault -ne 0 ]]; then echo "RESULT: harness fault"; exit 2; fi
if [[ $product_fail -ne 0 ]]; then echo "RESULT: checks failed"; exit 1; fi
echo "RESULT: all checks passed"
