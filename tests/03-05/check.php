<?php
// Task 03-05, in process: applying stored tokens, cache invalidation, rollback, fallback to the
// previous config, the active-theme rule, and the Site Editor override policy.
// Leaves the site with child theme acme-site active, Liberation Sans in the Font Library, a stored
// config (green primary, Liberation Sans body), and a Site Editor override for the browser stage.

use function Blixis\Blocks\ChildTheme\create;
use function Blixis\Blocks\Setup\defaults;
use function Blixis\Blocks\Tokens\canonical_json;
use function Blixis\Blocks\Tokens\effective_config;
use function Blixis\Blocks\Tokens\reset_request_cache;
use function Blixis\Blocks\Tokens\store_read;
use function Blixis\Blocks\Tokens\store_rollback;
use function Blixis\Blocks\Tokens\store_write;

$label = '[' . get_bloginfo('version') . ' php' . PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION . ' in-process] ';
$check = static function (string $name, bool $ok, string $detail = '') use ($label): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . $label . $name . (!$ok && $detail !== '' ? ' -- ' . $detail : '') . "\n";
};
$primary = static function (): string {
    foreach (wp_get_global_settings(['color', 'palette', 'theme']) as $entry) {
        if (($entry['slug'] ?? '') === 'primary') {
            return strtolower((string) $entry['color']);
        }
    }
    return '';
};
$tokens_css = static function (): string {
    wp_styles()->remove('blixis-tokens');
    do_action('wp_enqueue_scripts');
    return implode("\n", (array) wp_styles()->get_data('blixis-tokens', 'after'));
};

// Child theme and a Font Library family for the body font.
$made = create(['name' => 'Acme Site', 'slug' => 'acme-site', 'starter' => 'neutral']);
$check('the child theme is created', !is_wp_error($made));
switch_theme('acme-site');
$dir = wp_get_font_dir();
wp_mkdir_p($dir['path']);
copy('/tmp/t/fonts/LiberationSans-Regular.ttf', $dir['path'] . '/liberation-regular.ttf');
$family = wp_insert_post(['post_type' => 'wp_font_family', 'post_status' => 'publish', 'post_title' => 'Liberation Sans', 'post_name' => 'liberation-sans', 'post_content' => wp_json_encode(['name' => 'Liberation Sans', 'slug' => 'liberation-sans', 'fontFamily' => '"Liberation Sans", sans-serif'])]);
wp_insert_post(['post_type' => 'wp_font_face', 'post_status' => 'publish', 'post_parent' => $family, 'post_title' => 'Liberation Sans 400', 'post_content' => wp_json_encode(['fontFamily' => 'Liberation Sans', 'fontWeight' => '400', 'fontStyle' => 'normal', 'src' => trailingslashit($dir['url']) . 'liberation-regular.ttf'])]);

$base_primary = $primary();
$check('without a stored config Base presets apply', $base_primary !== '' && effective_config() === null, $base_primary);
$check('without a stored config no token stylesheet is added', $tokens_css() === '');

$events = [];
add_action('blixis_tokens_changed', static function (int $revision, string $hash) use (&$events): void {
    $events[] = $revision;
}, 10, 2);

$config = defaults();
$config['theme']['slug'] = 'acme-site';
$green = $config;
$green['colors']['primary'] = '#0a7a3f';
$green['fonts']['body'] = 'Liberation Sans';
$green['fonts']['heading'] = 'Georgia';
$green['spacing']['md'] = '2rem';
$blue = $config;
$blue['colors']['primary'] = '#1d4ed8';

$r1 = store_write(canonical_json($green), 0);
$check('saving revision 1 applies at once to global settings', !is_wp_error($r1) && $primary() === '#0a7a3f', $primary());
$check('the token stylesheet carries the saved value', str_contains($tokens_css(), '--blixis-color-primary: #0a7a3f;'));
$check('saving announces blixis_tokens_changed for page caches', $events === [1], json_encode($events));
ob_start();
do_action('wp_head');
$head = (string) ob_get_clean();
$check('the chosen Font Library font is printed as a local @font-face', str_contains($head, '@font-face') && str_contains($head, 'liberation-regular.ttf') && str_contains($head, 'font-display:swap'));

