<?php
// Run with `wp eval-file` inside the disposable fixture for task 03-01. Prints PASS/FAIL lines.
// The fixture uses plain permalinks, so REST requests use the rest_route query form.
// Exercises the child theme generator through its PHP API and over real HTTP.

use function Blixis\Blocks\ChildTheme\build_files;
use function Blixis\Blocks\ChildTheme\create;
use function Blixis\Blocks\ChildTheme\validate;

$label = '[' . getenv('T0301_WP') . ' php' . getenv('T0301_PHP') . '] ';
$fails = 0;
$check = static function (string $name, bool $ok, string $detail = '') use (&$fails, $label): void {
    if (!$ok) {
        ++$fails;
    }
    echo ($ok ? 'PASS ' : 'FAIL ') . $label . $name . (!$ok && $detail !== '' ? ' -- ' . $detail : '') . "\n";
};

$base = 'http://127.0.0.1:8080';
$root = get_theme_root();
$parent_dir = $root . '/blixis-base';

// Snapshot every file in Blixis Base so any write to it is caught.
$snapshot = static function (string $dir): array {
    $out = [];
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)) as $f) {
        if ($f->isFile()) {
            $out[substr($f->getPathname(), strlen($dir))] = hash_file('sha256', $f->getPathname());
        }
    }
    ksort($out);
    return $out;
};
$base_before = $snapshot($parent_dir);
$themes_before = scandir($root);

// ---- 1. Validation, in process.
$codes = static function (array $input): array {
    $r = validate($input);
    return array_map(static fn ($e) => $e['field'] . ':' . $e['code'], $r['errors']);
};
$ok_input = ['name' => 'Acme Site', 'slug' => 'acme-site', 'description' => 'Site theme', 'author' => 'Acme', 'version' => '1.2.3'];
$check('valid input has no errors', $codes($ok_input) === [], implode(',', $codes($ok_input)));
$check('version defaults to 0.1.0', validate(['name' => 'X', 'slug' => 'xyz'])['values']['version'] === '0.1.0');
$cases = [
    'missing name'            => [['slug' => 'abc'], 'name:required'],
    'blank name'              => [['name' => '   ', 'slug' => 'abc'], 'name:required'],
    'missing slug'            => [['name' => 'A'], 'slug:required'],
    'unknown field'           => [['name' => 'A', 'slug' => 'abc', 'template' => 'x'], 'template:unknown_field'],
    'non-string name'         => [['name' => ['A'], 'slug' => 'abc'], 'name:invalid_type'],
    'uppercase slug'          => [['name' => 'A', 'slug' => 'Abc'], 'slug:invalid_slug'],
    'traversal slug'          => [['name' => 'A', 'slug' => '../blixis-base'], 'slug:invalid_slug'],
    'nested slug'             => [['name' => 'A', 'slug' => 'blixis-base/child'], 'slug:invalid_slug'],
    'short slug'              => [['name' => 'A', 'slug' => 'ab'], 'slug:invalid_slug'],
    'double hyphen slug'      => [['name' => 'A', 'slug' => 'a--b'], 'slug:invalid_slug'],
    'parent slug reserved'    => [['name' => 'A', 'slug' => 'blixis-base'], 'slug:reserved_slug'],
    'core path reserved'      => [['name' => 'A', 'slug' => 'wp-content'], 'slug:reserved_slug'],
    'newline in name'         => [['name' => "A\nTemplate: twentytwentyfive", 'slug' => 'abc'], 'name:invalid_characters'],
    'comment close in name'   => [['name' => 'A */ body{}', 'slug' => 'abc'], 'name:invalid_characters'],
    'markup in author'        => [['name' => 'A', 'slug' => 'abc', 'author' => '<script>'], 'author:invalid_characters'],
    'long description'        => [['name' => 'A', 'slug' => 'abc', 'description' => str_repeat('x', 201)], 'description:too_long'],
    'invalid UTF-8'           => [['name' => "A\xC3", 'slug' => 'abc'], 'name:invalid_characters'],
    'bad version'             => [['name' => 'A', 'slug' => 'abc', 'version' => '1.0'], 'version:invalid_version'],
];
foreach ($cases as $name => [$input, $want]) {
    $got = $codes($input);
    $check("invalid input refused: $name", in_array($want, $got, true), implode(',', $got));
}
$files = build_files(validate($ok_input)['values']);
$check('generator writes only approved files', array_keys($files) === ['style.css', 'theme.json', 'functions.php'], implode(',', array_keys($files)));
$check('generated theme.json is valid JSON version 3', (json_decode($files['theme.json'], true)['version'] ?? 0) === 3);
$decoded_theme = json_decode($files['theme.json'], true);
$check('generated theme.json inherits token styles without fixed theme values', array_keys($decoded_theme) === ['$schema', 'version'] && !isset($decoded_theme['settings'], $decoded_theme['styles']));
$base_theme = json_decode((string) file_get_contents($parent_dir . '/theme.json'), true);
$preset_lists = [
    'color' => array_column($base_theme['settings']['color']['palette'], 'slug'),
    'font-family' => array_column($base_theme['settings']['typography']['fontFamilies'], 'slug'),
    'font-size' => array_column($base_theme['settings']['typography']['fontSizes'], 'slug'),
    'spacing' => array_column($base_theme['settings']['spacing']['spacingSizes'], 'slug'),
    'border-radius' => array_column($base_theme['settings']['border']['radiusSizes'], 'slug'),
];
$style_json = (string) wp_json_encode($base_theme['styles']);
preg_match_all('/var:preset\\|([a-z-]+)\\|([a-z0-9-]+)/', $style_json, $preset_refs, PREG_SET_ORDER);
$missing_presets = array_filter($preset_refs, static fn (array $ref): bool => !in_array($ref[2], $preset_lists[$ref[1]] ?? [], true));
$check('every Base style preset reference exists in Base theme.json', !$missing_presets, wp_json_encode($missing_presets));
$neutral = build_files(validate($ok_input + ['starter' => 'neutral'])['values']);
$business = build_files(validate($ok_input + ['layout' => 'business'])['values']);
$check('neutral starter writes the business layout file set', isset($neutral['templates/front-page.html'], $neutral['patterns/business.php']) && count(array_filter(array_keys($neutral), static fn (string $path): bool => str_starts_with($path, 'patterns/'))) === 1);
$check('neutral starter is exactly the business layout output', $neutral === $business);
$check('business layout uses its child-scoped pattern and translated visible text', str_contains($neutral['templates/front-page.html'], 'acme-site/business') && str_contains($neutral['patterns/business.php'], "esc_html_e( 'A better way to do business', 'acme-site' )"));
$invalid_starter = validate(['name' => 'A', 'slug' => 'abc', 'starter' => 'branded']);
$check('unknown starter is rejected', in_array(['field' => 'starter', 'code' => 'invalid_starter'], $invalid_starter['errors'], true));

