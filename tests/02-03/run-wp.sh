#!/bin/sh
# Runs inside the runner container: installs one WordPress + PHP combination, activates
# the Base theme and plugin, starts the built-in server on 127.0.0.1:8080 (reachable only
# from this container's network namespace) and runs check.php. Prints PASS/FAIL/NOTE,
# HARNESS lines for faults, and a final DONE marker. Args: wp_version.
set -u
WP_VERSION="$1"
fault() { echo "HARNESS $1"; exit 0; }
PHPV="$(php -r 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;')"
DB="t0203_$(printf '%s_%s' "$WP_VERSION" "$PHPV" | tr -c 'a-zA-Z0-9\n' '_')"
ROOT=/tmp/wp
mkdir -p /tmp/php-ini && echo 'memory_limit=1G' > /tmp/php-ini/t.ini
export PHP_INI_SCAN_DIR=":/tmp/php-ini"
mkdir -p "$ROOT" /tmp/wp-cli-cache
cd "$ROOT" || fault "no workdir"

# shellcheck disable=SC2016
php -r '
$m = new mysqli("db", "root", getenv("T0203_DB_ROOT_PASSWORD"));
$m->query("DROP DATABASE IF EXISTS `" . $argv[1] . "`");
$m->query("CREATE DATABASE `" . $argv[1] . "` CHARACTER SET utf8mb4");
' "$DB" || fault "database create failed"

wp core download --version="$WP_VERSION" --quiet >/dev/null 2>&1 || fault "core download failed"
wp config create --dbname="$DB" --dbuser=root --dbpass="$T0203_DB_ROOT_PASSWORD" --dbhost=db --skip-check --quiet >/dev/null 2>&1 || fault "config create failed"
wp config set WP_DEBUG true --raw --quiet >/dev/null 2>&1
wp config set WP_DEBUG_LOG /tmp/debug.log --quiet >/dev/null 2>&1
wp config set WP_DEBUG_DISPLAY false --raw --quiet >/dev/null 2>&1
wp core install --url=http://127.0.0.1:8080 --title=Fixture --admin_user=fixture_admin --admin_password=fixture-pass-0203 --admin_email=admin@example.test --skip-email --quiet >/dev/null 2>&1 || fault "core install failed" # gitleaks:allow -- public disposable fixture login, never a real credential

cp -R /tmp/t/blixis-base wp-content/themes/blixis-base
cp -R /tmp/t/blixis-blocks wp-content/plugins/blixis-blocks
mkdir -p wp-content/mu-plugins
cp /tmp/t/fixtures/blixis-0203-proof.php wp-content/mu-plugins/
wp plugin activate blixis-blocks --quiet >/dev/null 2>&1 || fault "plugin activation failed"
wp theme activate blixis-base --quiet >/dev/null 2>&1 || fault "theme activation failed"

wp server --host=127.0.0.1 --port=8080 >/tmp/server.log 2>&1 &
i=0; until wget -q -O /dev/null http://127.0.0.1:8080/ || [ $i -ge 30 ]; do i=$((i+1)); sleep 1; done
[ $i -lt 30 ] || fault "built-in server did not answer"

T0203_WP="$WP_VERSION" wp eval-file /tmp/t/check.php >/tmp/check.out 2>/tmp/check.err
RC=$?
grep -E '^(PASS|FAIL|NOTE) ' /tmp/check.out
grep -q '^DONE-CHECK ' /tmp/check.out || fault "check.php produced no DONE-CHECK (rc $RC): $(head -c 600 /tmp/check.err)"
if [ -s /tmp/debug.log ]; then
  echo "NOTE debug.log: $(head -c 400 /tmp/debug.log | tr '\n' ' ')"
  sed -n 312,319p wp-includes/block-editor.php | sed 's/^/NOTE core: /'
fi
echo "DONE $WP_VERSION"
# Keep the server for the browser stage when requested.
if [ -n "${T0203_KEEP_SERVER:-}" ]; then exit 0; fi
kill %1 2>/dev/null
