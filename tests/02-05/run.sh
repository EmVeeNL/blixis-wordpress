#!/usr/bin/env bash
# Task 02-05 harness: the optional showcase child theme with Blixis Base as its parent, against a
# real WordPress in a disposable Compose project (random name, tmpfs database, no published ports,
# no bind mounts). It cannot reach ~/Sites/blixis, its database, or the `blixis` project.
#
# Usage: tests/02-05/run.sh [options] ["<wp> <php>" ...]
#   --static-only       host-only static checks and their negative controls, no Docker
#   --child-dir DIR     child theme under test (default: the themes/* directory with "Template: blixis-base")
#   --theme-dir DIR     Base theme (default: this checkout's themes/blixis-base)
#   --out DIR           screenshots, report.json and logs are copied here
#   --browsers LIST     comma list of chromium,firefox (default chromium)
#   T0205_NODE_MODULES  node_modules holding the locked playwright 1.65.0 (default: repo root)
# Exit: 0 all pass; 1 a check failed (product result, including a missing child theme); 2 harness fault.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")" || exit 2
here="$(pwd -P)"
repo="$(cd ../.. && pwd -P)"
theme_dir="$repo/themes/blixis-base"
child_dir=""
static_only=0
browsers=chromium
out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --static-only) static_only=1; shift ;;
    --child-dir) child_dir="$(cd "$2" && pwd -P)" || exit 2; shift 2 ;;
    --theme-dir) theme_dir="$(cd "$2" && pwd -P)" || exit 2; shift 2 ;;
    --out) mkdir -p "$2"; out="$(cd "$2" && pwd -P)"; shift 2 ;;
    --browsers) browsers="$2"; shift 2 ;;
    *) break ;;
  esac
done
COMBOS=("7.1.4 8.3" "7.0.8 8.5")
if [[ "$#" -gt 0 ]]; then COMBOS=("$@"); fi

static_rc=0
node --test "$here/static.test.mjs" >/dev/null 2>&1 || { echo "FAIL static negative controls"; static_rc=1; }
if [[ -z "$child_dir" ]]; then
  child_dir="$(node --input-type=module -e "import {discoverChild} from '$here/static.mjs'; const c = discoverChild('$repo/themes'); if (c) console.log(c)")"
fi
if [[ -z "$child_dir" ]]; then
  echo "FAIL no child theme found: expected themes/<slug>/style.css with 'Template: blixis-base'."
  echo "NOTE expected gap until the 02-05 child theme branch is integrated; rerun with --child-dir DIR to test another checkout."
  exit 1
fi
child_slug="$(basename "$child_dir")"
node "$here/static.mjs" "$child_dir" "$theme_dir" || static_rc=$?
find "$child_dir" -name '*.php' -not -path '*/node_modules/*' -print0 | xargs -0 -n1 php -l >/dev/null 2>&1 || { echo "FAIL PHP syntax error in the child theme (php -l)"; static_rc=1; }
base_changed="$(cd "$repo" && git diff --name-only origin/main...HEAD -- themes/blixis-base 2>/dev/null | wc -l | tr -d ' ')"
echo "NOTE Base files differing from origin/main: ${base_changed:-unknown} (review them: the showcase must not need Base changes beyond reviewed neutral fixes)"
if [[ $static_only -eq 1 ]]; then exit "$static_rc"; fi

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

T0205_DB_ROOT_PASSWORD="$(openssl rand -hex 24)"
T0205_ADMIN_PASSWORD="$(openssl rand -hex 24)"
COMPOSE_PROJECT_NAME="blixis-0205-$(openssl rand -hex 4)"
export T0205_DB_ROOT_PASSWORD T0205_ADMIN_PASSWORD COMPOSE_PROJECT_NAME
cleanup() { docker compose --profile browser down --remove-orphans >/dev/null 2>&1 || true; }
stage="$(mktemp -d)"
trap 'rm -rf "$stage"; cleanup' EXIT

cp -R run-wp.sh seed.php browser.mjs "$stage/"
mkdir -p "$stage/blixis-base" "$stage/child" "$stage/vendor" "$stage/node_modules"
COPYFILE_DISABLE=1 tar --exclude=node_modules -cf - -C "$theme_dir" . | tar -xf - -C "$stage/blixis-base"
COPYFILE_DISABLE=1 tar --exclude=node_modules -cf - -C "$child_dir" . | tar -xf - -C "$stage/child"
sed -n 's/^[[:space:]]*Theme Name:[[:space:]]*//Ip' "$child_dir/style.css" | head -1 | tr -d '\r\n' > "$stage/child-name.txt"
tar -xzf "$axe_tgz" -C "$stage/vendor" --strip-components=1 package/axe.min.js
for package in playwright playwright-core; do
  source_dir="${T0205_NODE_MODULES:-$repo/node_modules}/.pnpm/$package@1.65.0/node_modules/$package"
  if [[ ! -d "$source_dir" ]]; then echo "HARNESS FAULT: run pnpm install --frozen-lockfile first"; exit 2; fi
  cp -R "$source_dir" "$stage/node_modules/$package"
