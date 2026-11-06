# 01-02 compatibility spike

Throwaway proof for [task 01-02](../../docs/roadmap/phases/01-discovery-foundation/02-compatibility-spike.md). It is not product code. Its checks run in [CI](../../docs/development/CI.md) because it is real TypeScript and test code. Since task 01-03 its frontend is the first pnpm workspace package, because it is the only TypeScript source so far. The conclusions are in the [support matrix](../../docs/development/SUPPORT_MATRIX.md); raw results are in [`results/`](results/).

## Safety

The WordPress tests use their own Compose project, `blixis-compat-spike`. The database is in tmpfs, no port is published, there are no bind mounts or named volumes, and nothing reads `~/Sites/blixis`. Test files reach the container as a tar stream. The script stops the stack with a plain `down`.

## Reproduce

Environment used: macOS 27.0.1 on arm64, Docker Desktop, Node 26.13.0, on 2026-11-06.

```bash
# WordPress and PHP matrix (about 5 minutes)
spikes/01-02-compatibility/wordpress/run-matrix.sh
python3 spikes/01-02-compatibility/results/show.py

# Frontend, from the repository root
pnpm install --frozen-lockfile
cd spikes/01-02-compatibility/frontend
pnpm run build             # tsc, Tailwind build, Tailwind assertions, Vite build
pnpm run licenses
PLAYWRIGHT_BROWSERS_PATH="$(mktemp -d)" pnpm exec playwright install chromium firefox webkit
PLAYWRIGHT_BROWSERS_PATH="<same directory>" pnpm exec playwright test --repeat-each=3
./run-node-matrix.sh
```

The browser run needs Google Chrome installed for the `chrome-installed` project. The 01-02 results were first produced with npm; task 01-03 reran the frontend build, licenses, one browser pass, and the Node matrix with pnpm.

## What the WordPress smoke test covers

Each supported combination runs 37 checks against a throwaway plugin: byte-exact document round trips, 1 MiB documents, anonymous and lower-privilege denial, invalid JSON, generic REST exposure, revision creation and restore, autosave, cookie and nonce handling over real HTTP, and draft preview access. It also activates `blixis-base` and `blixis-blocks` from this repository. Two combinations below the declared minimums must be refused.
