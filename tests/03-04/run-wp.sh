#!/bin/sh
# Runs inside the runner container for task 03-04: installs one WordPress + PHP combination,
# activates Blixis Base and Blixis Blocks, creates the fixture users, installs the nl_NL and ar
# language packs, installs fixture fonts, runs the in-process font checks, and starts the built-in server on
# 127.0.0.1:8080 (reachable only from this project's network namespace).
# Prints PASS/FAIL/NOTE/HARNESS lines and a final DONE marker. Args: wp_version.
set -u
WP_VERSION="$1"
fault() { echo "HARNESS $1"; exit 0; }
PHPV="$(php -r 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;')"
DB="t0304_$(printf '%s_%s' "$WP_VERSION" "$PHPV" | tr -c 'a-zA-Z0-9\n' '_')"
ROOT=/tmp/wp
mkdir -p /tmp/php-ini && echo 'memory_limit=1G' > /tmp/php-ini/t.ini
export PHP_INI_SCAN_DIR=":/tmp/php-ini"
mkdir -p "$ROOT" /tmp/wp-cli-cache
cd "$ROOT" || fault "no workdir"

# shellcheck disable=SC2016
php -r '
$m = new mysqli("db", "root", getenv("T0304_DB_ROOT_PASSWORD"));
$m->query("DROP DATABASE IF EXISTS `" . $argv[1] . "`");
$m->query("CREATE DATABASE `" . $argv[1] . "` CHARACTER SET utf8mb4");
' "$DB" || fault "database create failed"

wp core download --version="$WP_VERSION" --quiet >/dev/null 2>&1 || fault "core download failed"
wp config create --dbname="$DB" --dbuser=root --dbpass="$T0304_DB_ROOT_PASSWORD" --dbhost=db --skip-check --quiet >/dev/null 2>&1 || fault "config create failed"
wp config set WP_DEBUG true --raw --quiet >/dev/null 2>&1
wp config set WP_DEBUG_LOG /tmp/debug.log --quiet >/dev/null 2>&1
wp config set WP_DEBUG_DISPLAY false --raw --quiet >/dev/null 2>&1
wp core install --url=http://127.0.0.1:8080 --title=Fixture --admin_user=fixture_admin --admin_password="$T0304_ADMIN_PASSWORD" --admin_email=admin@example.test --skip-email --quiet >/dev/null 2>&1 || fault "core install failed"
wp language core install nl_NL ar --quiet >/dev/null 2>&1 || fault "language pack download failed (nl_NL, ar)"
# From here on the site needs no network: admin pages would otherwise wait on WordPress.org.
wp config set WP_HTTP_BLOCK_EXTERNAL true --raw --quiet >/dev/null 2>&1

cp -R /tmp/t/blixis-base wp-content/themes/blixis-base
cp -R /tmp/t/blixis-blocks wp-content/plugins/blixis-blocks
wp plugin activate blixis-blocks --quiet >/dev/null 2>&1 || fault "plugin activation failed"
wp theme activate blixis-base --quiet >/dev/null 2>&1 || fault "theme activation failed"
for spec in "fixture_admin2 administrator en_US" "fixture_nl administrator nl_NL" "fixture_ar administrator ar" "fixture_editor editor en_US" "fixture_subscriber subscriber en_US"; do
  # shellcheck disable=SC2086
  set -- $spec
  wp user create "$1" "$1@example.test" --role="$2" --user_pass="$T0304_ADMIN_PASSWORD" --quiet >/dev/null 2>&1 || fault "user $1 not created"
  [ "$3" = "en_US" ] || wp user meta update "$1" locale "$3" --quiet >/dev/null 2>&1 || fault "locale for $1 not set"
done

mkdir -p wp-content/mu-plugins && cp /tmp/t/fixtures/blixis-0304-proof.php wp-content/mu-plugins/
wp eval-file /tmp/t/check.php 2>&1 | grep -E '^(PASS|FAIL|NOTE|HARNESS) ' || fault "check.php produced no result"

# Browsers keep several connections open; enough workers keep one idle connection from blocking the next page.
PHP_CLI_SERVER_WORKERS=8 wp server --host=127.0.0.1 --port=8080 >/tmp/server.log 2>&1 &
i=0; until wget -q -O /dev/null http://127.0.0.1:8080/ || [ $i -ge 30 ]; do i=$((i+1)); sleep 1; done
[ $i -lt 30 ] || fault "built-in server did not answer"
echo "DONE $WP_VERSION"
