#!/usr/bin/env bash
# Builds this proof in clean Node containers and writes ../results/node-matrix.txt.
# Files are piped in as a tar stream, so nothing is written back to the checkout.
set -uo pipefail
cd "$(dirname "$0")"
OUT="../results/node-matrix.txt"
: > "$OUT"
for image in node:26.13.0-slim node:24.22.2-slim node:22.23.4-slim node:20.20.0-slim node:18.20.8-slim; do
  log="$(COPYFILE_DISABLE=1 tar -cf - package.json package-lock.json tsconfig.json vite.config.ts playwright.config.ts index.html src tests |
    docker run --rm -i --network bridge "$image" sh -c 'mkdir /w && cd /w && tar -xf - && npm ci --ignore-scripts --no-audit --no-fund && npm run build' 2>&1)"
  rc=$?
  echo "$image exit=$rc | $(echo "$log" | grep -E 'node v[0-9]|built in|FAIL|EBADENGINE|Unsupported|requires Node|ERR_|SyntaxError|Error:' | head -4 | tr '\n' ' ' | cut -c1-300)" | tee -a "$OUT"
done
