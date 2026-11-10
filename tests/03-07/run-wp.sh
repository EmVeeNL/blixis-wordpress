#!/bin/sh
# Runs inside the runner container for task 03-07: installs one WordPress + PHP combination,
# activates Blixis Base and Blixis Blocks, creates the fixture users, installs the nl_NL and ar
# language packs, creates and activates a child theme, and starts the built-in server on
# 127.0.0.1:8080 (reachable only from this project's network namespace).
# Prints PASS/FAIL/NOTE/HARNESS lines and a final DONE marker. Args: wp_version.
set -u
WP_VERSION="$1"
fault() { echo "HARNESS $1"; exit 0; }
PHPV="$(php -r 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;')"
DB="t0307_$(printf '%s_%s' "$WP_VERSION" "$PHPV" | tr -c 'a-zA-Z0-9\n' '_')"
ROOT=/tmp/wp
mkdir -p /tmp/php-ini && echo 'memory_limit=1G' > /tmp/php-ini/t.ini
export PHP_INI_SCAN_DIR=":/tmp/php-ini"
mkdir -p "$ROOT" /tmp/wp-cli-cache
cd "$ROOT" || fault "no workdir"

# shellcheck disable=SC2016
php -r '
$m = new mysqli("db", "root", getenv("T0307_DB_ROOT_PASSWORD"));
$m->query("DROP DATABASE IF EXISTS `" . $argv[1] . "`");
$m->query("CREATE DATABASE `" . $argv[1] . "` CHARACTER SET utf8mb4");
' "$DB" || fault "database create failed"

wp core download --version="$WP_VERSION" --quiet >/dev/null 2>&1 || fault "core download failed"
wp config create --dbname="$DB" --dbuser=root --dbpass="$T0307_DB_ROOT_PASSWORD" --dbhost=db --skip-check --quiet >/dev/null 2>&1 || fault "config create failed"
wp config set WP_DEBUG true --raw --quiet >/dev/null 2>&1
wp config set WP_DEBUG_LOG /tmp/debug.log --quiet >/dev/null 2>&1
wp config set WP_DEBUG_DISPLAY false --raw --quiet >/dev/null 2>&1
wp core install --url=http://127.0.0.1:8080 --title=Fixture --admin_user=fixture_admin --admin_password="$T0307_ADMIN_PASSWORD" --admin_email=admin@example.test --skip-email --quiet >/dev/null 2>&1 || fault "core install failed"
wp language core install nl_NL ar --quiet >/dev/null 2>&1 || fault "language pack download failed (nl_NL, ar)"
# From here on the site needs no network: admin pages would otherwise wait on WordPress.org.
wp config set WP_HTTP_BLOCK_EXTERNAL true --raw --quiet >/dev/null 2>&1

cp -R /tmp/t/blixis-base wp-content/themes/blixis-base
cp -R /tmp/t/blixis-blocks wp-content/plugins/blixis-blocks
wp plugin activate blixis-blocks --quiet >/dev/null 2>&1 || fault "plugin activation failed"
wp theme activate blixis-base --quiet >/dev/null 2>&1 || fault "theme activation failed"
mkdir -p wp-content/mu-plugins
cat > wp-content/mu-plugins/t0307-unconfigured-capture.php <<'PHP'
<?php
if ( isset( $_GET['t0307_no_tokens'] ) && '1' === $_GET['t0307_no_tokens'] ) {
	add_action(
		'plugins_loaded',
		static function (): void {
			remove_filter( 'wp_theme_json_data_theme', 'Blixis\\Blocks\\Tokens\\filter_theme_json', 20 );
			remove_filter( 'wp_theme_json_data_user', 'Blixis\\Blocks\\Tokens\\filter_user_theme_json', 20 );
			remove_action( 'wp_enqueue_scripts', 'Blixis\\Blocks\\Tokens\\enqueue_tokens', 20 );
			remove_action( 'enqueue_block_assets', 'Blixis\\Blocks\\Tokens\\enqueue_tokens', 20 );
		},
		100
	);
}
PHP
for spec in "fixture_admin2 administrator en_US" "fixture_nl administrator nl_NL" "fixture_ar administrator ar" "fixture_editor editor en_US" "fixture_subscriber subscriber en_US"; do
  # shellcheck disable=SC2086
  set -- $spec
  wp user create "$1" "$1@example.test" --role="$2" --user_pass="$T0307_ADMIN_PASSWORD" --quiet >/dev/null 2>&1 || fault "user $1 not created"
  [ "$3" = "en_US" ] || wp user meta update "$1" locale "$3" --quiet >/dev/null 2>&1 || fault "locale for $1 not set"
