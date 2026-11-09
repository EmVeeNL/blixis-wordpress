<?php
// Task 03-06 Part B, in process: token contract v2 on a real WordPress. A stored v1 config is
// migrated on read and on save, colour formats pass through global styles unchanged, a dark
// palette switches the --blixis-color-* properties and points the theme.json presets at them,
// and the site colour scheme setting is validated and guarded by capability.
// Runs after check.php and puts the stored row back, so the browser stage sees the same state.

use function Blixis\Blocks\Setup\defaults;
use function Blixis\Blocks\Tokens\canonical_json;
use function Blixis\Blocks\Tokens\config_hash;
use function Blixis\Blocks\Tokens\effective_config;
use function Blixis\Blocks\Tokens\reset_request_cache;
use function Blixis\Blocks\Tokens\scheme_get;
use function Blixis\Blocks\Tokens\scheme_sanitize;
use function Blixis\Blocks\Tokens\scheme_save;
use function Blixis\Blocks\Tokens\store_raw;
use function Blixis\Blocks\Tokens\store_read;
use function Blixis\Blocks\Tokens\store_rollback;
use function Blixis\Blocks\Tokens\store_write;

$label = '[' . get_bloginfo('version') . ' php' . PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION . ' v2] ';
$check = static function (string $name, bool $ok, string $detail = '') use ($label): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . $label . $name . (!$ok && $detail !== '' ? ' -- ' . substr($detail, 0, 300) : '') . "\n";
};
$tokens_css = static function (): string {
    wp_styles()->remove('blixis-tokens');
    do_action('wp_enqueue_scripts');
    return implode("\n", (array) wp_styles()->get_data('blixis-tokens', 'after'));
};
$palette = static function (string $slug): string {
    foreach (wp_get_global_settings(['color', 'palette', 'theme']) as $entry) {
        if (($entry['slug'] ?? '') === $slug) {
            return (string) $entry['color'];
        }
    }
    return '';
};
global $wpdb;
$put = static function (string $raw) use ($wpdb): void {
    $wpdb->update($wpdb->options, ['option_value' => $raw], ['option_name' => 'blixis_theme_config']);
    wp_cache_delete('alloptions', 'options');
    wp_cache_delete('blixis_theme_config', 'options');
    reset_request_cache();
};
$original = (string) store_raw();
$check('a stored row exists to restore afterwards', $original !== '');
wp_set_current_user((int) get_user_by('login', 'fixture_admin')->ID);

$v1 = defaults();
$v1['theme']['slug'] = 'acme-site';
$v1['colors']['primary'] = '#0a7a3f';
$v1['schemaVersion'] = 1;

// ---- Migration on read: a v1 row written by task 03-03/03-05 code.
$record = ['revision' => 7, 'hash' => config_hash($v1), 'config' => $v1, 'previous' => null];
$put(canonical_json($record));
$read = store_read();
$check('a stored v1 row is read', null !== $read && 7 === $read['revision']);
$check('the stored v1 config is migrated to schema version 2', 2 === ($read['config']['schemaVersion'] ?? 0));
$migrated = $v1;
$migrated['schemaVersion'] = 2;
$check('migration loses nothing: same values, new version, new hash', ($read['config'] ?? null) == $migrated && ($read['hash'] ?? '') === config_hash($migrated));
$check('a migrated v1 config applies to the active theme', '#0a7a3f' === $palette('primary'), $palette('primary'));
$tampered = $record;
$tampered['hash'] = '0000000000000000';
$put(canonical_json($tampered));
$check('the integrity hash of a v1 row is still enforced', null === store_read());
$put(canonical_json($record));

// ---- Migration on save: v1 previous becomes v2, revision moves on.
$blue = defaults();
$blue['theme']['slug'] = 'acme-site';
$blue['colors']['primary'] = 'oklch(0.55 0.22 262)';
$saved = store_write(canonical_json($blue), 7);
$check('saving over a v1 row works', !is_wp_error($saved) && 8 === $saved['revision'], is_wp_error($saved) ? $saved->get_error_message() : '');
$stored = json_decode((string) store_raw(), true);
$check('the saved row holds schema version 2', 2 === ($stored['config']['schemaVersion'] ?? 0));
$check('the previous config was migrated on save', 2 === ($stored['previous']['schemaVersion'] ?? 0) && '#0a7a3f' === ($stored['previous']['colors']['primary'] ?? ''));
$check('round trip: reading the saved row gives the saved config and hash', store_read()['hash'] === $saved['hash'] && store_read()['config'] == $blue);
$rolled = store_rollback(8);
$check('rollback after migration restores the old colours as version 2', !is_wp_error($rolled) && '#0a7a3f' === ($palette('primary')) && 2 === (store_read()['config']['schemaVersion'] ?? 0));