// ---- 2. Authentication helpers for real HTTP requests.
$make_user = static function (string $login, string $role): int {
    return (int) wp_insert_user(['user_login' => $login, 'user_pass' => wp_generate_password(24), 'user_email' => "$login@example.test", 'role' => $role]);
};
$admin = (int) get_user_by('login', 'fixture_admin')->ID;
$editor = $make_user('fixture_editor', 'editor');
$subscriber = $make_user('fixture_subscriber', 'subscriber');

// A logged-in browser session: auth cookies plus a nonce bound to that session.
$session = static function (int $user): array {
    $expiry = time() + HOUR_IN_SECONDS;
    $token = WP_Session_Tokens::get_instance($user)->create($expiry);
    $auth = wp_generate_auth_cookie($user, $expiry, 'auth', $token);
    $logged = wp_generate_auth_cookie($user, $expiry, 'logged_in', $token);
    wp_set_current_user($user);
    $_COOKIE[LOGGED_IN_COOKIE] = $logged;
    $nonce = wp_create_nonce('wp_rest');
    unset($_COOKIE[LOGGED_IN_COOKIE]);
    wp_set_current_user(0);
    return ['cookies' => [AUTH_COOKIE => $auth, LOGGED_IN_COOKIE => $logged], 'nonce' => $nonce];
};
$post = static function (array $body, ?array $session = null, ?string $nonce = null, array $headers = []) use ($base): array {
    $cookies = [];
    foreach ($session['cookies'] ?? [] as $name => $value) {
        $cookies[] = new WP_Http_Cookie(['name' => $name, 'value' => $value]);
    }
    $headers['Content-Type'] = 'application/json';
    if ($nonce !== null) {
        $headers['X-WP-Nonce'] = $nonce;
    }
    $r = wp_remote_post($base . '/?rest_route=/blixis-editor/v1/child-themes', ['headers' => $headers, 'cookies' => $cookies, 'body' => wp_json_encode($body), 'timeout' => 30]);
    if (is_wp_error($r)) {
        return [0, [], $r->get_error_message()];
    }
    $raw = wp_remote_retrieve_body($r);
    return [(int) wp_remote_retrieve_response_code($r), json_decode($raw, true) ?? [], $raw];
};
$exists = static fn (string $slug): bool => file_exists(get_theme_root() . '/' . $slug);

$admin_session = $session($admin);
$request = ['name' => 'Acme Site', 'slug' => 'acme-site', 'description' => 'Site theme for Acme.', 'author' => 'Acme', 'version' => '1.0.0', 'starter' => 'neutral'];

