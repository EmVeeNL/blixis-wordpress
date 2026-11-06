#!/bin/sh
# Runs inside the runner container: one WordPress + PHP combination.
# Prints a final COMBO_RESULT JSON line.
set -u
WP_VERSION="$1"
EXPECT="${2:-pass}" # pass, or reject when the Blixis headers should refuse this combination.
export R_REQUESTED_PHP="${3:-}"
DB="spike_$(printf '%s_%s' "$WP_VERSION" "$(php -r 'echo PHP_VERSION;')" | tr -c 'a-zA-Z0-9\n' '_')"
ROOT=/tmp/wp
# wp core download needs more than the default 128M to unpack recent releases.
mkdir -p /tmp/php-ini && echo 'memory_limit=1G' > /tmp/php-ini/spike.ini
export PHP_INI_SCAN_DIR=":/tmp/php-ini"
mkdir -p "$ROOT" /tmp/wp-cli-cache
cd "$ROOT" || exit 1

php -r '
$m = new mysqli("db", "root", getenv("SPIKE_DB_ROOT_PASSWORD"));
$m->query("DROP DATABASE IF EXISTS `" . $argv[1] . "`");
$m->query("CREATE DATABASE `" . $argv[1] . "` CHARACTER SET utf8mb4");
' "$DB" || exit 1

wp core download --version="$WP_VERSION" --quiet || { echo "COMBO_RESULT {\"error\":\"core download failed\"}"; exit 1; }
wp config create --dbname="$DB" --dbuser=root --dbpass="$SPIKE_DB_ROOT_PASSWORD" --dbhost=db --skip-check --quiet
wp config set WP_DEBUG true --raw --quiet
wp config set WP_DEBUG_LOG /tmp/debug.log --quiet
wp config set WP_DEBUG_DISPLAY false --raw --quiet
wp core install --url=http://127.0.0.1:8080 --title=Spike --admin_user=spike_admin --admin_email=admin@example.test --skip-email --quiet

cp -R /tmp/spike/blixis-base wp-content/themes/blixis-base
cp -R /tmp/spike/blixis-blocks wp-content/plugins/blixis-blocks

PLUGIN_OUT="$(wp plugin activate blixis-blocks 2>&1)"; PLUGIN_RC=$?
THEME_OUT="$(wp theme activate blixis-base 2>&1)"; THEME_RC=$?

export R_WP="$(wp core version)" R_EXPECT="$EXPECT" R_PLUGIN_RC="$PLUGIN_RC" R_PLUGIN_OUT="$PLUGIN_OUT" R_THEME_RC="$THEME_RC" R_THEME_OUT="$THEME_OUT"

if [ "$EXPECT" = "reject" ]; then
  php /tmp/spike/report.php
  exit 0
fi

wp server --host=127.0.0.1 --port=8080 >/tmp/server.log 2>&1 &
SERVER=$!
i=0; until wget -q -O /dev/null http://127.0.0.1:8080/ || [ $i -ge 30 ]; do i=$((i+1)); sleep 1; done
export R_HOME="$(wget -S -O /tmp/home.html http://127.0.0.1:8080/ 2>&1 | awk '/HTTP\//{print $2; exit}')"

# The preview test needs a theme that prints post content; Base has no full templates yet.
export R_THEME=""
for candidate in twentytwentyfive twentytwentyfour; do
  if [ -z "$R_THEME" ] && [ -d "wp-content/themes/$candidate" ]; then R_THEME="$candidate"; fi
done
wp theme activate "$R_THEME" --quiet
cp /tmp/spike/blixis-spike-plugin.php wp-content/plugins/blixis-spike-plugin.php
wp plugin activate blixis-spike-plugin --quiet

wp eval-file /tmp/spike/smoke.php >/tmp/smoke.out 2>/tmp/smoke.err
kill "$SERVER" 2>/dev/null

php /tmp/spike/report.php
