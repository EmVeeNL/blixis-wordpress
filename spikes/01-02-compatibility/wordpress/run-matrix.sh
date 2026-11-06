#!/usr/bin/env bash
# Runs the WordPress + PHP matrix in a throwaway Compose project and writes
# ../results/wordpress-matrix.jsonl. It cannot reach the local Blixis site.
set -euo pipefail
cd "$(dirname "$0")"
OUT="${SPIKE_RESULTS:-../results/wordpress-matrix.jsonl}"
: > "$OUT"
SPIKE_DB_ROOT_PASSWORD="$(openssl rand -hex 24)"
export SPIKE_DB_ROOT_PASSWORD
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

cli_image() {
  local digest
  case "$1" in
    8.1) digest=ab5fb76caa861f32c21e1d95a057f52007f4af7130fb16a0f68874dabe0549a4 ;;
    8.2) digest=be56991798a70b0491f406f0a088ec3f12b5cb915ab6949dced0d9052861265b ;;
    8.3) digest=a4fff017eb08c03187e90fe52d4bff8d3a4d4a5103de05829a6e747c4ca3056e ;;
    8.4) digest=37b7e3ed9b537788756f9b5c6dd8ec7c3f3053ee707abc67c776e453ba8f9e55 ;;
    8.5) digest=d16fa67b450f61a8e16d738e502f29dd30daa08c5e7d2bc39a1e32ec29815aed ;;
    *) echo "No pinned WP-CLI image for PHP $1" >&2; return 1 ;;
  esac
  printf 'wordpress:cli-2.12.0-php%s@sha256:%s' "$1" "$digest"
}

bundle() {
  COPYFILE_DISABLE=1 tar -cf - blixis-spike-plugin.php report.php run-combo.sh smoke.php \
    -C ../../../themes blixis-base -C ../plugins blixis-blocks
}

SPIKE_CLI_IMAGE="$(cli_image 8.4)"
export SPIKE_CLI_IMAGE
docker compose up -d --wait db >/dev/null
failed=0
for combo in "${COMBOS[@]}"; do
  read -r wp php expect <<<"$combo"
  echo "== WordPress $wp, PHP $php, expect $expect" >&2
  SPIKE_CLI_IMAGE="$(cli_image "$php")"
  export SPIKE_CLI_IMAGE
  line="$(bundle | docker compose --profile run run --rm --no-deps -T runner sh -c 'mkdir -p /tmp/spike && tar -xf - -C /tmp/spike && exec sh /tmp/spike/run-combo.sh "$0" "$1" "$2"' "$wp" "$expect" "$php" 2>&1 | tee /dev/stderr | sed -n 's/^COMBO_RESULT //p')" || true
  if [ -z "$line" ]; then line="{\"meta\":{\"wp\":\"$wp\",\"php\":\"$php\"},\"error\":\"no result\"}"; failed=1; fi
  echo "$line" >> "$OUT"
done
exit "$failed"