// ---- 3. Refusals: none of these may create anything.
[$s] = $post($request);
$check('anonymous request is refused with 401', $s === 401, (string) $s);
[$s] = $post($request, $session($subscriber), null);
$check('subscriber without nonce is refused', in_array($s, [401, 403], true), (string) $s);
$sub = $session($subscriber);
[$s] = $post($request, $sub, $sub['nonce']);
$check('subscriber with valid nonce is refused with 403', $s === 403, (string) $s);
$ed = $session($editor);
[$s] = $post($request, $ed, $ed['nonce']);
$check('editor (no edit_theme_options) is refused with 403', $s === 403, (string) $s);
[$s] = $post($request, $admin_session, null);
$check('administrator cookie without nonce is refused', in_array($s, [401, 403], true), (string) $s);
[$s, $j] = $post($request, $admin_session, 'not-a-valid-nonce');
$check('administrator cookie with a wrong nonce is refused with 403', $s === 403, (string) $s . ' ' . ($j['code'] ?? ''));

$app = WP_Application_Passwords::create_new_application_password($admin, ['name' => 'fixture']);
if (is_wp_error($app)) {
    $check('application password can be created in the fixture', false, $app->get_error_message());
} else {
    [$s, $j] = $post($request, null, null, ['Authorization' => 'Basic ' . base64_encode('fixture_admin:' . $app[0])]);
    $check('administrator application password without nonce is refused with 403', $s === 403 && ($j['code'] ?? '') === 'blixis_child_nonce_required', $s . ' ' . ($j['code'] ?? ''));
}
$check('no theme directory was created by refused requests', !$exists('acme-site'));

[$s, $j] = $post(['name' => 'Bad', 'slug' => '../blixis-base'], $admin_session, $admin_session['nonce']);
$check('traversal slug over HTTP returns 400 with a field error', $s === 400 && in_array(['field' => 'slug', 'code' => 'invalid_slug'], $j['data']['errors'] ?? [], true), $s . ' ' . wp_json_encode($j));
[$s, $j] = $post(['name' => 'Bad', 'slug' => 'blixis-base'], $admin_session, $admin_session['nonce']);
$check('parent slug over HTTP returns 400 reserved_slug', $s === 400 && in_array(['field' => 'slug', 'code' => 'reserved_slug'], $j['data']['errors'] ?? [], true), $s . ' ' . wp_json_encode($j));
[$s, $j] = $post(['name' => 'Bad', 'slug' => 'bad-site', 'starter' => 'branded'], $admin_session, $admin_session['nonce']);
$check('REST starter enum rejects unknown values before creating a theme', $s === 400 && ($j['code'] ?? '') === 'rest_invalid_param' && !$exists('bad-site'), $s . ' ' . wp_json_encode($j));
[$s] = $post(['name' => 'Twenty', 'slug' => 'twentytwentyfive'], $admin_session, $admin_session['nonce']);
$check('existing theme slug returns 409', $s === 409, (string) $s);

// ---- 4. Success.
[$s, $j, $raw] = $post($request, $admin_session, $admin_session['nonce']);
$check('administrator with valid nonce creates the child theme (201)', $s === 201 && ($j['slug'] ?? '') === 'acme-site', $s . ' ' . $raw);
$check('response does not disclose server paths', !str_contains($raw, ABSPATH) && !str_contains($raw, $root));
wp_clean_themes_cache();
$child = wp_get_theme('acme-site');
$check('generated theme is recognised by WordPress', $child->exists() && !$child->errors(), $child->errors() ? $child->errors()->get_error_message() : '');
$check('generated theme names Blixis Base as its parent', $child->get_template() === 'blixis-base' && $child->parent() && $child->parent()->get_stylesheet() === 'blixis-base');
$check('generated header: Theme Name', $child->get('Name') === 'Acme Site', (string) $child->get('Name'));
$check('generated header: Requires at least 7.0', $child->get('RequiresWP') === '7.0', (string) $child->get('RequiresWP'));
$check('generated header: Requires PHP 8.3', $child->get('RequiresPHP') === '8.3', (string) $child->get('RequiresPHP'));
$check('generated header: Version and Text Domain', $child->get('Version') === '1.0.0' && $child->get('TextDomain') === 'acme-site');
$generated = is_dir($root . '/acme-site') ? array_values(array_diff(scandir($root . '/acme-site'), ['.', '..'])) : [];
sort($generated);
$check('generated directory holds only the approved files', $generated === ['functions.php', 'patterns', 'style.css', 'templates', 'theme.json'], implode(',', $generated));
$check('REST starter selection writes the business layout file set', is_file($root . '/acme-site/templates/front-page.html') && is_file($root . '/acme-site/patterns/business.php') && !is_file($root . '/acme-site/patterns/intro.php') && !is_file($root . '/acme-site/patterns/features.php'));
$check('generator did not activate the theme', get_stylesheet() === 'blixis-base', get_stylesheet());

