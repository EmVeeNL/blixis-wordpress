# 01-05 contract spike

Throwaway proofs for [task 01-05](../../docs/roadmap/phases/01-discovery-foundation/05-architecture-contracts.md). It is not product code. Task packages replace it when they implement these contracts.

`wordpress/run.sh <area>` runs an area's checks in a disposable WordPress with its own Compose project, a tmpfs database, no published port, and no bind mounts. It never reads `~/Sites/blixis`. It stops the stack with a plain `down`.
