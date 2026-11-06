#!/usr/bin/env bash
# Runs the WordPress + PHP matrix in a throwaway Compose project and writes
# ../results/wordpress-matrix.jsonl. It cannot reach the local Blixis site.
set -euo pipefail
cd "$(dirname "$0")"
OUT="../results/wordpress-matrix.jsonl"
: > "$OUT"
export SPIKE_DB_ROOT_PASSWORD="$(openssl rand -hex 24)"
trap 'docker compose --profile run down --remove-orphans >/dev/null 2>&1 || true' EXIT

# wp_version php_minor expectation
COMBOS=(
  "7.1.4 8.5 pass" "7.1.4 8.4 pass" "7.1.4 8.3 pass" "7.1.4 8.2 pass"
  "7.0.8 8.5 pass" "7.0.8 8.4 pass" "7.0.8 8.3 pass" "7.0.8 8.2 pass"
  "6.9.11 8.4 pass" "6.9.11 8.2 pass"
  "6.6.11 8.3 pass" "6.6.11 8.2 pass"
  "7.1.4 8.1 reject" "6.5.8 8.2 reject"
)
if [ "$#" -gt 0 ]; then COMBOS=("$@"); fi

bundle() {
  COPYFILE_DISABLE=1 tar -cf - blixis-spike-plugin.php report.php run-combo.sh smoke.php \
    -C ../../../themes blixis-base -C ../plugins blixis-blocks
}

docker compose up -d --wait db >/dev/null
for combo in "${COMBOS[@]}"; do
  read -r wp php expect <<<"$combo"
  echo "== WordPress $wp, PHP $php, expect $expect" >&2
  export SPIKE_PHP="$php"
  line="$(bundle | docker compose --profile run run --rm --no-deps -T runner sh -c 'mkdir -p /tmp/spike && tar -xf - -C /tmp/spike && exec sh /tmp/spike/run-combo.sh "$0" "$1" "$2"' "$wp" "$expect" "$php" 2>&1 | tee /dev/stderr | sed -n 's/^COMBO_RESULT //p')" || true
  if [ -z "$line" ]; then line="{\"meta\":{\"wp\":\"$wp\",\"php\":\"$php\"},\"error\":\"no result\"}"; fi
  echo "$line" >> "$OUT"
done