done

# One child theme, active, for the wizard to configure.
# shellcheck disable=SC2016 # PHP code for wp eval; nothing should expand.
wp eval '
$created = Blixis\Blocks\ChildTheme\create( array( "name" => "Acme Site", "slug" => "acme-site", "layout" => "blog" ) );
if ( is_wp_error( $created ) ) { fwrite( STDERR, $created->get_error_message() ); exit( 1 ); }
switch_theme( "acme-site" );
echo "PASS fixture child theme\n";
' 2>&1 | grep -E '^(PASS|FAIL|NOTE|HARNESS) ' || fault "child theme not created"

# Allow the browser harness to select each generated layout in this disposable fixture only.
cat > wp-content/mu-plugins/t0307-layout-selector.php <<'PHP'
<?php
if (isset($_GET['t0307_layout']) && in_array($_GET['t0307_layout'], array('blank','business','portfolio','blog','landing'), true)) {
    add_action('plugins_loaded', static function (): void { switch_theme('layout-' . sanitize_key($_GET['t0307_layout'])); }, 0);
}
if (isset($_GET['t0307_locale']) && in_array($_GET['t0307_locale'], array('nl_NL','ar'), true)) {
    $t0307_locale = $_GET['t0307_locale'];
    add_filter('pre_option_WPLANG', static fn() => $t0307_locale);
    add_action('plugins_loaded', static function () use ($t0307_locale): void { switch_to_locale($t0307_locale); }, 1);
}
PHP
# Create one theme for every layout through the real authenticated REST route.
# shellcheck disable=SC2016 # PHP is literal source passed to wp eval.
wp eval '
wp_set_current_user(get_user_by("login", "fixture_admin")->ID);
$layouts = array("blank", "business", "portfolio", "blog", "landing");
foreach ($layouts as $layout) {
  $request = new WP_REST_Request("POST", "/blixis-editor/v1/child-themes");
  $request->set_header("X-WP-Nonce", wp_create_nonce("wp_rest"));
  $request->set_header("Content-Type", "application/json");
  $request->set_body(wp_json_encode(array("name"=>"Layout " . ucfirst($layout), "slug"=>"layout-".$layout, "layout"=>$layout)));
  $response = rest_do_request($request);
  if (201 !== $response->get_status()) { echo "FAIL REST layout {$layout} status " . $response->get_status() . " " . wp_json_encode($response->get_data()) . "\n"; continue; }
  echo "PASS REST layout {$layout}\n";
  $theme = get_theme_root() . "/layout-{$layout}";
  if ("blank" === $layout) { if (!is_file($theme . "/templates/front-page.html")) echo "PASS blank inherits Base front page\n"; else echo "FAIL blank unexpectedly writes front page\n"; continue; }
  $pattern_files = glob($theme . "/patterns/*.php");
  $pattern = implode("\n", array_map(static fn($path) => (string) file_get_contents($path), $pattern_files ?: array()));
  $template = (string) file_get_contents($theme . "/templates/front-page.html");
  if (count($pattern_files ?: array()) > 0 && str_contains($pattern, "var:preset|color|") && !preg_match("/(?:wp:image|<img\\b|https?:\\/\\/)/i", $pattern)) echo "PASS editable token-based core pattern {$layout}\n"; else echo "FAIL layout content policy {$layout}\n";
  if (str_contains($template, "layout-{$layout}/{$layout}")) echo "PASS front-page selects {$layout} pattern\n"; else echo "FAIL front-page pattern {$layout}\n";
}
$legacy = new WP_REST_Request("POST", "/blixis-editor/v1/child-themes");
$legacy->set_header("X-WP-Nonce", wp_create_nonce("wp_rest"));
$legacy->set_header("Content-Type", "application/json");
$legacy->set_body(wp_json_encode(array("name"=>"Legacy Neutral", "slug"=>"legacy-neutral", "starter"=>"neutral")));
$legacy_response = rest_do_request($legacy);
if ($legacy_response->get_status() === 201 && is_file(get_theme_root() . "/legacy-neutral/templates/front-page.html") && !is_file(get_theme_root() . "/legacy-neutral/patterns/intro.php")) echo "PASS REST starter compatibility\n"; else echo "FAIL REST starter compatibility\n";
$conflict_request = new WP_REST_Request("POST", "/blixis-editor/v1/child-themes");
$conflict_request->set_header("X-WP-Nonce", wp_create_nonce("wp_rest"));
$conflict_request->set_header("Content-Type", "application/json");
$conflict_request->set_body(wp_json_encode(array("name"=>"Conflict", "slug"=>"layout-conflict", "starter"=>"none", "layout"=>"blog")));
$conflict_response = rest_do_request($conflict_request);
if ($conflict_response->get_status() === 400 && in_array("conflicts_with_starter", array_column($conflict_response->get_data()["data"]["errors"] ?? array(), "code"), true)) echo "PASS REST starter conflict refusal\n"; else echo "FAIL REST starter conflict refusal\n";
foreach (array("none"=>"blank", "neutral"=>"business") as $starter=>$expected) {
  $checked=Blixis\Blocks\ChildTheme\validate(array("name"=>"Legacy", "slug"=>"legacy-site", "starter"=>$starter));
  if (!$checked["errors"] && $checked["values"]["layout"] === $expected) echo "PASS starter {$starter}\n"; else echo "FAIL starter {$starter}\n";
}
$conflict=Blixis\Blocks\ChildTheme\validate(array("name"=>"Legacy", "slug"=>"legacy-site", "starter"=>"none", "layout"=>"blog"));
if (in_array("conflicts_with_starter", array_column($conflict["errors"], "code"), true)) echo "PASS starter conflict\n"; else echo "FAIL starter conflict\n";
$business = Blixis\Blocks\ChildTheme\build_files(array("name"=>"Alias", "slug"=>"same-alias", "version"=>"0.1.0", "layout"=>"business"));
$neutral = Blixis\Blocks\ChildTheme\build_files(array("name"=>"Alias", "slug"=>"same-alias", "version"=>"0.1.0", "layout"=>"business", "starter"=>"neutral"));
if ($business === $neutral) echo "PASS starter neutral exact business files\n"; else echo "FAIL starter neutral exact business files\n";
add_filter("gettext", static function ($translation, $text, $domain) { return $text === "A focused partner for turning meaningful plans into real progress." ? "Quoted \"value\" \\\\ path <tag> 'apostrophe'" : $translation; }, 10, 3);
ob_start();
include get_theme_root() . "/layout-landing/patterns/landing.php";
$translated_pattern = (string) ob_get_clean();
$parsed = array_values(array_filter(parse_blocks($translated_pattern), static fn($block) => !empty($block["blockName"])));
$expected_blocks = array("core/group", "core/navigation", "core/group", "core/group", "core/group");
if (array_column($parsed, "blockName") === $expected_blocks && str_contains($translated_pattern, "id=\"contact\"")) echo "PASS translated special characters parse generated blocks\n"; else echo "FAIL translated special characters parse generated blocks: " . wp_json_encode(array_column($parsed, "blockName")) . "\n";
if (count(Blixis\Blocks\Setup\presets()) === 6) echo "PASS six presets\n"; else echo "FAIL preset count\n";
' 2>&1 | grep -E '^(PASS|FAIL|NOTE|HARNESS) ' || fault "layout REST checks failed"

wp post create --post_type=post --post_status=publish --post_title="A featured story" --post_content="A featured post excerpt for the blog layout." --quiet >/dev/null 2>&1 || fault "first blog post not created"
wp post create --post_type=post --post_status=publish --post_title="A later story" --post_content="A second post for the latest posts grid." --quiet >/dev/null 2>&1 || fault "second blog post not created"
cat > wp-content/mu-plugins/t0307-post-selector.php <<'PHP'
<?php
if (!isset($_GET['t0307_posts']) || '1' !== $_GET['t0307_posts']) {
    add_action('pre_get_posts', static function ($query): void { if ('post' === $query->get('post_type')) $query->set('post__in', array(0)); }, 1);
}
PHP
# Browsers keep several connections open; enough workers keep one idle connection from blocking the next page.
PHP_CLI_SERVER_WORKERS=8 wp server --host=127.0.0.1 --port=8080 >/tmp/server.log 2>&1 &
i=0; until wget -q -O /dev/null http://127.0.0.1:8080/ || [ $i -ge 30 ]; do i=$((i+1)); sleep 1; done
[ $i -lt 30 ] || fault "built-in server did not answer"
echo "DONE $WP_VERSION"
