#!/bin/sh
# Runs inside the runner container: one WordPress + PHP combination.
# Prints PASS/FAIL/HARNESS lines and a final DONE marker. Args: wp_version expectation.
set -u
WP_VERSION="$1"
EXPECT="${2:-pass}"
fault() { echo "HARNESS $1"; exit 0; }
ok() { echo "PASS [$WP_VERSION php$PHPV] $1"; }
bad() { echo "FAIL [$WP_VERSION php$PHPV] $1${2:+ -- $2}"; }
PHPV="$(php -r 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;')"
DB="t0201_$(printf '%s_%s' "$WP_VERSION" "$PHPV" | tr -c 'a-zA-Z0-9\n' '_')"
ROOT=/tmp/wp
mkdir -p /tmp/php-ini && echo 'memory_limit=1G' > /tmp/php-ini/t.ini
export PHP_INI_SCAN_DIR=":/tmp/php-ini"
mkdir -p "$ROOT" /tmp/wp-cli-cache
cd "$ROOT" || fault "no workdir"

# PHP variables must reach PHP unchanged.
# shellcheck disable=SC2016
php -r '
$m = new mysqli("db", "root", getenv("T0201_DB_ROOT_PASSWORD"));
$m->query("DROP DATABASE IF EXISTS `" . $argv[1] . "`");
$m->query("CREATE DATABASE `" . $argv[1] . "` CHARACTER SET utf8mb4");
' "$DB" || fault "database create failed"

wp core download --version="$WP_VERSION" --quiet >/dev/null 2>&1 || fault "core download failed"
wp config create --dbname="$DB" --dbuser=root --dbpass="$T0201_DB_ROOT_PASSWORD" --dbhost=db --skip-check --quiet >/dev/null 2>&1 || fault "config create failed"
wp config set WP_DEBUG true --raw --quiet >/dev/null 2>&1
wp config set WP_DEBUG_LOG /tmp/debug.log --quiet >/dev/null 2>&1
wp config set WP_DEBUG_DISPLAY false --raw --quiet >/dev/null 2>&1
wp core install --url=http://127.0.0.1:8080 --title=Fixture --admin_user=fixture_admin --admin_email=admin@example.test --skip-email --quiet >/dev/null 2>&1 || fault "core install failed"

cp -R /tmp/t/blixis-base wp-content/themes/blixis-base
cp -R /tmp/t/blixis-blocks wp-content/plugins/blixis-blocks

PLUGIN_OUT="$(wp plugin activate blixis-blocks 2>&1)"; PLUGIN_RC=$?
THEME_OUT="$(wp theme activate blixis-base 2>&1)"; THEME_RC=$?

if [ "$EXPECT" = "reject" ]; then
  # Below the approved floors, both must refuse and leave nothing active.
  if [ "$PLUGIN_RC" -ne 0 ]; then ok "plugin refuses activation below floor"; else bad "plugin refuses activation below floor" "$PLUGIN_OUT"; fi
  if [ "$THEME_RC" -ne 0 ]; then ok "theme refuses activation below floor"; else bad "theme refuses activation below floor" "$THEME_OUT"; fi
  if [ "$(wp theme list --status=active --field=name 2>/dev/null)" != "blixis-base" ]; then ok "theme not active after refusal"; else bad "theme not active after refusal"; fi
  if ! wp plugin list --status=active --field=name 2>/dev/null | grep -q '^blixis-blocks$'; then ok "plugin not active after refusal"; else bad "plugin not active after refusal"; fi
  echo "DONE $WP_VERSION"
  exit 0
fi

if [ "$PLUGIN_RC" -eq 0 ]; then ok "plugin activates"; else bad "plugin activates" "$PLUGIN_OUT"; fi
if [ "$THEME_RC" -eq 0 ]; then ok "theme activates"; else bad "theme activates" "$THEME_OUT"; fi

wp server --host=127.0.0.1 --port=8080 >/tmp/server.log 2>&1 &
SERVER=$!
i=0; until wget -q -O /dev/null http://127.0.0.1:8080/ || [ $i -ge 30 ]; do i=$((i+1)); sleep 1; done
[ $i -lt 30 ] || fault "built-in server did not answer"

export T0201_EXPECT_THEME_RC="$THEME_RC" T0201_EXPECT_PLUGIN_RC="$PLUGIN_RC" T0201_PHP="$PHPV" T0201_WP="$WP_VERSION"
wp eval-file /tmp/t/check.php >/tmp/check.out 2>/tmp/check.err
RC=$?
kill "$SERVER" 2>/dev/null
grep -E '^(PASS|FAIL) ' /tmp/check.out
[ "$RC" -eq 0 ] || fault "check.php exited $RC: $(head -c 400 /tmp/check.err)"
echo "DONE $WP_VERSION"
