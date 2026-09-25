#!/usr/bin/env bash
# Uses the local container's own app credential without printing it.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose exec mysql sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" exec mysql -u "$MYSQL_USER" "$MYSQL_DATABASE"'
