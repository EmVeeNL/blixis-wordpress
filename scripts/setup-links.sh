#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
wp_dir="${BLIXIS_WP_PATH:-$HOME/Sites/blixis}"
if [[ -d "$wp_dir" ]]; then
  wp_dir="$(cd "$wp_dir" && pwd -P)"
fi

if [[ ! -d "$wp_dir/wp-admin" || ! -d "$wp_dir/wp-content/themes" || ! -d "$wp_dir/wp-content/plugins" ]]; then
  printf 'WordPress installation not found at %s\n' "$wp_dir" >&2
  exit 1
fi

link_component() {
  local source="$1" target="$2"
  if [[ ! -d "$source" ]]; then
    printf 'Source directory missing: %s\n' "$source" >&2
    exit 1
  fi
  if [[ -L "$target" ]]; then
    if [[ -d "$target" && "$(realpath "$target")" == "$(realpath "$source")" ]]; then
      printf 'Already linked: %s\n' "$target"
      return
    fi
    printf 'Conflicting symlink: %s\n' "$target" >&2
    return
  fi
  if [[ -e "$target" ]]; then
    printf 'Existing content preserved: %s\n' "$target" >&2
    exit 1
  fi
  ln -s "$source" "$target"
  printf 'Linked %s -> %s\n' "$target" "$source"
}

link_component "$repo_dir/themes/blixis-base" "$wp_dir/wp-content/themes/blixis-base"
link_component "$repo_dir/plugins/blixis-blocks" "$wp_dir/wp-content/plugins/blixis-blocks"
