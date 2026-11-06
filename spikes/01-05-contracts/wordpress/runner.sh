#!/bin/sh
# Runs inside the disposable runner container.
set -u
WP_VERSION="$1"
ROOT=/tmp/wp
mkdir -p /tmp/php-ini && echo 'memory_limit=1G' > /tmp/php-ini/contract.ini
export PHP_INI_SCAN_DIR=":/tmp/php-ini"
mkdir -p "$ROOT" /tmp/wp-cli-cache
cd "$ROOT" || exit 1

# shellcheck disable=SC2016 # The single quotes hold PHP code, not shell.
php -r '
$m = new mysqli("db", "root", getenv("SPIKE_DB_ROOT_PASSWORD"));
$m->query("DROP DATABASE IF EXISTS contract");
$m->query("CREATE DATABASE contract CHARACTER SET utf8mb4");
' || exit 1

wp core download --version="$WP_VERSION" --quiet || exit 1
wp config create --dbname=contract --dbuser=root --dbpass="$SPIKE_DB_ROOT_PASSWORD" --dbhost=db --skip-check --quiet || exit 1
wp config set WP_DEBUG true --raw --quiet
wp config set WP_DEBUG_LOG /tmp/debug.log --quiet
wp config set WP_DEBUG_DISPLAY false --raw --quiet
wp core install --url=http://127.0.0.1:8080 --title=Contract --admin_user=contract_admin --admin_email=admin@example.test --skip-email --quiet || exit 1

if [ -d /tmp/contract/wp/plugins ]; then
  cp -R /tmp/contract/wp/plugins/. wp-content/plugins/
  for plugin in /tmp/contract/wp/plugins/*.php; do
    [ -f "$plugin" ] || continue
    wp plugin activate "$(basename "$plugin" .php)" --quiet || exit 1
  done
fi

wp server --host=127.0.0.1 --port=8080 >/tmp/server.log 2>&1 &
SERVER=$!
i=0; until wget -q -O /dev/null http://127.0.0.1:8080/ || [ $i -ge 30 ]; do i=$((i+1)); sleep 1; done

wp eval-file /tmp/contract/wp/test.php
kill "$SERVER" 2>/dev/null
if [ -s /tmp/debug.log ]; then echo "--- debug.log"; tail -40 /tmp/debug.log; fi
