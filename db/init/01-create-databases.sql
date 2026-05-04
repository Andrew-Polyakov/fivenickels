-- Provisions the two app databases used by the trades project.
-- Runs automatically on the first boot of the `trades-postgres` container
-- (postgres:16-alpine mounts /docker-entrypoint-initdb.d/*.sql on an empty
-- data volume). If `trades_pgdata` already contains data, wipe it first with
-- `docker compose down -v` before bringing the stack back up.

CREATE DATABASE wagtail OWNER trades;
CREATE DATABASE crawler OWNER trades;
