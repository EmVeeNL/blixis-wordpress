<?php
// Run with `wp eval-file` inside the disposable fixture. Prints PASS/FAIL lines.
// Asserts observable behaviour only (rendered HTML, registered support, active state),
// not template file names or function names inside the theme.

$label = '[' . getenv('T0201_WP') . ' php' . getenv('T0201_PHP') . '] ';
$fails = 0;
$check = static function (string $name, bool $ok, string $detail = '') use (&$fails, $label): void {
    if (!$ok) {
        ++$fails;
    }
    echo ($ok ? 'PASS ' : 'FAIL ') . $label . $name . (!$ok && $detail !== '' ? ' -- ' . $detail : '') . "\n";
};
$get = static function (string $url): array {
    $ctx = stream_context_create(['http' => ['ignore_errors' => true, 'timeout' => 20]]);
    $body = (string) @file_get_contents($url, false, $ctx);
    $status = 0;
    foreach ($http_response_header ?? [] as $h) {
        if (preg_match('#^HTTP/\S+ (\d+)#', $h, $m)) {
            $status = (int) $m[1];
        }
    }
    return [$status, $body];
};

// Activation and state.
$check('theme is the active stylesheet', get_stylesheet() === 'blixis-base', get_stylesheet());
$check('theme is a block theme', wp_is_block_theme());
$check('theme has no parent', !wp_get_theme()->parent());
$plugin_active = in_array('blixis-blocks/blixis-blocks.php', (array) get_option('active_plugins'), true);
$check('plugin is active alongside theme', $plugin_active);
$check('theme header: Requires at least 7.0', wp_get_theme()->get('RequiresWP') === '7.0', (string) wp_get_theme()->get('RequiresWP'));
$check('theme header: Requires PHP 8.3', wp_get_theme()->get('RequiresPHP') === '8.3', (string) wp_get_theme()->get('RequiresPHP'));

// Neutral structure: no site branding or demo content in the options WordPress reads for the theme.
$theme = wp_get_theme();
$check('theme name is neutral', stripos((string) $theme->get('Name'), 'wilde') === false && stripos((string) $theme->get('Name'), 'groei') === false);

// Presets reach WordPress global settings.
$settings = wp_get_global_settings();
$palette = $settings['color']['palette']['theme'] ?? [];
$slugs = array_column($palette, 'slug');
$check('theme colour palette is registered', count($slugs) > 0);
$check('default WordPress palette stays off', ($settings['color']['defaultPalette'] ?? true) === false);
$contract = json_decode((string) file_get_contents('/tmp/t/default.theme.json'), true);
$wanted = array_column($contract['settings']['color']['palette'] ?? [], 'slug');
if ($wanted) {
    $check('palette includes every token-contract slug', !array_diff($wanted, $slugs), 'missing: ' . implode(',', array_diff($wanted, $slugs)));
}
$check('layout content and wide sizes are set', !empty($settings['layout']['contentSize']) && !empty($settings['layout']['wideSize']));

// Singular rendering: a post and a page must print their content.
$admin = get_user_by('login', 'fixture_admin');
wp_set_current_user($admin->ID);
// The marker sits after 120 filler words, past any excerpt, and differs per type, so a
// fallback list view (title + excerpt) cannot satisfy the assertion by accident.
$filler = trim(str_repeat('lorem ', 120));
$markers = [];
$make = static function (string $type) use (&$markers, $filler): int {
    $markers[$type] = 'T0201-BODY-' . strtoupper($type) . '-' . wp_generate_password(8, false);
    $content = "<!-- wp:paragraph -->\n<p>$filler {$markers[$type]}</p>\n<!-- /wp:paragraph -->";
    return (int) wp_insert_post(['post_type' => $type, 'post_status' => 'publish', 'post_title' => 'Fixture ' . $type, 'post_content' => $content]);
};
$post = $make('post');
$page = $make('page');
$draft = wp_insert_post(['post_type' => 'page', 'post_status' => 'draft', 'post_title' => 'Fixture draft', 'post_content' => '<p>T0201-DRAFT-MARKER</p>']);
wp_set_current_user(0);

foreach (['post' => $post, 'page' => $page] as $type => $id) {
    [$status, $html] = $get(get_permalink($id) ?: home_url('/?p=' . $id));
    $check("singular $type returns 200", $status === 200, (string) $status);
    $check("singular $type prints post content", str_contains($html, $markers[$type]));
    $check("singular $type prints its title", str_contains($html, 'Fixture ' . $type));
    $check("singular $type has exactly one main landmark", preg_match_all('/<main\b/i', $html) === 1, (string) preg_match_all('/<main\b/i', $html));
    $check("singular $type has one h1", preg_match_all('/<h1\b/i', $html) === 1, (string) preg_match_all('/<h1\b/i', $html));
    $check("singular $type declares lang and viewport", (bool) preg_match('/<html[^>]*\blang=/i', $html) && str_contains($html, 'name="viewport"'));
    $check("singular $type has no PHP errors in output", !preg_match('/(Fatal error|Warning:|Notice:|Deprecated:)/', $html));
}
[$status, $html] = $get(home_url('/?p=' . $draft . '&post_type=page'));
$check('anonymous request never receives draft content', !str_contains($html, 'T0201-DRAFT-MARKER'));
[$status, $html] = $get(home_url('/'));
$check('front page returns 200', $status === 200, (string) $status);

// Plugin bootstrap regression: it adds no output, routes, or meta of its own yet.
[$status, $html] = $get(home_url('/wp-json/'));
$check('REST index still answers', $status === 200, (string) $status);
$check('plugin bootstrap does not break wp-login', ($get(home_url('/wp-login.php'))[0]) === 200);

// Debug log must contain no PHP problems attributable to Blixis code.
$log = (string) @file_get_contents('/tmp/debug.log');
$blixis = array_filter(explode("\n", $log), static fn ($l) => stripos($l, 'blixis') !== false);
$check('debug log has no entries mentioning blixis', !$blixis, implode(' | ', array_slice($blixis, 0, 3)));

exit(0);
