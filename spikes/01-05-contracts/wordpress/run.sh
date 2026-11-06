#!/usr/bin/env bash
# Usage: run.sh <document|tokens|api> [wp_version] [php_minor]
# Installs a disposable WordPress, activates every plugin file in <area>/wp/plugins,
# and runs <area>/wp/test.php with wp eval-file while a local server listens on
# 127.0.0.1:8080 inside the container. test.php must print a final line
# "CONTRACT_RESULT pass=<n> fail=<n>". It cannot reach the local Blixis site.
set -euo pipefail
AREA="${1:?area required}"
WP_VERSION="${2:-7.1.4}"
PHP_MINOR="${3:-8.4}"
cd "$(dirname "$0")"
[ -f "../$AREA/wp/test.php" ] || { echo "No $AREA/wp/test.php" >&2; exit 2; }

case "$PHP_MINOR" in
  8.3) digest=a4fff017eb08c03187e90fe52d4bff8d3a4d4a5103de05829a6e747c4ca3056e ;;
  8.4) digest=37b7e3ed9b537788756f9b5c6dd8ec7c3f3053ee707abc67c776e453ba8f9e55 ;;
  8.5) digest=d16fa67b450f61a8e16d738e502f29dd30daa08c5e7d2bc39a1e32ec29815aed ;;
  *) echo "No pinned WP-CLI image for PHP $PHP_MINOR" >&2; exit 2 ;;
esac
SPIKE_CLI_IMAGE="wordpress:cli-2.12.0-php${PHP_MINOR}@sha256:${digest}"
SPIKE_DB_ROOT_PASSWORD="$(openssl rand -hex 24)"
export SPIKE_CLI_IMAGE SPIKE_DB_ROOT_PASSWORD
PROJECT="blixis-contract-$AREA"
compose() { docker compose -p "$PROJECT" "$@"; }
trap 'compose --profile run down --remove-orphans >/dev/null 2>&1 || true' EXIT

compose up -d --wait db >/dev/null
OUTPUT="$(mktemp)"
COPYFILE_DISABLE=1 tar -cf - runner.sh -C "../$AREA" wp \
  | compose --profile run run --rm --no-deps -T runner \
    sh -c 'mkdir -p /tmp/contract && tar -xf - -C /tmp/contract && exec sh /tmp/contract/runner.sh "$0"' "$WP_VERSION" \
  2>&1 | tee "$OUTPUT"
result="$(sed -n 's/^CONTRACT_RESULT //p' "$OUTPUT" | tail -1)"
rm -f "$OUTPUT"
case "$result" in
  pass=[1-9]*" fail=0") echo "PASS $AREA WordPress $WP_VERSION PHP $PHP_MINOR: $result" ;;
  *) echo "FAIL $AREA WordPress $WP_VERSION PHP $PHP_MINOR: ${result:-no result}" >&2; exit 1 ;;
esac
