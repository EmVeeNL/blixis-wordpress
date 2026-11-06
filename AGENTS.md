# Repository guidance

This repository contains Blixis-owned source. The running site is `../blixis`. Preserve its Core, uploads, configuration, database, and existing themes. Never run `docker compose down -v`, reset Git history, or copy secrets into this repository. Work on a task branch from `main`; do not commit or push without authorization. Verify WordPress and Compose behavior after local integration changes.