done
command -v xattr >/dev/null && xattr -cr "$stage" 2>/dev/null
: "${out:=$(mktemp -d)}"

product_fail=$static_rc
harness_fault=0
for combo in "${COMBOS[@]}"; do
  read -r wp php <<<"$combo"
  echo "== WordPress $wp, PHP $php, child $child_slug"
  if ! T0205_CLI_IMAGE="$(cli_image "$php")"; then harness_fault=1; continue; fi
  export T0205_CLI_IMAGE
  cleanup
  if ! docker compose up -d --wait db runner >/dev/null 2>&1; then echo "HARNESS FAULT: stack did not start"; harness_fault=1; continue; fi
  docker compose exec -T runner sh -c 'mkdir -p /tmp/t && tar -xf - -C /tmp/t 2>/dev/null' < <(COPYFILE_DISABLE=1 tar -cf - -C "$stage" .)
  result="$(docker compose exec -T runner sh -c 'exec sh /tmp/t/run-wp.sh "$0" "$1"' "$wp" "$child_slug" 2>&1)"
  printf '%s\n' "$result" | grep -E '^(NOTE|HARNESS|CHECK fail) ' || true
  if printf '%s\n' "$result" | grep -q '^HARNESS '; then harness_fault=1; continue; fi
  if ! printf '%s\n' "$result" | grep -q '^DONE '; then echo "HARNESS FAULT: no DONE marker"; printf '%s\n' "$result" | tail -15; harness_fault=1; continue; fi
  printf '%s\n' "$result" | grep -q '^CHECK fail ' && product_fail=1
  echo "-- setup: $(printf '%s\n' "$result" | grep -c '^CHECK pass ') passed, $(printf '%s\n' "$result" | grep -c '^CHECK fail ') failed"

  if ! docker compose --profile browser up -d browser >/dev/null 2>&1; then echo "HARNESS FAULT: browser container did not start"; harness_fault=1; continue; fi
  docker compose exec -T browser sh -c 'rm -rf /work && mkdir -p /work && cd /work && tar -xf - 2>/dev/null' < <(COPYFILE_DISABLE=1 tar -cf - -C "$stage" browser.mjs node_modules vendor)
  bres="$(docker compose exec -T -e T0205_BROWSERS="$browsers" browser sh -c 'cd /work && node browser.mjs' 2>&1)"
  brc=$?
  dest="$out/wp-$wp-php-$php"; mkdir -p "$dest"
  printf '%s\n' "$bres" > "$dest/browser.log"
  printf '%s\n' "$bres" | grep -E '^(FAIL|NOTE|HARNESS) ' || true
  pass=$(printf '%s\n' "$bres" | grep -c '^PASS ' || true); failn=$(printf '%s\n' "$bres" | grep -c '^FAIL ' || true)
  echo "-- browser: $pass passed, $failn failed"
  if printf '%s\n' "$bres" | grep -q '^HARNESS '; then harness_fault=1
  elif ! printf '%s\n' "$bres" | grep -q '^DONE-BROWSER '; then echo "HARNESS FAULT: browser script ended without DONE-BROWSER (exit $brc)"; printf '%s\n' "$bres" | tail -25; harness_fault=1
  elif [[ $failn -ne 0 ]]; then product_fail=1; fi
  docker compose cp browser:/work/shots/. "$dest/" >/dev/null 2>&1 && echo "NOTE screenshots and report.json copied to $dest"

  # PHP notices, warnings and deprecations raised while the browser exercised the site.
  log="$(docker compose exec -T runner sh -c 'cat /tmp/debug.log 2>/dev/null' | grep -E 'PHP (Warning|Notice|Deprecated|Fatal|Parse)|WordPress database error|doing_it_wrong|_doing_it_wrong' | grep -v 'phar://' || true)"
  if [[ -n "$log" ]]; then echo "FAIL PHP/WordPress errors in debug.log:"; printf '%s\n' "$log" | sort | uniq -c | head -10; product_fail=1; else echo "PASS no PHP warnings, notices, deprecations or database errors in debug.log"; fi
done

if [[ $harness_fault -ne 0 ]]; then echo "RESULT: harness fault"; exit 2; fi
if [[ $product_fail -ne 0 ]]; then echo "RESULT: checks failed"; exit 1; fi
echo "RESULT: all checks passed"