[$s] = $post($request, $admin_session, $admin_session['nonce']);
$check('repeating the same request returns 409', $s === 409, (string) $s);
$err = create(['name' => 'Again', 'slug' => 'acme-site']);
$check('PHP API refuses an existing directory', is_wp_error($err) && $err->get_error_code() === 'blixis_child_exists');
file_put_contents($root . '/plain-file', 'x');
$err = create(['name' => 'File', 'slug' => 'plain-file']);
$check('PHP API refuses a path held by a file', is_wp_error($err) && $err->get_error_code() === 'blixis_child_exists' && file_get_contents($root . '/plain-file') === 'x');
unlink($root . '/plain-file');

$leftovers = array_filter(scandir($root), static fn ($f) => str_starts_with($f, '.blixis-child-'));
$check('no staging directories are left behind', !$leftovers, implode(',', $leftovers));
$check('Blixis Base files are unchanged', $snapshot($parent_dir) === $base_before);
$new_entries = array_values(array_diff(scandir($root), $themes_before));
$check('only the requested theme directory was added', $new_entries === ['acme-site'], implode(',', $new_entries));

// ---- 5. File modifications disabled: install_themes is withdrawn, so the route refuses.
// A new must-use plugin defines the constant. Editing wp-config.php is unreliable here,
// because the built-in server's opcode cache can serve the old file for a few seconds.
$mu = WP_CONTENT_DIR . '/mu-plugins';
wp_mkdir_p($mu);
file_put_contents("$mu/fixture-lock.php", "<?php\ndefine( 'DISALLOW_FILE_MODS', true );\n");
[$s] = $post(['name' => 'Locked', 'slug' => 'locked-site'], $admin_session, $admin_session['nonce']);
unlink("$mu/fixture-lock.php");
$check('DISALLOW_FILE_MODS refuses generation', in_array($s, [403, 503], true) && !$exists('locked-site'), (string) $s);

// ---- 6. The child works on the front end and survives a Base upgrade.
switch_theme('acme-site');
$page = wp_insert_post(['post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Child page', 'post_content' => '<!-- wp:paragraph --><p>Child content marker</p><!-- /wp:paragraph -->']);
$fetch = static function (string $url): array {
    $r = wp_remote_get($url, ['timeout' => 30]);
    return [(int) wp_remote_retrieve_response_code($r), (string) wp_remote_retrieve_body($r)];
};
$render_ok = static function (string $html): bool {
    return substr_count($html, '<main') === 1 && preg_match_all('/<h1[\s>]/', $html) === 1;
};
[$s, $html] = $fetch(get_permalink($page));
$check('active child renders a page (200, one main, one h1)', $s === 200 && $render_ok($html) && str_contains($html, 'Child content marker'), (string) $s);
$check('page loads the child stylesheet after Blixis Base', str_contains($html, '/themes/acme-site/style.css') && str_contains($html, '/themes/blixis-base/style.css'));
$check('page loads the parent Tailwind build', str_contains($html, '/themes/blixis-base/assets/build/tailwind.css'));

// Simulate a Base upgrade: a new version and a changed footer part in the parent.
$style = (string) file_get_contents($parent_dir . '/style.css');
file_put_contents($parent_dir . '/style.css', preg_replace('/^Version: .*$/m', 'Version: 9.9.9', $style));
$footer = (string) file_get_contents($parent_dir . '/parts/footer.html');
file_put_contents($parent_dir . '/parts/footer.html', $footer . "\n<!-- wp:paragraph --><p>Upgraded parent marker</p><!-- /wp:paragraph -->\n");
wp_clean_themes_cache();
[$s, $html] = $fetch(get_permalink($page));
$check('after a Base upgrade the child still renders (200, one main, one h1)', $s === 200 && $render_ok($html) && str_contains($html, 'Child content marker'), (string) $s);
$check('after a Base upgrade the child inherits the new parent part', str_contains($html, 'Upgraded parent marker'));
$check('after a Base upgrade the child stays active', get_stylesheet() === 'acme-site');
file_put_contents($parent_dir . '/style.css', $style);
file_put_contents($parent_dir . '/parts/footer.html', $footer);

$log = is_readable('/tmp/debug.log') ? (string) file_get_contents('/tmp/debug.log') : '';
$check('no PHP errors or warnings were logged', !preg_match('/PHP (Fatal|Warning|Notice|Deprecated)/', $log), substr($log, 0, 400));

// FAIL lines carry the result; a non-zero exit here means the script itself broke.