// ---- Colour formats pass through unchanged.
$formats = $blue;
$formats['colors'] = [
    'primary'    => 'oklch(0.55 0.22 262)',
    'surface'    => 'rgb(255 255 255)',
    'foreground' => 'hsl(220 43% 11% / 0.95)',
    'muted'      => '#64748B',
    'accent'     => 'rgb(0% 80% 100% / 50%)',
];
$formats['shadows']['sm'] = '0 1px 2px 0 rgb(0 0 0 / 0.1)';
$r = store_write(canonical_json($formats), store_read()['revision']);
$check('a config with oklch, rgb and hsl colours saves', !is_wp_error($r), is_wp_error($r) ? $r->get_error_message() : '');
$css = $tokens_css();
$check('the stylesheet carries each format unchanged', str_contains($css, '--blixis-color-primary: oklch(0.55 0.22 262);') && str_contains($css, '--blixis-color-foreground: hsl(220 43% 11% / 0.95);') && str_contains($css, '--blixis-color-accent: rgb(0% 80% 100% / 50%);') && str_contains($css, '--blixis-shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.1);'), $css);
$check('hex is still normalized', str_contains($css, '--blixis-color-muted: #64748b;'));
$check('global styles preset carries the oklch value unchanged', 'oklch(0.55 0.22 262)' === $palette('primary'), $palette('primary'));
$vars = wp_get_global_stylesheet(['variables']);
$check('the generated preset variables carry the entered formats', str_contains($vars, '--wp--preset--color--accent: rgb(0% 80% 100% / 50%)') && str_contains($vars, '--wp--preset--color--foreground: hsl(220 43% 11% / 0.95)'), substr($vars, 0, 300));
$refused = store_write(canonical_json(array_replace_recursive($formats, ['colors' => ['primary' => 'rgb(256 0 0)']])), store_read()['revision']);
$check('the store refuses an out-of-range colour', is_wp_error($refused) && 'blixis_config_invalid' === $refused->get_error_code());

// ---- Dark palette and the scheme setting.
$dark = $formats;
$dark['colorsDark'] = ['primary' => 'oklch(0.75 0.14 262)', 'surface' => '#0b1220', 'foreground' => '#e5e7eb', 'muted' => '#94a3b8', 'accent' => 'rgb(34 211 238)'];
$r = store_write(canonical_json($dark), store_read()['revision']);
$check('a config with a dark palette saves', !is_wp_error($r), is_wp_error($r) ? $r->get_error_message() : '');
delete_option('blixis_color_scheme');
$check('the scheme defaults to following the system', 'system' === scheme_get());
$css = $tokens_css();
$check('system: dark values sit under prefers-color-scheme: dark', 1 === preg_match('/@media \(prefers-color-scheme: dark\) \{\s*:root \{[^}]*--blixis-color-surface: #0b1220;/', $css) && str_contains($css, 'color-scheme: light dark;'), $css);
$check('system: light values stay in :root', 1 === preg_match('/^:root \{[^}]*--blixis-color-surface: rgb\(255 255 255\);/m', $css));
$check('theme.json presets point at the custom properties', 'var(--blixis-color-primary)' === $palette('primary') && 'var(--blixis-color-surface)' === $palette('surface'), $palette('primary'));
$vars = wp_get_global_stylesheet(['variables']);
$check('global styles variables reference the token properties', str_contains($vars, '--wp--preset--color--primary: var(--blixis-color-primary)'), substr($vars, 0, 200));

$events = [];
add_action('blixis_tokens_changed', static function () use (&$events): void {
    $events[] = 'changed';
});
$ok = scheme_save('dark');
$css = $tokens_css();
$check('an administrator can set always dark', 'dark' === $ok && 'dark' === scheme_get(), is_wp_error($ok) ? $ok->get_error_message() : '');
$check('dark: the dark values are in :root and no media query remains', !str_contains($css, 'prefers-color-scheme') && 1 === preg_match('/^:root \{[^}]*--blixis-color-surface: #0b1220;[^}]*color-scheme: dark;/m', $css), $css);
$check('changing the scheme announces blixis_tokens_changed once', ['changed'] === $events, json_encode($events));
scheme_save('dark');
$check('saving the same value again announces nothing', ['changed'] === $events);
scheme_save('light');
$css = $tokens_css();
$check('light: dark palette is ignored', !str_contains($css, '#0b1220') && str_contains($css, 'color-scheme: light;'), $css);
$bad = scheme_save('sepia');
$check('an unknown scheme is refused with 400 and nothing changes', is_wp_error($bad) && 400 === $bad->get_error_data()['status'] && 'light' === scheme_get());
$check('a non-string scheme is refused', is_wp_error(scheme_save(['dark'])) && is_wp_error(scheme_save(null)) && 'light' === scheme_get());
$check('the options sanitizer keeps the current value for junk', 'light' === scheme_sanitize('<script>') && 'dark' === scheme_sanitize('dark') && 'light' === scheme_sanitize(5));
update_option('blixis_color_scheme', 'neon');
$check('a corrupt stored scheme reads as the default', 'system' === scheme_get());
update_option('blixis_color_scheme', 'light');

foreach (['fixture_editor', 'fixture_subscriber'] as $login) {
    wp_set_current_user((int) get_user_by('login', $login)->ID);
    $denied = scheme_save('dark');
    $check("$login cannot change the scheme", is_wp_error($denied) && 403 === $denied->get_error_data()['status'] && 'light' === scheme_get());
}
wp_set_current_user(0);
$check('a visitor cannot change the scheme', is_wp_error(scheme_save('dark')) && 'light' === scheme_get());
$check('options.php saving needs edit_theme_options for the setting group', 'edit_theme_options' === apply_filters('option_page_capability_blixis_tokens', 'manage_options'));
wp_set_current_user((int) get_user_by('login', 'fixture_admin')->ID);

// ---- Restore the state the browser stage expects.
delete_option('blixis_color_scheme');
$put($original);
$check('the stored row is restored', store_raw() === $original && null !== effective_config());
