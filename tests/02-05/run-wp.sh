#!/bin/sh
# Runs inside the runner container. Installs one WordPress + PHP combination, proves Base alone
# renders neutrally, then activates the child with Base as parent and seeds content.
# Prints CHECK pass|fail <name> lines, NOTE/HARNESS lines, and a final DONE marker.
# Args: wp_version child_slug.
set -u
WP_VERSION="$1"; CHILD="$2"
fault() { echo "HARNESS $1"; exit 0; }
chk() { if [ "$1" = 0 ]; then echo "CHECK pass $2"; else echo "CHECK fail $2 -- $3"; fi; }
PHPV="$(php -r 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;')"
DB="t0205_$(printf '%s_%s' "$WP_VERSION" "$PHPV" | tr -c 'a-zA-Z0-9\n' '_')"
ROOT=/tmp/wp
mkdir -p /tmp/php-ini && echo 'memory_limit=1G' > /tmp/php-ini/t.ini
export PHP_INI_SCAN_DIR=":/tmp/php-ini"
mkdir -p "$ROOT" /tmp/wp-cli-cache; cd "$ROOT" || fault "no workdir"
# shellcheck disable=SC2016
php -r '$m = new mysqli("db", "root", getenv("T0205_DB_ROOT_PASSWORD")); $m->query("DROP DATABASE IF EXISTS `" . $argv[1] . "`"); $m->query("CREATE DATABASE `" . $argv[1] . "` CHARACTER SET utf8mb4");' "$DB" || fault "database create failed"
wp core download --version="$WP_VERSION" --quiet >/dev/null 2>&1 || fault "core download failed"
wp config create --dbname="$DB" --dbuser=root --dbpass="$T0205_DB_ROOT_PASSWORD" --dbhost=db --skip-check --quiet >/dev/null 2>&1 || fault "config create failed"
wp config set WP_DEBUG true --raw --quiet >/dev/null 2>&1
wp config set WP_DEBUG_LOG /tmp/debug.log --quiet >/dev/null 2>&1
wp config set WP_DEBUG_DISPLAY false --raw --quiet >/dev/null 2>&1
wp core install --url=http://127.0.0.1:8080 --title=Fixture --admin_user=fixture_admin --admin_password="$T0205_ADMIN_PASSWORD" --admin_email=admin@example.test --skip-email --quiet >/dev/null 2>&1 || fault "core install failed"

cp -R /tmp/t/blixis-base wp-content/themes/blixis-base
# Test-only switch so one browser run can render Base alone (?t0205_theme=blixis-base) for its screenshot.
mkdir -p wp-content/mu-plugins
cat > wp-content/mu-plugins/t0205-theme-switch.php <<'EOP'
<?php
foreach ( array( 'stylesheet', 'template' ) as $t0205_option ) {
	add_filter( "pre_option_$t0205_option", static fn( $value ) => ( isset( $_GET['t0205_theme'] ) && 'blixis-base' === $_GET['t0205_theme'] ) ? 'blixis-base' : $value );
}
EOP
BASE_SUM_BEFORE="$(cd wp-content/themes/blixis-base && find . -type f | sort | xargs sha256sum | sha256sum)"
wp theme activate blixis-base --quiet >/dev/null 2>&1 || fault "Base activation failed"
PHP_CLI_SERVER_WORKERS=4 wp server --host=127.0.0.1 --port=8080 >/tmp/server.log 2>&1 &
i=0; until wget -q -O /tmp/base-front.html http://127.0.0.1:8080/ || [ $i -ge 30 ]; do i=$((i+1)); sleep 1; done
[ $i -lt 30 ] || fault "built-in server did not answer"

# Brand-neutrality of the parent when used alone.
NAME="$(cat /tmp/t/child-name.txt)"
if grep -qiF -e "$NAME" -e "$CHILD" /tmp/base-front.html; then result=1; else result=0; fi; chk "$result" "Base alone renders without any child branding" "front page mentions $CHILD"
if [ "$(grep -c '<main' /tmp/base-front.html)" = 1 ]; then result=0; else result=1; fi; chk "$result" "Base alone renders exactly one main" "main count differs"
if grep -qiE 'fonts\.(googleapis|gstatic)|https?://[^"]*\.(woff2?|ttf)' /tmp/base-front.html; then result=1; else result=0; fi; chk "$result" "Base alone loads no webfonts" "webfont reference found"

# Child with Base as parent.
cp -R "/tmp/t/child" "wp-content/themes/$CHILD"
wp theme is-installed "$CHILD" >/dev/null 2>&1; result=$?; chk "$result" "child theme is detected by WordPress" "wp theme is-installed failed"
ERRS="$(wp eval "echo wp_get_theme( '$CHILD' )->errors() ? 'broken' : 'ok';" 2>/dev/null)"; if [ "$ERRS" = ok ]; then result=0; else result=1; fi; chk "$result" "WordPress reports no theme errors for the child" "$ERRS"
wp theme activate "$CHILD" >/tmp/act.log 2>&1 || { cat /tmp/act.log; fault "child activation failed"; }
if [ "$(wp eval 'echo get_stylesheet() . "|" . get_template();' 2>/dev/null)" = "$CHILD|blixis-base" ]; then result=0; else result=1; fi; chk "$result" "child activates with blixis-base as its parent" "$(wp eval 'echo get_stylesheet() . "|" . get_template();' 2>/dev/null)"
if [ "$(wp eval 'echo wp_is_block_theme() ? 1 : 0;' 2>/dev/null)" = 1 ]; then result=0; else result=1; fi; chk "$result" "child is a block theme" "not a block theme"
wp eval-file /tmp/t/seed.php 2>&1 | grep -E '^(NOTE|HARNESS) ' || fault "seed produced no result"

BASE_SUM_AFTER="$(cd wp-content/themes/blixis-base && find . -type f | sort | xargs sha256sum | sha256sum)"
if [ "$BASE_SUM_BEFORE" = "$BASE_SUM_AFTER" ]; then result=0; else result=1; fi; chk "$result" "Base files are byte-identical after child activation and seeding" "Base changed on disk"
wget -q -O /tmp/child-front.html http://127.0.0.1:8080/ || fault "child front page did not answer"
echo "DONE $WP_VERSION"
