# Configuration

The installed site reads `~/Sites/blixis/wp-config.php`; keep it and `~/Sites/blixis/.env` out of Git. The current database is MariaDB 11.4 at `127.0.0.1:3307` and uses a Docker named volume. Do not change credentials in the repository to match local values.

`compose.yaml` contains variable references, not passwords. For the existing installation, inspect the effective configuration without printing secrets using `docker compose --env-file ../blixis/.env -f compose.yaml config --quiet`. To check service health use `docker compose --env-file ../blixis/.env -f compose.yaml ps`. Do not use `down -v`.

For a fresh installation, copy `.env.example` to `.env`, choose distinct passwords, and run `docker compose up -d` only after checking the intended project and volume. The Compose project name is fixed to `blixis`; do not run a second Blixis instance on the same machine with this file.

The existing database backup taken before restructuring is stored outside Git in `~/Sites/.blixis-backups/`. For a fresh backup, use `docker exec blixis-mariadb sh -c 'exec mariadb-dump -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"' > /path/outside/repo/backup.sql` and verify its size and tables. Restore only after checking the target database and taking another backup.
