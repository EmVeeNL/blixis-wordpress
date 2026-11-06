#!/usr/bin/env bash
# Tests setup-links.sh against a temporary fake WordPress tree. It never touches a real site.
set -uo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
script="$repo_dir/scripts/setup-links.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
failures=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    printf 'pass %s\n' "$name"
  else
    printf 'FAIL %s (expected %s, got %s)\n' "$name" "$expected" "$actual"
    failures=$((failures + 1))
  fi
}

new_site() {
  local site="$work/$1"
  mkdir -p "$site/wp-admin" "$site/wp-content/themes" "$site/wp-content/plugins"
  printf '%s' "$site"
}

run() {
  BLIXIS_WP_PATH="$1" bash "$script" >"$work/out" 2>&1
  printf '%s' "$?"
}

site="$(new_site fresh)"
check 'creates links' 0 "$(run "$site")"
check 'theme link targets source' "$repo_dir/themes/blixis-base" "$(readlink "$site/wp-content/themes/blixis-base")"
check 'plugin link targets source' "$repo_dir/plugins/blixis-blocks" "$(readlink "$site/wp-content/plugins/blixis-blocks")"
check 'rerun succeeds' 0 "$(run "$site")"
check 'rerun reports existing links' 2 "$(grep -c '^Already linked' "$work/out")"

site="$(new_site conflict-link)"
ln -s "$work" "$site/wp-content/themes/blixis-base"
check 'conflicting symlink refused' 1 "$(run "$site")"
check 'conflicting symlink kept' "$work" "$(readlink "$site/wp-content/themes/blixis-base")"

site="$(new_site broken-link)"
ln -s "$work/missing" "$site/wp-content/plugins/blixis-blocks"
check 'broken symlink refused' 1 "$(run "$site")"
check 'broken symlink kept' "$work/missing" "$(readlink "$site/wp-content/plugins/blixis-blocks")"

site="$(new_site existing-content)"
mkdir -p "$site/wp-content/themes/blixis-base"
printf 'keep' > "$site/wp-content/themes/blixis-base/file"
check 'existing directory refused' 1 "$(run "$site")"
check 'existing content kept' keep "$(cat "$site/wp-content/themes/blixis-base/file")"

check 'missing WordPress refused' 1 "$(run "$work/not-wordpress")"

if ((failures > 0)); then
  printf '%s check(s) failed\n' "$failures"
  exit 1
fi
printf 'All link checks passed\n'