store_write(canonical_json($blue), 1);
$check('revision 2 applies at once', $primary() === '#1d4ed8', $primary());
$r = store_rollback(2);
$check('rollback restores the previous config as revision 3', !is_wp_error($r) && $r['revision'] === 3 && $primary() === '#0a7a3f', is_wp_error($r) ? $r->get_error_message() : $primary());
$check('after rollback the previous config is the rolled-back one, so rollback can be undone', (store_read()['previous']['colors']['primary'] ?? '') === '#1d4ed8');
$check('rollback from a stale revision is a conflict', is_wp_error(store_rollback(2)) && store_rollback(2)->get_error_code() === 'blixis_config_conflict');
$check('every change was announced', $events === [1, 2, 3], json_encode($events));

// Another child theme's config does not apply to the active theme.
$other = $blue;
$other['theme']['slug'] = 'other-site';
store_write(canonical_json($other), 3);
reset_request_cache();
$check('a config for another theme does not apply', effective_config() === null && $primary() === $base_primary, $primary());
store_write(canonical_json($green), 4);
reset_request_cache();
$check('a config for the active theme applies again', $primary() === '#0a7a3f', $primary());

// A stored row whose config no longer validates falls back to its previous config.
global $wpdb;
$raw = (string) $wpdb->get_var($wpdb->prepare("SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", 'blixis_theme_config'));
$record = json_decode($raw, true);
$broken = $record;
$broken['config']['colors']['primary'] = 'red;}';
$broken['previous'] = $blue;
$wpdb->update($wpdb->options, ['option_value' => wp_json_encode($broken)], ['option_name' => 'blixis_theme_config']);
wp_cache_delete('alloptions', 'options');
reset_request_cache();
$check('a corrupt current config falls back to the previous one', $primary() === '#1d4ed8', $primary());
$broken['previous']['colors']['primary'] = 'nope';
$wpdb->update($wpdb->options, ['option_value' => wp_json_encode($broken)], ['option_name' => 'blixis_theme_config']);
reset_request_cache();
$check('with no valid config Base presets apply', effective_config() === null && $primary() === $base_primary, $primary());
$wpdb->update($wpdb->options, ['option_value' => $raw], ['option_name' => 'blixis_theme_config']);
reset_request_cache();
$check('restoring the row applies it again', $primary() === '#0a7a3f', $primary());

// The Site Editor cannot override a Blixis token.
// As the Site Editor does: an administrator's global styles post, tagged with the theme.
wp_set_current_user((int) get_user_by('login', 'fixture_admin')->ID);
$post_id = WP_Theme_JSON_Resolver::get_user_global_styles_post_id();
wp_set_object_terms($post_id, 'acme-site', 'wp_theme');
wp_update_post(['ID' => $post_id, 'post_content' => wp_json_encode(['version' => 3, 'isGlobalStylesUserThemeJSON' => true, 'settings' => ['color' => ['palette' => ['theme' => [['slug' => 'primary', 'name' => 'Primary', 'color' => '#000000']], 'custom' => [['slug' => 'site-extra', 'name' => 'Site extra', 'color' => '#ff00ff']]]], 'layout' => ['contentSize' => '10rem']]])]);
reset_request_cache();
remove_filter('wp_theme_json_data_user', 'Blixis\\Blocks\\Tokens\\filter_user_theme_json', 20);
reset_request_cache();
$check('control: without the policy the Site Editor override would win', $primary() === '#000000', $primary());
add_filter('wp_theme_json_data_user', 'Blixis\\Blocks\\Tokens\\filter_user_theme_json', 20);
reset_request_cache();
$check('a Site Editor palette override does not replace the token colour', $primary() === '#0a7a3f', $primary());
$custom = array_column((array) wp_get_global_settings(['color', 'palette', 'custom']), 'slug');
$check('Site Editor custom colours that are not tokens are kept', in_array('site-extra', $custom, true), implode(',', $custom));
$check('a Site Editor layout width does not replace the token width', wp_get_global_settings(['layout', 'contentSize']) === $green['layout']['contentWidth'], (string) wp_get_global_settings(['layout', 'contentSize']));
$stylesheet = wp_get_global_stylesheet(['variables']);
$check('the generated preset variable carries the token value', str_contains($stylesheet, '--wp--preset--color--primary: #0a7a3f'), substr($stylesheet, 0, 200));
