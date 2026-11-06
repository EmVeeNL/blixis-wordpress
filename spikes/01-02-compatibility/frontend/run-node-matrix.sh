#!/usr/bin/env bash
# Builds this proof in clean Node containers and writes ../results/node-matrix.txt.
# Files are piped in as a tar stream, so nothing is written back to the checkout.
# The workspace pins Node 26; engine checks are off here to measure other versions.
set -uo pipefail
cd "$(dirname "$0")" || exit 1
OUT="../results/node-matrix.txt"
SPIKE=spikes/01-02-compatibility/frontend
: > "$OUT"
for image in node:26.13.0-slim node:24.22.2-slim node:22.23.4-slim node:20.20.0-slim node:18.20.8-slim; do
  log="$(cd ../../.. && COPYFILE_DISABLE=1 tar -cf - package.json pnpm-lock.yaml pnpm-workspace.yaml "$SPIKE" |
    docker run --rm -i "$image" sh -c "mkdir /w && cd /w && tar -xf - && npx --yes pnpm@12.18.0 install --frozen-lockfile --config.engine-strict=false && cd $SPIKE && npx --yes pnpm@12.18.0 run build" 2>&1)"
  rc=$?
  echo "$image exit=$rc | $(echo "$log" | grep -E 'node v[0-9]|built in|FAIL|EBADENGINE|Unsupported|requires Node|ERR_|SyntaxError|Error:' | head -4 | tr '\n' ' ' | cut -c1-300)" | tee -a "$OUT"
done
