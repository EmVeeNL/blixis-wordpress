<?php
// Run with `wp eval-file` through wordpress/run.sh api. Throwaway proof, not product code.
// Secrets here (user passwords, API keys, application passwords) are generated at runtime.

const T_ROOT = '/tmp/contract/wp/contract';
const T_BASE = 'http://127.0.0.1:8080';
const T_DOC_MARKER = 'BLIXIS-DOC-MARKER';
const T_HIDDEN_MARKER = 'HIDDEN-BODY-MARKER';
const T_PUBLIC_MARKER = 'PUBLIC-BODY-MARKER';

$GLOBALS['T'] = ['pass' => 0, 'fail' => 0, 'section' => '', 'sections' => [], 'users' => [], 'pw' => [], 'app' => [], 'sessions' => [], 'config' => null];

function t_section(string $name): void
{
    $GLOBALS['T']['section'] = $name;
    $GLOBALS['T']['sections'][$name] ??= [0, 0];
}

function t_check(string $name, bool $ok, string $detail = ''): void
{
    $T = &$GLOBALS['T'];
    $T[$ok ? 'pass' : 'fail']++;
    $T['sections'][$T['section']][$ok ? 0 : 1]++;
    if (!$ok) {
        echo "FAIL [{$T['section']}] $name" . ($detail !== '' ? " :: $detail" : '') . "\n";
    }
}

function t_observe(string $name, $value): void
{
    echo "OBSERVED $name = " . (is_string($value) ? $value : json_encode($value, JSON_UNESCAPED_SLASHES)) . "\n";
}

function t_json(string $path): array
{
    return json_decode((string) file_get_contents(T_ROOT . '/' . $path), true, 512, JSON_THROW_ON_ERROR);
}

function t_config(?array $config): void
{
    if ($GLOBALS['T']['config'] === $config && $config !== null) {
        return;
    }
    $GLOBALS['T']['config'] = $config;
    if ($config === null) {
        delete_option('blixis_api_config');
    } else {
        update_option('blixis_api_config', $config, false);
    }
}

function t_config_named(string $name): void
{
    $map = [
        'keyed' => ['mode' => 'keyed', 'require_https' => false],
        'anonymous' => ['mode' => 'anonymous', 'require_https' => false],
        'default' => null,
    ];
    t_config($map[$name]);
}

function t_session(string $actor): array
{
    $T = &$GLOBALS['T'];
    if (!isset($T['sessions'][$actor])) {
        $id = $T['users'][$actor];
        $expires = time() + 7200;
        $token = WP_Session_Tokens::get_instance($id)->create($expires);
        $cookie = wp_generate_auth_cookie($id, $expires, 'logged_in', $token);
        $T['sessions'][$actor] = ['raw' => $cookie, 'cookie' => LOGGED_IN_COOKIE . '=' . rawurlencode($cookie)];
    }
    return $T['sessions'][$actor];
}

function t_nonce(string $actor, string $action = 'wp_rest'): string
{
    $session = t_session($actor);
    $_COOKIE[LOGGED_IN_COOKIE] = $session['raw'];
    wp_set_current_user($GLOBALS['T']['users'][$actor]);
    $nonce = wp_create_nonce($action);
    unset($_COOKIE[LOGGED_IN_COOKIE]);
    wp_set_current_user(0);
    return $nonce;
}

function t_app_password(string $actor): string
{
    $T = &$GLOBALS['T'];
    if (!isset($T['app'][$actor])) {
        $created = WP_Application_Passwords::create_new_application_password($T['users'][$actor], ['name' => 'contract']);
        $T['app'][$actor] = $created[0];
    }
    return $T['app'][$actor];
}

/** Builds request headers from an auth specification such as "cookie+nonce+bearer:valid". */
function t_auth_headers(string $actor, string $auth): array
{
    $headers = [];
    foreach (explode('+', $auth) as $part) {
        if ($part === 'none') {
            continue;
        } elseif ($part === 'cookie') {
            $headers['Cookie'] = t_session($actor)['cookie'];
        } elseif ($part === 'nonce') {
            $headers['X-WP-Nonce'] = t_nonce($actor);
        } elseif ($part === 'bad_nonce') {
            $headers['X-WP-Nonce'] = 'invalid-nonce';
        } elseif ($part === 'app_password') {
            $login = get_userdata($GLOBALS['T']['users'][$actor])->user_login;
            $headers['Authorization'] = 'Basic ' . base64_encode($login . ':' . t_app_password($actor));
        } elseif ($part === 'basic:key') {
            $login = get_userdata($GLOBALS['T']['users'][$actor])->user_login;
            $headers['Authorization'] = 'Basic ' . base64_encode($login . ':' . $GLOBALS['T']['keys']['valid']);
        } elseif (str_starts_with($part, 'bearer:')) {
            $headers['Authorization'] = rtrim('Bearer ' . $GLOBALS['T']['keys'][substr($part, 7)]);
        } else {
            throw new RuntimeException("Unknown auth part $part");
        }
    }
    return $headers;
}

function t_raw(string $method, string $url, array $headers = [], ?string $body = null): array
{
    $res = wp_remote_request(T_BASE . $url, ['method' => $method, 'headers' => $headers, 'body' => $body, 'timeout' => 30, 'redirection' => 0]);
    if (is_wp_error($res)) {
        return ['status' => 0, 'headers' => [], 'body' => $res->get_error_message(), 'json' => null];
    }
    $raw = $res['headers'];
    $all = is_object($raw) && method_exists($raw, 'getAll') ? $raw->getAll() : (array) $raw;
    $out = [];
    foreach ($all as $k => $v) {
        $out[strtolower((string) $k)] = is_array($v) ? implode(', ', $v) : (string) $v;
    }
    $text = (string) wp_remote_retrieve_body($res);
    return ['status' => (int) wp_remote_retrieve_response_code($res), 'headers' => $out, 'body' => $text, 'json' => json_decode($text, true)];
}

function t_rest(string $method, string $route, array $headers = [], array $query = [], ?array $body = null): array
{
    $url = '/wp-json' . $route . ($query ? '?' . http_build_query($query) : '');
    if ($body !== null) {
        $headers['Content-Type'] = 'application/json';
    }
    return t_raw($method, $url, $headers, $body === null ? null : (string) wp_json_encode($body));
}

/** Everything a client can compare, except the date. */
function t_fingerprint(array $r): string
{
    $headers = $r['headers'];
    unset($headers['date']);
    ksort($headers);
    return $r['status'] . "\n" . json_encode($headers) . "\n" . $r['body'];
}

function t_user(string $actor, string $login, string $role): void
{
    $pw = wp_generate_password(32, false);
    $id = wp_insert_user(['user_login' => $login, 'user_pass' => $pw, 'user_email' => "$login@private.example.test", 'role' => $role, 'display_name' => "Name-$login"]);
    if (is_wp_error($id)) {
        throw new RuntimeException($id->get_error_message());
    }
    $GLOBALS['T']['users'][$actor] = (int) $id;
    $GLOBALS['T']['pw'][$actor] = $pw;
}

function t_xmlrpc(string $method, array $params): array
{
    $xml = '<?xml version="1.0"?><methodCall><methodName>' . $method . '</methodName><params>';
    foreach ($params as $param) {
        $xml .= '<param><value>' . $param . '</value></param>';
    }
    $xml .= '</params></methodCall>';
    return t_raw('POST', '/xmlrpc.php', ['Content-Type' => 'text/xml'], $xml);
}

/** A counter window rolling over mid-test would reset the count. */
function t_wait_window(): void
{
    if (time() % 60 > 50) {
        sleep(11);
    }
}

function t_xs(string $s): string
{
    return '<string>' . htmlspecialchars($s, ENT_XML1) . '</string>';
}

/* ------------------------------------------------------------------ setup */

update_option('permalink_structure', '/%postname%/');
flush_rewrite_rules(true);
blixis_api_install_rate_table();
wp_delete_post(1, true);
wp_delete_post(2, true);
wp_delete_post(3, true);
update_option('blog_public', '1');

add_role('blixis_page_author', 'Page author', ['read' => true, 'edit_pages' => true, 'edit_published_pages' => true]);
add_role('blixis_page_publisher', 'Page publisher', ['read' => true, 'edit_pages' => true, 'publish_pages' => true, 'edit_published_pages' => true]);
t_user('subscriber', 'c_subscriber', 'subscriber');
t_user('default_author', 'c_default_author', 'author');
t_user('page_author_owner', 'c_owner', 'blixis_page_author');
t_user('page_author_other', 'c_other', 'blixis_page_author');
t_user('page_publisher_other', 'c_publisher', 'blixis_page_publisher');
t_user('editor', 'c_editor', 'editor');
t_user('administrator', 'c_admin', 'administrator');
$GLOBALS['T']['users']['anonymous'] = 0;
$U = $GLOBALS['T']['users'];
// Core skips application-password checks entirely until one exists on the site, so create one now.
t_app_password('administrator');
wp_set_current_user($U['administrator']);

$doc = static fn (string $state): string => (string) json_encode(['schema' => 1, 'marker' => T_DOC_MARKER . "-$state", 'text' => 'quote " slash \\ <b>x</b>']);
$make = static function (string $state, array $args) use ($doc): int {
    $id = wp_insert_post($args + ['post_type' => 'page', 'post_status' => 'draft', 'post_author' => $GLOBALS['T']['users']['editor'], 'post_title' => "HIDDEN-TITLE-MARKER $state", 'post_content' => T_HIDDEN_MARKER . " $state"], true);
    if (is_wp_error($id)) {
        throw new RuntimeException($state . ': ' . $id->get_error_message());
    }
    add_metadata('post', $id, '_blixis_document', wp_slash($doc($state)));
    add_metadata('post', $id, '_blixis_doc_shape_0102', wp_slash($doc("shape-$state")));
    add_metadata('post', $id, '_private_secret_meta', 'SECRET-META-MARKER');
    return (int) $id;
};

$S = [];
$S['publish'] = $make('publish', ['post_status' => 'publish', 'post_title' => 'Public page', 'post_name' => 'public-page', 'post_content' => T_PUBLIC_MARKER . ' [blixis_whoami]']);
$S['publish_owned'] = $make('publish_owned', ['post_status' => 'publish', 'post_author' => $U['page_author_owner'], 'post_title' => 'Owned public', 'post_content' => T_PUBLIC_MARKER]);
$S['draft'] = $make('draft', ['post_author' => $U['page_author_owner'], 'post_name' => 'secret-draft-slug']);
$S['pending'] = $make('pending', ['post_status' => 'pending']);
$S['future'] = $make('future', ['post_status' => 'future', 'post_date' => gmdate('Y-m-d H:i:s', time() + 86400), 'post_date_gmt' => gmdate('Y-m-d H:i:s', time() + 86400)]);
$S['private'] = $make('private', ['post_status' => 'private']);
$S['password'] = $make('password', ['post_status' => 'publish', 'post_password' => wp_generate_password(12, false)]);
$S['trash'] = $make('trash', ['post_status' => 'publish']);
wp_trash_post($S['trash']);
$S['unpublished'] = $make('unpublished', ['post_status' => 'publish']);
wp_update_post(['ID' => $S['unpublished'], 'post_status' => 'draft']);
$S['auto_draft'] = $make('auto_draft', ['post_status' => 'auto-draft']);
wp_update_post(['ID' => $S['publish_owned'], 'post_content' => T_PUBLIC_MARKER . ' revised']);
$S['revision'] = (int) array_key_first(wp_get_post_revisions($S['publish_owned']));
$S['attachment'] = (int) wp_insert_attachment(['post_title' => 'Attachment', 'post_status' => 'inherit', 'post_mime_type' => 'image/png', 'post_content' => T_HIDDEN_MARKER], false, 0);
$S['nonpublic_cpt'] = $make('nonpublic_cpt', ['post_type' => 'blixis_secret', 'post_status' => 'publish']);
$S['wp_block'] = $make('wp_block', ['post_type' => 'wp_block', 'post_status' => 'publish']);
$S['post_type_post'] = $make('post_type_post', ['post_type' => 'post', 'post_status' => 'publish', 'post_author' => $U['default_author']]);
$S['nonexistent'] = 900000 + random_int(1, 99999);
$HIDDEN = ['draft', 'pending', 'future', 'private', 'trash', 'password', 'nonexistent', 'unpublished', 'auto_draft', 'revision', 'attachment', 'nonpublic_cpt', 'wp_block', 'post_type_post'];
$wrong_key = static function (string $id): string {
    return "bxk_{$id}_" . rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
};

$scope = ['read:published'];
$valid = blixis_api_key_create($scope);
$revoked = blixis_api_key_create($scope);
blixis_api_key_revoke($revoked['id']);
$expired = blixis_api_key_create($scope, time() - 10);
$rotated = blixis_api_key_create($scope);
$rotated_new = blixis_api_key_rotate($rotated['id']);
$wrong_scope = blixis_api_key_create(['read:other']);
$GLOBALS['T']['keys'] = [
    'valid' => $valid['key'],
    'wrong' => $wrong_key($valid['id']),
    'unknown' => $wrong_key(bin2hex(random_bytes(8))),
    'revoked' => $revoked['key'],
    'expired' => $expired['key'],
    'rotated' => $rotated['key'],
    'rotated_new' => $rotated_new['key'],
    'malformed' => 'not-a-key',
    'empty' => '',
    'wrong_scope' => $wrong_scope['key'],
];
$K = $GLOBALS['T']['keys'];
$plaintexts = [$valid['key'], $revoked['key'], $expired['key'], $rotated['key'], $rotated_new['key'], $wrong_scope['key']];

wp_set_current_user(0);

// The server is a separate process. Confirm it sees what this process wrote.
t_section('harness');
t_config_named('anonymous');
$r = t_rest('GET', '/blixis/v1/health');
t_check('server responds', $r['status'] === 200, $r['status'] . ' ' . substr($r['body'], 0, 300));
$snapshot = [];
foreach ($S as $state => $id) {
    if ($state !== 'nonexistent') {
        $snapshot[$state] = [get_post_status($id), get_metadata('post', $id, '_blixis_document', true), get_post($id)->post_content];
    }
}

/* ------------------------------------------------------------------ authorization matrix */

t_section('matrix');
$matrix = t_json('authz-matrix.json');
$errors = [];
foreach (glob(T_ROOT . '/examples/errors/*.json') as $file) {
    $errors[basename($file, '.json')] = json_decode((string) file_get_contents($file), true);
}
$policy = t_json('cache-policy.json');
$S['none'] = 0;
$rows = 0;
foreach ($matrix['cases'] as $case) {
    if (isset($case['config'])) {
        t_config_named($case['config']);
    }
    foreach ($case['actors'] as $actor) {
        foreach ($case['auths'] as $auth) {
            foreach ($case['post_states'] as $state) {
                $rows++;
                $id = $S[$state];
                $route = str_replace('{id}', (string) $id, $case['route']);
                $query = [];
                foreach ($case['query'] ?? [] as $k => $v) {
                    $query[$k] = str_replace(['{id}', '{valid_key}'], [(string) $id, $K['valid']], (string) $v);
                }
                $headers = t_auth_headers($actor, $auth) + ($case['headers'] ?? []);
                $r = t_rest($case['method'], $route, $headers, $query, $case['body'] ?? null);
                $label = "{$case['id']} actor=$actor auth=$auth state=$state";
                $code = $r['json']['code'] ?? null;
                $want = $case['expect'];
                t_check($label, $r['status'] === $want['status'] && $code === $want['code'], "got {$r['status']} " . var_export($code, true) . " want {$want['status']} {$want['code']}");
                foreach ($K as $secret) {
                    if ($secret !== '' && strlen($secret) > 20 && str_contains($r['body'], $secret)) {
                        t_check("$label does not echo a key", false);
                    }
                }
                foreach ([T_DOC_MARKER, T_HIDDEN_MARKER, 'SECRET-META-MARKER'] as $marker) {
                    if (str_contains($r['body'], $marker)) {
                        t_check("$label leaks $marker", false, substr($r['body'], 0, 200));
                    }
                }
                if ($case['surface'] === 'content') {
                    t_check("$label body equals the contract example", $r['json'] === ($errors[$want['code']] ?? null), $r['body']);
                    t_check("$label error is not stored", ($r['headers']['cache-control'] ?? '') === $policy['classes']['error']['cache_control'] && ($r['headers']['vary'] ?? '') === $policy['vary'] && !isset($r['headers']['etag']), json_encode($r['headers']));
                }
            }
        }
    }
}
t_observe('matrix_expanded_requests', $rows);
foreach ($snapshot as $state => $before) {
    wp_cache_flush();
    $id = $S[$state];
    t_check("denied writes changed nothing for $state", $before === [get_post_status($id), get_metadata('post', $id, '_blixis_document', true), get_post($id)->post_content]);
}

/* ------------------------------------------------------------------ Content API behaviour */

t_section('content');
$item = "/blixis/v1/content/{$S['publish']}";
$bearer = ['Authorization' => "Bearer {$K['valid']}"];

foreach (['keyed' => $bearer, 'anonymous' => []] as $mode => $auth) {
    t_config_named($mode);
    $baseline = t_fingerprint(t_rest('GET', "/blixis/v1/content/{$S['nonexistent']}", $auth));
    foreach ($HIDDEN as $state) {
        $fp = t_fingerprint(t_rest('GET', "/blixis/v1/content/{$S[$state]}", $auth));
        t_check("$mode: $state is byte-identical to a missing ID, headers included", $fp === $baseline, $fp);
    }
}

// Query parameter handling on a real published item, with the shape from the example.
t_config_named('keyed');
$example = t_json('examples/content-item.json');
$r = t_rest('GET', $item, $bearer);
t_check('published item is 200', $r['status'] === 200, $r['body']);
t_check('item has exactly the contract fields', array_keys($r['json']['item'] ?? []) === array_keys($example['item']), $r['body']);
t_check('item envelope matches the example', array_keys($r['json'] ?? []) === array_keys($example) && $r['json']['contract_version'] === $example['contract_version']);
t_check('item date format matches', (bool) preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/', (string) ($r['json']['item']['modified_gmt'] ?? '')));
foreach ([T_DOC_MARKER, 'SECRET-META-MARKER', 'private.example.test', 'Name-c_', '_blixis', 'post_author', 'post_password'] as $forbidden) {
    t_check("item does not contain $forbidden", !str_contains($r['body'], $forbidden));
}
t_check('item contains published content', str_contains($r['body'], T_PUBLIC_MARKER));

$list = t_rest('GET', '/blixis/v1/content', $bearer, ['per_page' => '50']);
$listed = array_column($list['json']['items'] ?? [], 'id');
$list_example = t_json('examples/content-list.json');
t_check('list envelope matches the example', array_keys($list['json'] ?? []) === array_keys($list_example) && array_keys($list['json']['pagination']) === array_keys($list_example['pagination']), $list['body']);
$expected_ids = [$S['publish'], $S['publish_owned']];
sort($listed);
sort($expected_ids);
t_check('list returns only public pages', $listed === $expected_ids, json_encode($listed));
t_check('list total counts only public pages', ($list['json']['pagination']['total'] ?? 0) === 2, $list['body']);
t_check('list never contains hidden content', !str_contains($list['body'], T_HIDDEN_MARKER) && !str_contains($list['body'], T_DOC_MARKER));
$by_slug = t_rest('GET', '/blixis/v1/content', $bearer, ['slug' => 'secret-draft-slug']);
$no_slug = t_rest('GET', '/blixis/v1/content', $bearer, ['slug' => 'no-such-slug-at-all']);
t_check('a draft slug and a missing slug look the same', t_fingerprint($by_slug) === t_fingerprint($no_slug) && $by_slug['json']['items'] === []);
t_check('pagination is capped', t_rest('GET', '/blixis/v1/content', $bearer, ['per_page' => '51'])['status'] === 400);

// Admin credentials do not widen, in anonymous mode, for items and lists, byte for byte.
t_config_named('anonymous');
$anon = t_fingerprint(t_rest('GET', $item));
$anon_list = t_fingerprint(t_rest('GET', '/blixis/v1/content'));
foreach (['cookie', 'cookie+nonce', 'cookie+bad_nonce', 'app_password'] as $auth) {
    $h = t_auth_headers('administrator', $auth);
    t_check("anonymous mode: admin $auth gets the same item bytes", t_fingerprint(t_rest('GET', $item, $h)) === $anon);
    t_check("anonymous mode: admin $auth gets the same list bytes", t_fingerprint(t_rest('GET', '/blixis/v1/content', $h)) === $anon_list);
}
t_check('rendering ran as a logged-out viewer', str_contains($anon, 'VIEWER-0'));
$with_nonce = t_rest('GET', $item, t_auth_headers('administrator', 'cookie+nonce'));
t_check('a public response never carries the visitor nonce', !isset($with_nonce['headers']['x-wp-nonce']), json_encode($with_nonce['headers']));
$naive_public = t_rest('GET', '/blixis-fixture/v1/naive-public', t_auth_headers('administrator', 'cookie+nonce'));
t_observe('naive_public_route_sends_admin_nonce_with_public_cache_control', [isset($naive_public['headers']['x-wp-nonce']), $naive_public['headers']['cache-control'] ?? null]);

// The trap the strict query avoids: WP_Query without an explicit status widens for a logged-in user.
$h = t_auth_headers('administrator', 'cookie+nonce');
$naive_anon = t_rest('GET', '/blixis-fixture/v1/naive-list');
$naive_admin = t_rest('GET', '/blixis-fixture/v1/naive-list', $h);
t_observe('naive_wp_query_anonymous_shows_private', str_contains($naive_anon['body'], '|private'));
t_observe('naive_wp_query_admin_shows_private', str_contains($naive_admin['body'], '|private'));

// A plugin that widens WP_Query cannot widen this API.
update_option('blixis_fixture_widen_queries', '1');
$widen_list = t_rest('GET', '/blixis/v1/content', [], ['per_page' => '50']);
t_check('query-widening plugin does not widen the list', !str_contains($widen_list['body'], T_HIDDEN_MARKER) && ($widen_list['json']['pagination']['total'] ?? 0) === 2, substr($widen_list['body'], 0, 200));
t_observe('naive_wp_query_anonymous_with_widening_plugin_shows_draft', str_contains(t_rest('GET', '/blixis-fixture/v1/naive-list')['body'], '|draft'));
delete_option('blixis_fixture_widen_queries');

// Route spelling, which WordPress matches case-insensitively.
t_config_named('anonymous');
$draft_route = "blixis/v1/content/{$S['draft']}";
$spellings = [
    'upper case namespace' => "/wp-json/BLIXIS/V1/content/{$S['draft']}",
    'upper case route' => "/wp-json/blixis/v1/CONTENT/{$S['draft']}",
    'trailing slash' => "/wp-json/$draft_route/",
    'double slash' => "/wp-json//$draft_route",
    'rest_route parameter' => "/?rest_route=/$draft_route",
    'encoded rest_route' => '/?rest_route=' . rawurlencode("/$draft_route"),
    'upper rest_route' => "/?rest_route=/BLIXIS/v1/content/{$S['draft']}",
];
foreach ($spellings as $name => $url) {
    $r = t_raw('GET', $url, ['Origin' => 'https://evil.example.test']);
    t_check("spelling '$name' gets the contract 404 and no core CORS", $r['status'] === 404 && $r['json'] === $errors['NOT_FOUND'] && !isset($r['headers']['access-control-allow-origin']), $r['status'] . ' ' . $r['body'] . json_encode($r['headers']));
}

// HEAD and OPTIONS do not reveal more than GET.
$head_draft = t_rest('HEAD', "/blixis/v1/content/{$S['draft']}");
$head_missing = t_rest('HEAD', "/blixis/v1/content/{$S['nonexistent']}");
t_check('HEAD on a draft matches HEAD on a missing ID', $head_draft['status'] === 404 && t_fingerprint($head_draft) === t_fingerprint($head_missing));
$opt_draft = t_rest('OPTIONS', "/blixis/v1/content/{$S['draft']}");
$opt_missing = t_rest('OPTIONS', "/blixis/v1/content/{$S['nonexistent']}");
$opt_public = t_rest('OPTIONS', $item);
t_check('OPTIONS is the same for draft, missing, and published IDs', t_fingerprint($opt_draft) === t_fingerprint($opt_missing) && t_fingerprint($opt_public) === t_fingerprint($opt_missing), t_fingerprint($opt_draft));
t_check('method override cannot turn a read into a write', t_rest('GET', $item, ['X-HTTP-Method-Override' => 'DELETE'])['status'] === 200 && get_post_status($S['publish']) === 'publish');

// Timing is measured, not asserted: it is noisy in a container.
$median = static function (int $id): float {
    $t = [];
    for ($i = 0; $i < 15; $i++) {
        $s = microtime(true);
        t_rest('GET', "/blixis/v1/content/$id");
        $t[] = microtime(true) - $s;
    }
    sort($t);
    return round($t[7] * 1000, 1);
};
t_observe('median_ms_404_draft_vs_missing', [$median($S['draft']), $median($S['nonexistent']), $median($S['draft']), $median($S['nonexistent'])]);

// Honest limit of the uniform 404: core routes still distinguish these IDs.
$core_draft = t_rest('GET', "/wp/v2/pages/{$S['draft']}");
$core_missing = t_rest('GET', "/wp/v2/pages/{$S['nonexistent']}");
t_observe('core_enumeration_draft_vs_missing', [$core_draft['status'], $core_missing['status']]);

// Slug disclosure through a published child of a draft parent.
wp_set_current_user($U['administrator']);
$child = wp_insert_post(['post_type' => 'page', 'post_status' => 'publish', 'post_parent' => $S['draft'], 'post_title' => 'Child', 'post_name' => 'public-child']);
wp_set_current_user(0);
$r = t_rest('GET', "/blixis/v1/content/$child");
t_observe('published_child_link_discloses_draft_parent_slug', str_contains($r['body'], 'secret-draft-slug'));
wp_delete_post($child, true);

// What core does with control parameters on a route that has no counter-measures.
$unguarded = '/blixis-fixture/v1/naive-public';
$envelope = t_rest('GET', '/blixis-fixture/v1/no-such-route', [], ['_envelope' => '1']);
$jsonp = t_rest('GET', $unguarded, [], ['_jsonp' => 'cb']);
$fields = t_rest('GET', $unguarded, [], ['_fields' => 'other']);
$method = t_rest('GET', $unguarded, [], ['_method' => 'DELETE']);
$upper = t_rest('GET', '/BLIXIS-FIXTURE/V1/naive-public');
t_observe('core_control_params_on_unguarded_route', [
    'envelope_http_and_inner_status' => [$envelope['status'], $envelope['json']['status'] ?? null],
    'jsonp_wraps_body' => str_contains($jsonp['body'], 'cb('),
    'fields_body' => $fields['body'],
    'method_override_status_code' => [$method['status'], $method['json']['code'] ?? null],
    'upper_case_route_status' => $upper['status'],
]);

// Discovery: the namespace index.
$index = t_rest('GET', '/blixis/v1');
t_observe('namespace_index_anonymous', [$index['status'], array_keys($index['json']['routes'] ?? [])]);
$root = t_rest('GET', '/');
t_observe('site_index_namespaces', array_values(array_filter($root['json']['namespaces'] ?? [], static fn (string $n): bool => str_starts_with($n, 'blixis'))));
t_observe('site_index_lists_key_admin_route', isset($root['json']['routes']['/blixis-admin/v1/keys']));
t_check('site index reveals no key material', !str_contains($root['body'], 'bxk_'));

// Internal dispatch: another plugin or an admin screen preloading this route.
wp_set_current_user($U['administrator']);
$internal = rest_do_request(new WP_REST_Request('GET', "/blixis/v1/content/{$S['draft']}"));
t_check('internal dispatch keeps the caller logged in', get_current_user_id() === $U['administrator']);
t_check('internal dispatch as admin does not see a draft', $internal->get_status() === 404, (string) $internal->get_status());
$request = new WP_REST_Request('GET', "/blixis/v1/content/{$S['publish']}");
$request->set_query_params(['status' => 'draft']);
t_check('internal dispatch refuses query tricks too', rest_do_request($request)->get_status() === 400);
$request = new WP_REST_Request('GET', "/blixis/v1/content/{$S['publish']}");
$rendered = rest_do_request($request)->get_data();
t_check('internal dispatch renders logged out', str_contains((string) ($rendered['item']['html'] ?? ''), 'VIEWER-0') && get_current_user_id() === $U['administrator']);
wp_set_current_user(0);

// Batch accepts only write methods, so it cannot carry a read of this namespace.
$batch = t_rest('POST', '/batch/v1', t_auth_headers('administrator', 'cookie+nonce'), [], ['requests' => [['method' => 'POST', 'path' => "/blixis/v1/content/{$S['draft']}", 'body' => []]]]);
t_check('batch route reaches only the read-only refusal and leaks nothing', !str_contains($batch['body'], T_HIDDEN_MARKER) && ($batch['json']['responses'][0]['status'] ?? 0) === 405, substr($batch['body'], 0, 200));
$batch_get = t_rest('POST', '/batch/v1', t_auth_headers('administrator', 'cookie+nonce'), [], ['requests' => [['method' => 'GET', 'path' => "/blixis/v1/content/{$S['draft']}"]]]);
t_check('batch refuses a GET outright', $batch_get['status'] === 400 && !str_contains($batch_get['body'], T_HIDDEN_MARKER), $batch_get['status'] . substr($batch_get['body'], 0, 150));

/* ------------------------------------------------------------------ keys */

t_section('keys');
t_config_named('keyed');
$ok = static fn (string $key): int => t_rest('GET', $item, ['Authorization' => "Bearer $key"])['status'];
t_check('valid key is accepted', $ok($K['valid']) === 200);
t_check('replacement key from rotation is accepted', $ok($K['rotated_new']) === 200);
t_check('bearer scheme is case-insensitive', t_rest('GET', $item, ['Authorization' => "bearer {$K['valid']}"])['status'] === 200);
$unauth = t_rest('GET', $item, ['Authorization' => "Bearer {$K['wrong']}"]);
t_check('401 carries a Bearer challenge', ($unauth['headers']['www-authenticate'] ?? '') === 'Bearer realm="blixis-content"', json_encode($unauth['headers']));
$fingerprints = [];
foreach (['wrong', 'unknown', 'revoked', 'expired', 'rotated', 'malformed', 'empty'] as $bad) {
    $fingerprints[$bad] = t_fingerprint(t_rest('GET', $item, ['Authorization' => rtrim("Bearer {$K[$bad]}")]));
}
t_check('every invalid key is indistinguishable from the others', count(array_unique($fingerprints)) === 1, json_encode(array_keys(array_unique($fingerprints))));
foreach (['api_key', 'key', 'token', 'access_token'] as $param) {
    $r = t_rest('GET', $item, [], [$param => $K['valid']]);
    t_check("key in query parameter $param is refused", $r['status'] === 401);
}
t_check('key in a cookie is refused', t_rest('GET', $item, ['Cookie' => 'bxk=' . $K['valid']])['status'] === 401);

// Key administration: display once.
$h = t_auth_headers('administrator', 'cookie+nonce');
$created = t_rest('POST', '/blixis-admin/v1/keys', $h);
$new_key = (string) ($created['json']['key'] ?? '');
$new_id = (string) ($created['json']['id'] ?? '');
$plaintexts[] = $new_key;
t_check('admin creates a key (201)', $created['status'] === 201 && $new_id !== '', $created['body']);
t_check('created key has the contract format', preg_match('/\Abxk_[a-f0-9]{16}_[A-Za-z0-9_-]{43}\z/', $new_key) === 1);
t_check('created key works', $ok($new_key) === 200);
t_check('create response is not cacheable', str_contains($created['headers']['cache-control'] ?? '', 'no-store'), $created['headers']['cache-control'] ?? '');
$listing = t_rest('GET', '/blixis-admin/v1/keys', $h);
t_check('listing shows the new key ID', str_contains($listing['body'], $new_id));
t_check('listing never shows a secret or a hash', !str_contains($listing['body'], $new_key) && !str_contains($listing['body'], substr($new_key, 21)) && !str_contains($listing['body'], '"hash"'), substr($listing['body'], 0, 300));
$a_key = blixis_api_key_create($scope);
$b_key = blixis_api_key_create($scope);
$plaintexts[] = $a_key['key'];
$plaintexts[] = $b_key['key'];
t_check('two keys differ', $a_key['key'] !== $b_key['key'] && $a_key['id'] !== $b_key['id']);
t_check('revoke route revokes', (t_rest('DELETE', "/blixis-admin/v1/keys/$new_id", $h)['json']['revoked'] ?? false) === true);
t_check('revoked key stops at once', $ok($new_key) === 401);
t_check('a key cannot use key administration', t_rest('GET', '/blixis-admin/v1/keys', $bearer)['status'] === 401);
t_check('a key cannot revoke itself', t_rest('DELETE', "/blixis-admin/v1/keys/{$valid['id']}", $bearer)['status'] === 401);
t_check('keys are not autoloaded', (string) $GLOBALS['wpdb']->get_var($GLOBALS['wpdb']->prepare("SELECT autoload FROM {$GLOBALS['wpdb']->options} WHERE option_name = %s", "blixis_api_key_{$valid['id']}")) !== 'yes');
t_check('stored hash is keyed, not a bare digest', get_option("blixis_api_key_{$valid['id']}")['hash'] !== hash('sha256', substr($K['valid'], 21)));

// The identity boundary: a key identifies a client and never logs in a WordPress user.
$me_key = t_rest('GET', '/blixis-fixture/v1/whoami', $bearer);
t_check('bearer key leaves the WordPress user at 0', ($me_key['json']['user'] ?? -1) === 0 && ($me_key['json']['can_edit_pages'] ?? true) === false, $me_key['body']);
$h_app = t_auth_headers('administrator', 'app_password');
$me_app = t_rest('GET', '/blixis-fixture/v1/whoami', $h_app);
t_check('contrast: an application password does log in a WordPress user', ($me_app['json']['user'] ?? 0) === $U['administrator'], $me_app['body']);
t_config_named('anonymous');
t_check('an application password is not treated as a key', t_rest('GET', $item, $h_app)['headers']['cache-control'] === $policy['classes']['public_success']['cache_control']);
t_config_named('keyed');
global $wp_filter;
$callbacks = [];
foreach ($wp_filter['determine_current_user']->callbacks ?? [] as $group) {
    foreach ($group as $cb) {
        $callbacks[] = is_string($cb['function']) ? $cb['function'] : 'closure';
    }
}
t_check('this proof adds nothing to determine_current_user', array_diff($callbacks, ['wp_validate_auth_cookie', 'wp_validate_logged_in_cookie', 'wp_validate_application_password', 'json_basic_auth_handler']) === [], json_encode($callbacks));

// Secret exposure: every table and every log. The sweep includes failed attempts above.
global $wpdb;
$dump = '';
foreach ($wpdb->get_col('SHOW TABLES') as $table) {
    foreach ($wpdb->get_results("SELECT * FROM `$table`", ARRAY_N) as $row) {
        $dump .= implode("\x1f", array_map('strval', $row)) . "\n";
    }
}
$logs = ((string) @file_get_contents('/tmp/debug.log')) . ((string) @file_get_contents('/tmp/server.log'));
t_check('sweep read real data', strlen($dump) > 10000 && str_contains($dump, "blixis_api_key_{$valid['id']}"));
$audit_probe = blixis_api_key_create($scope);
$plaintexts[] = $audit_probe['key'];
t_rest('GET', $item, ['Authorization' => "Bearer {$audit_probe['key']}"]);
t_check('one request writes one audit line, because the gate runs once', substr_count((string) @file_get_contents('/tmp/debug.log'), "key_id={$audit_probe['id']}") === 1);
t_check('audit log records a key ID', str_contains($logs, "key_id={$valid['id']}"));
t_check('audit log records a denied outcome', str_contains($logs, 'outcome=revoked') && str_contains($logs, 'outcome=expired') && str_contains($logs, 'outcome=wrong_secret') && str_contains($logs, 'outcome=malformed'));
foreach ($plaintexts as $i => $plain) {
    $secret = substr($plain, 21);
    t_check("key $i secret is in no table", !str_contains($dump, $secret));
    t_check("key $i secret is in no log", !str_contains($logs, $secret));
}
foreach (['wrong', 'unknown'] as $bad) {
    t_check("presented $bad secret is in no log", !str_contains($logs, substr($K[$bad], 21)));
}
t_check('presented malformed value is in no log line', !str_contains($logs, 'not-a-key'));

// How core treats a failed application password, by password shape.
foreach (['key-shaped' => $K['valid'], 'alphanumeric' => wp_generate_password(24, false), 'spaced' => 'abcd efgh ijkl mnop qrst uvwx'] as $shape => $wrong) {
    $wrong_basic = ['Authorization' => 'Basic ' . base64_encode('c_admin:' . $wrong)];
    $res = t_rest('GET', '/wp/v2/users/me', $wrong_basic);
    $res2 = t_rest('GET', '/blixis-fixture/v1/whoami', $wrong_basic);
    t_observe("failed_app_password_$shape", [$res['status'], $res['json']['code'] ?? null, $res2['status'], $res2['json']['code'] ?? ($res2['json']['user'] ?? null)]);
}

/* ------------------------------------------------------------------ transport */

t_section('transport');
$spoof = ['X-Forwarded-Proto' => 'https', 'X-Forwarded-Ssl' => 'on', 'Forwarded' => 'proto=https'];
t_config(null);
$who = t_rest('GET', '/blixis-fixture/v1/whoami', $spoof);
t_check('core is_ssl() ignores forwarded headers', ($who['json']['is_ssl'] ?? true) === false, $who['body']);
t_check('default: untrusted peer cannot claim HTTPS', t_rest('GET', $item, $spoof + $bearer)['json']['code'] === 'HTTPS_REQUIRED');
t_check('default: no key, plain HTTP refused before any auth detail', t_rest('GET', $item)['json']['code'] === 'HTTPS_REQUIRED');
t_config(['mode' => 'keyed', 'require_https' => true, 'trusted_proxies' => ['192.0.2.10']]);
t_check('a proxy allowlist that excludes this peer does not trust the header', t_rest('GET', $item, $spoof + $bearer)['json']['code'] === 'HTTPS_REQUIRED');
t_config(['mode' => 'keyed', 'require_https' => true, 'trusted_proxies' => ['127.0.0.1']]);
t_check('a trusted peer that says https is accepted', t_rest('GET', $item, ['X-Forwarded-Proto' => 'https'] + $bearer)['status'] === 200);
t_check('a trusted peer that says http is refused', t_rest('GET', $item, ['X-Forwarded-Proto' => 'http'] + $bearer)['json']['code'] === 'HTTPS_REQUIRED');
t_check('a trusted peer with no header is refused', t_rest('GET', $item, $bearer)['json']['code'] === 'HTTPS_REQUIRED');
t_config(['mode' => 'anonymous', 'require_https' => true]);
t_check('anonymous mode serves plain HTTP when no credential is sent', t_rest('GET', $item)['status'] === 200);
t_check('anonymous mode still refuses a key over plain HTTP', t_rest('GET', $item, $bearer)['json']['code'] === 'HTTPS_REQUIRED');
t_config(null);
t_check('anonymous mode is off by default', blixis_api_config()['mode'] === 'keyed');
t_config(['require_https' => false]);
t_check('with no mode set, anonymous reads are refused', t_rest('GET', $item)['json']['code'] === 'UNAUTHORIZED');

/* ------------------------------------------------------------------ CORS */

t_section('cors');
$allowed = 'https://app.example.test';
$foreign = 'https://evil.example.test';
t_config(['mode' => 'keyed', 'require_https' => false, 'cors_allowlist' => [$allowed]]);
$r = t_rest('GET', $item, ['Origin' => $foreign] + $bearer);
t_check('foreign origin is not reflected', !isset($r['headers']['access-control-allow-origin']), json_encode($r['headers']));
t_check('CORS does not block the server-side read: a valid key still works', $r['status'] === 200);
$r = t_rest('GET', $item, ['Origin' => $allowed]);
t_check('allowed origin without a key is still 401: CORS does not authorize', $r['status'] === 401 && ($r['headers']['access-control-allow-origin'] ?? '') === $allowed, json_encode($r['headers']));
$r = t_rest('GET', $item, ['Origin' => $allowed] + $bearer);
t_check('allowed origin is echoed exactly', ($r['headers']['access-control-allow-origin'] ?? '') === $allowed);
t_check('credentials are never allowed', !isset($r['headers']['access-control-allow-credentials']));
$pre = t_rest('OPTIONS', $item, ['Origin' => $allowed, 'Access-Control-Request-Method' => 'GET', 'Access-Control-Request-Headers' => 'authorization']);
t_check('preflight for an allowed origin works and does not need a key', in_array($pre['status'], [200, 204], true) && ($pre['headers']['access-control-allow-origin'] ?? '') === $allowed, $pre['status'] . json_encode($pre['headers']));
$pre = t_rest('OPTIONS', $item, ['Origin' => $foreign, 'Access-Control-Request-Method' => 'GET']);
t_check('preflight for a foreign origin is not allowed', !isset($pre['headers']['access-control-allow-origin']));
$core = t_rest('GET', '/wp/v2/types', ['Origin' => $foreign]);
t_observe('core_routes_reflect_any_origin_with_credentials', [$core['headers']['access-control-allow-origin'] ?? null, $core['headers']['access-control-allow-credentials'] ?? null]);

/* ------------------------------------------------------------------ rate limits */

t_section('rate-limit');
// A second server with several workers, because `wp server` handles one request at a time.
$proc = proc_open(
    ['php', '-S', '127.0.0.1:8081', '-t', '/tmp/wp', '/tmp/contract/wp/parallel-router.php'],
    [0 => ['file', '/dev/null', 'r'], 1 => ['file', '/dev/null', 'a'], 2 => ['file', '/dev/null', 'a']],
    $pipes,
    '/tmp/wp',
    array_merge(getenv(), ['PHP_CLI_SERVER_WORKERS' => '8'])
);
$parallel = static function (string $route, int $n): array {
    $mh = curl_multi_init();
    $handles = [];
    for ($i = 0; $i < $n; $i++) {
        $ch = curl_init("http://127.0.0.1:8081/?rest_route=$route");
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60]);
        curl_multi_add_handle($mh, $ch);
        $handles[] = $ch;
    }
    do {
        curl_multi_exec($mh, $running);
        curl_multi_select($mh, 0.1);
    } while ($running > 0);
    $codes = [];
    foreach ($handles as $ch) {
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $codes[$code] = ($codes[$code] ?? 0) + 1;
        curl_multi_remove_handle($mh, $ch);
    }
    curl_multi_close($mh);
    return $codes;
};
$ready = false;
for ($i = 0; $i < 30 && !$ready; $i++) {
    usleep(300000);
    $ready = @file_get_contents('http://127.0.0.1:8081/?rest_route=/blixis/v1/health') !== false;
}
t_check('multi-worker server started', $ready && function_exists('curl_multi_init'));
$transient = $parallel('/blixis-fixture/v1/rl-transient', 60);
$atomic = $parallel('/blixis-fixture/v1/rl-atomic', 60);
t_observe('transient_limit_10_of_60_parallel_status_counts', $transient);
t_observe('atomic_limit_10_of_60_parallel_status_counts', $atomic);
t_check('atomic counter allows exactly the limit under concurrency', ($atomic[200] ?? 0) === 10 && ($atomic[429] ?? 0) === 50, json_encode($atomic));
$cache_hits = [];
for ($i = 0; $i < 4; $i++) {
    $cache_hits[] = t_rest('GET', '/blixis-fixture/v1/rl-object-cache')['json'];
}
t_check('default object cache does not survive a request, so wp_cache_incr cannot count', array_column($cache_hits, 'hits') === [1, 1, 1, 1] && $cache_hits[0]['external'] === false, json_encode($cache_hits));
proc_terminate($proc);

// The contract response, per key and per address.
$limited_key = blixis_api_key_create($scope);
$plaintexts[] = $limited_key['key'];
$other_key = blixis_api_key_create($scope);
$plaintexts[] = $other_key['key'];
$wpdb->query("TRUNCATE {$wpdb->prefix}blixis_api_rate");
t_config(['mode' => 'keyed', 'require_https' => false, 'rate_limit' => 3]);
$limited_auth = ['Authorization' => "Bearer {$limited_key['key']}"];
t_wait_window();
$statuses = [];
for ($i = 0; $i < 5; $i++) {
    $last = t_rest('GET', $item, $limited_auth);
    $statuses[] = $last['status'];
}
t_check('per-key limit enforces the contract count', $statuses === [200, 200, 200, 429, 429], json_encode($statuses));
t_check('429 body equals the contract example', $last['json'] === $errors['RATE_LIMITED'], $last['body']);
t_check('429 has Retry-After and is not stored', ($last['headers']['retry-after'] ?? '') === '60' && $last['headers']['cache-control'] === 'no-store');
t_check('one key does not spend another key\'s quota', t_rest('GET', $item, ['Authorization' => "Bearer {$other_key['key']}"])['status'] === 200);
$wpdb->query("TRUNCATE {$wpdb->prefix}blixis_api_rate");
t_config(['mode' => 'anonymous', 'require_https' => false, 'rate_limit' => 2]);
t_wait_window();
$statuses = [];
foreach (['198.51.100.1', '198.51.100.2', '198.51.100.3', '198.51.100.4'] as $ip) {
    $statuses[] = t_rest('GET', $item, ['X-Forwarded-For' => $ip])['status'];
}
t_check('a spoofed X-Forwarded-For does not reset an address limit', $statuses === [200, 200, 429, 429], json_encode($statuses));
$wpdb->query("TRUNCATE {$wpdb->prefix}blixis_api_rate");
t_config(['mode' => 'anonymous', 'require_https' => false, 'rate_limit' => 1, 'trusted_proxies' => ['127.0.0.1']]);
t_wait_window();
$statuses = [];
foreach (['198.51.100.1', '198.51.100.2', '198.51.100.1'] as $ip) {
    $statuses[] = t_rest('GET', $item, ['X-Forwarded-For' => "203.0.113.9, $ip"])['status'];
}
t_check('behind a trusted proxy the last hop identifies the client', $statuses === [200, 200, 429], json_encode($statuses));

/* ------------------------------------------------------------------ cache */

t_section('cache');
$expect_class = static function (string $label, array $r, string $class) use ($policy): void {
    $want = $policy['classes'][$class];
    t_check("$label Cache-Control", ($r['headers']['cache-control'] ?? '') === $want['cache_control'], $r['headers']['cache-control'] ?? 'none');
    t_check("$label Vary", ($r['headers']['vary'] ?? '') === $policy['vary'], $r['headers']['vary'] ?? 'none');
    t_check("$label ETag", isset($r['headers']['etag']) === $want['etag'], $r['headers']['etag'] ?? 'none');
    t_check("$label sets no cookie", !isset($r['headers']['set-cookie']));
};
t_config_named('anonymous');
$pub = t_rest('GET', $item);
$expect_class('anonymous item', $pub, 'public_success');
$expect_class('anonymous list', t_rest('GET', '/blixis/v1/content'), 'public_success');
$expect_class('schema', t_rest('GET', '/blixis/v1/schema'), 'schema');
$expect_class('health', t_rest('GET', '/blixis/v1/health'), 'health');
$expect_class('anonymous mode with a key', t_rest('GET', $item, $bearer), 'keyed_success');
$expect_class('anonymous mode, logged-in admin', t_rest('GET', $item, t_auth_headers('administrator', 'cookie+nonce')), 'public_success');
$expect_class('anonymous mode, 404', t_rest('GET', "/blixis/v1/content/{$S['draft']}"), 'error');
t_config_named('keyed');
$keyed = t_rest('GET', $item, $bearer);
$expect_class('keyed item', $keyed, 'keyed_success');
$expect_class('keyed list', t_rest('GET', '/blixis/v1/content', $bearer), 'keyed_success');
$expect_class('keyed 401', t_rest('GET', $item), 'error');
$expect_class('keyed 404', t_rest('GET', "/blixis/v1/content/{$S['draft']}", $bearer), 'error');
t_check('an ETag does not depend on the key', $keyed['headers']['etag'] === $pub['headers']['etag']);
t_check('ETag is strong and opaque', preg_match('/^"[a-f0-9]{64}"$/', $keyed['headers']['etag']) === 1);

$etag = $keyed['headers']['etag'];
$not_modified = t_rest('GET', $item, $bearer + ['If-None-Match' => $etag]);
t_check('conditional GET returns 304', $not_modified['status'] === 304);
t_check('304 has no body', $not_modified['body'] === '', $not_modified['body']);
t_check('304 repeats ETag, Cache-Control, Vary', ($not_modified['headers']['etag'] ?? '') === $etag && isset($not_modified['headers']['cache-control']) && isset($not_modified['headers']['vary']));
t_check('weak form and lists also match', t_rest('GET', $item, $bearer + ['If-None-Match' => "\"nope\", W/$etag"])['status'] === 304);
t_check('stale ETag returns 200', t_rest('GET', $item, $bearer + ['If-None-Match' => '"stale"'])['status'] === 200);
t_check('ETag without a key does not revalidate', t_rest('GET', $item, ['If-None-Match' => $etag])['status'] === 401);
t_check('list ETag revalidates', t_rest('GET', '/blixis/v1/content', $bearer + ['If-None-Match' => t_rest('GET', '/blixis/v1/content', $bearer)['headers']['etag']])['status'] === 304);

// Published, then unpublished: the old validator must not keep the content alive.
foreach (['draft' => 'draft', 'private' => 'private', 'pending' => 'pending', 'trash' => 'trash', 'password' => 'publish'] as $name => $status) {
    wp_set_current_user($U['administrator']);
    $id = wp_insert_post(['post_type' => 'page', 'post_status' => 'publish', 'post_title' => "Lifecycle $name", 'post_content' => 'LIFECYCLE-MARKER']);
    wp_set_current_user(0);
    $route = "/blixis/v1/content/$id";
    $live = t_rest('GET', $route, $bearer);
    $live_etag = $live['headers']['etag'] ?? '';
    $list_before = t_rest('GET', '/blixis/v1/content', $bearer, ['per_page' => '50']);
    t_check("lifecycle $name: starts public", $live['status'] === 200 && t_rest('GET', $route, $bearer + ['If-None-Match' => $live_etag])['status'] === 304);
    wp_set_current_user($U['administrator']);
    if ($name === 'password') {
        wp_update_post(['ID' => $id, 'post_password' => wp_generate_password(12, false)]);
    } elseif ($name === 'trash') {
        wp_trash_post($id);
    } else {
        wp_update_post(['ID' => $id, 'post_status' => $status]);
    }
    wp_set_current_user(0);
    $gone = t_rest('GET', $route, $bearer + ['If-None-Match' => $live_etag]);
    t_check("lifecycle $name: old ETag gets 404, not 304", $gone['status'] === 404 && $gone['json'] === $errors['NOT_FOUND'], (string) $gone['status']);
    t_check("lifecycle $name: wildcard If-None-Match gets 404", t_rest('GET', $route, $bearer + ['If-None-Match' => '*'])['status'] === 404);
    t_check("lifecycle $name: 404 drops the validator", !isset($gone['headers']['etag']) && $gone['headers']['cache-control'] === 'no-store');
    $list_after = t_rest('GET', '/blixis/v1/content', $bearer + ['If-None-Match' => $list_before['headers']['etag']], ['per_page' => '50']);
    t_check("lifecycle $name: list ETag changes and the item is gone", $list_after['status'] === 200 && !str_contains($list_after['body'], 'LIFECYCLE-MARKER'), (string) $list_after['status']);
    wp_delete_post($id, true);
}

// A published edit changes the validator.
wp_set_current_user($U['administrator']);
wp_update_post(['ID' => $S['publish_owned'], 'post_content' => T_PUBLIC_MARKER . ' edited']);
wp_set_current_user(0);

/* ------------------------------------------------------------------ preview */

t_section('preview');
$preview = "/?page_id={$S['draft']}&preview=true";
$noncache_ok = static fn (array $r): bool => str_contains($r['headers']['cache-control'] ?? '', 'no-store') && ($r['headers']['x-robots-tag'] ?? '') === $policy['preview']['x_robots_tag'];
foreach (['anonymous' => [], 'cookie without login' => ['Cookie' => 'wordpress_logged_in_x=forged'], 'subscriber' => ['Cookie' => t_session('subscriber')['cookie']], 'other author' => ['Cookie' => t_session('page_author_other')['cookie']], 'default author' => ['Cookie' => t_session('default_author')['cookie']]] as $who => $h) {
    $r = t_raw('GET', $preview, $h);
    // State-specific markers: navigation blocks legitimately list the title of a published password page.
    t_check("preview: $who does not see the draft", !str_contains($r['body'], T_HIDDEN_MARKER . ' draft') && !str_contains($r['body'], 'HIDDEN-TITLE-MARKER draft'), (string) $r['status']);
    t_check("preview: $who is not public-cacheable", !str_contains($r['headers']['cache-control'] ?? '', 'public'), $r['headers']['cache-control'] ?? 'none');
}
foreach (['page_author_owner', 'editor', 'administrator'] as $who) {
    $r = t_raw('GET', $preview, ['Cookie' => t_session($who)['cookie']]);
    t_check("preview: $who sees the draft", $r['status'] === 200 && str_contains($r['body'], T_HIDDEN_MARKER), (string) $r['status']);
    t_check("preview: $who gets no-store and noindex headers", $noncache_ok($r), json_encode($r['headers']));
    t_check("preview: $who page has a robots noindex tag", (bool) preg_match('/<meta[^>]+name=.robots.[^>]+noindex/i', $r['body']));
}
$r = t_raw('GET', "/?page_id={$S['draft']}", ['Cookie' => t_session('editor')['cookie']]);
t_check('preview: a draft opened without preview=true gets the same protection', $r['status'] === 200 && $noncache_ok($r), $r['status'] . json_encode($r['headers']));

// What core does on its own, without the headers this proof adds.
update_option('blixis_fixture_preview_headers', '0');
$core_preview = t_raw('GET', $preview, ['Cookie' => t_session('editor')['cookie']]);
t_observe('core_preview_headers_only', ['cache-control' => $core_preview['headers']['cache-control'] ?? null, 'x-robots-tag' => $core_preview['headers']['x-robots-tag'] ?? null, 'meta_noindex' => (bool) preg_match('/<meta[^>]+name=.robots.[^>]+noindex/i', $core_preview['body'])]);
update_option('blixis_fixture_preview_headers', '1');

// Draft edits to a published page: the case where a shared record could leak.
$edit_h = t_auth_headers('editor', 'cookie+nonce');
$core_auto = t_rest('POST', "/wp/v2/pages/{$S['publish']}/autosaves", $edit_h, [], ['title' => 'AUTOSAVE-TITLE-MARKER', 'content' => 'AUTOSAVE-BODY-MARKER']);
$blixis_auto = t_rest('POST', "/blixis-editor/v1/pages/{$S['publish']}/autosave", $edit_h, [], ['document' => '{"schema":1,"marker":"AUTOSAVE-DOC-MARKER"}']);
t_check('published page: core autosave accepted', in_array($core_auto['status'], [200, 201], true), $core_auto['body']);
t_check('published page: document autosave accepted', $blixis_auto['status'] === 200, $blixis_auto['body']);
wp_cache_flush();
t_check('published page stays published', get_post_status($S['publish']) === 'publish');
t_check('published page document is unchanged', get_post_meta($S['publish'], '_blixis_document', true) === $doc('publish'));
t_check('published page content is unchanged', str_contains(get_post($S['publish'])->post_content, T_PUBLIC_MARKER));
$p_nonce = t_nonce('editor', "post_preview_{$S['publish']}");
$with_autosave = "/?page_id={$S['publish']}&preview=true&preview_id={$S['publish']}&preview_nonce=$p_nonce";
$r = t_raw('GET', $with_autosave, ['Cookie' => t_session('editor')['cookie']]);
t_check('autosave preview shows the editor the draft edit', $r['status'] === 200 && str_contains($r['body'], 'AUTOSAVE-BODY-MARKER'), (string) $r['status']);
t_check('autosave preview is no-store and noindex', $noncache_ok($r), json_encode($r['headers']));
$r = t_raw('GET', $with_autosave);
t_check('stolen preview URL shows anonymous nothing of the edit', !str_contains($r['body'], 'AUTOSAVE-BODY-MARKER'), (string) $r['status']);
t_observe('stolen_preview_url_anonymous_status', $r['status']);
$r = t_raw('GET', $with_autosave, ['Cookie' => t_session('subscriber')['cookie']]);
t_check('stolen preview URL shows a subscriber nothing of the edit', !str_contains($r['body'], 'AUTOSAVE-BODY-MARKER'), (string) $r['status']);
$r = t_raw('GET', '/public-page/?preview=true');
t_check('public ?preview=true on a published page shows no edit', $r['status'] === 200 && !str_contains($r['body'], 'AUTOSAVE-BODY-MARKER'), (string) $r['status']);
t_config_named('anonymous');
foreach (['anonymous' => [], 'editor with nonce' => t_auth_headers('editor', 'cookie+nonce')] as $who => $h) {
    foreach ([$item, '/blixis/v1/content'] as $route) {
        $r = t_rest('GET', $route, $h);
        t_check("$who on $route sees no draft edit", !preg_match('/AUTOSAVE-(BODY|TITLE|DOC)-MARKER/', $r['body']));
    }
}
$r = t_raw('GET', '/public-page/');
t_check('public permalink shows no draft edit', $r['status'] === 200 && !str_contains($r['body'], 'AUTOSAVE-BODY-MARKER') && str_contains($r['body'], T_PUBLIC_MARKER), (string) $r['status']);

/* ------------------------------------------------------------------ editor boundary, positive cases */

t_section('editor');
$owner = t_auth_headers('page_author_owner', 'cookie+nonce');
$route = "/blixis-editor/v1/pages/{$S['draft']}";
$r = t_rest('GET', "$route/document", $owner);
t_check('owner reads own draft document', $r['status'] === 200 && ($r['json']['document'] ?? '') === $doc('draft'), $r['body']);
$tricky = (string) json_encode(['schema' => 1, 'text' => 'quote " slash \\ é <b>x</b>'], JSON_UNESCAPED_UNICODE);
$r = t_rest('PUT', "$route/document", $owner, [], ['document' => $tricky]);
wp_cache_flush();
t_check('owner saves own draft, byte-exact', $r['status'] === 200 && get_post_meta($S['draft'], '_blixis_document', true) === $tricky, $r['body']);
foreach (['status' => 'publish', 'post_status' => 'publish'] as $k => $v) {
    $r = t_rest('POST', "$route/autosave", $owner, [$k => $v], [$k => $v, 'document' => $tricky]);
    wp_cache_flush();
    t_check("autosave with $k=publish does not publish", $r['status'] === 200 && get_post_status($S['draft']) === 'draft', $r['body']);
}
$r = t_rest('POST', "/wp/v2/pages/{$S['draft']}/autosaves", $owner, [], ['status' => 'publish', 'content' => 'x']);
wp_cache_flush();
t_check('core autosave with status=publish does not publish', get_post_status($S['draft']) === 'draft', $r['body']);
$r = t_rest('POST', "/blixis-editor/v1/pages/{$S['publish_owned']}/autosave", $owner, [], ['document' => '{"schema":1,"marker":"OWNER-DRAFT-EDIT"}']);
wp_cache_flush();
t_check('owner without publish_pages can autosave a live page', $r['status'] === 200, $r['body']);
t_check('that autosave is not live', !str_contains((string) get_post_meta($S['publish_owned'], '_blixis_document', true), 'OWNER-DRAFT-EDIT'));
t_check('nor promotable by that owner', t_rest('POST', "/blixis-editor/v1/pages/{$S['publish_owned']}/publish", $owner)['status'] === 403);

// Autosaves belong to their author, so one user's publish cannot promote another's unreviewed edit.
$other = t_auth_headers('editor', 'cookie+nonce');
$r = t_rest('POST', "/blixis-editor/v1/pages/{$S['publish_owned']}/publish", $other);
wp_cache_flush();
t_check("editor's publish does not promote another user's autosave", $r['status'] === 200 && !str_contains((string) get_post_meta($S['publish_owned'], '_blixis_document', true), 'OWNER-DRAFT-EDIT'), $r['body']);

// Publishing by a holder of both capabilities, with the autosaved document.
$r = t_rest('POST', "/blixis-editor/v1/pages/{$S['pending']}/autosave", $other, [], ['document' => '{"schema":1,"marker":"PROMOTED"}']);
$r2 = t_rest('POST', "/blixis-editor/v1/pages/{$S['pending']}/publish", $other);
wp_cache_flush();
t_check('editor publishes with edit_post and publish_pages', $r2['status'] === 200 && get_post_status($S['pending']) === 'publish', $r2['body']);
t_check('publish promotes the autosaved document', str_contains((string) get_post_meta($S['pending'], '_blixis_document', true), 'PROMOTED'));
wp_set_current_user($U['administrator']);
wp_update_post(['ID' => $S['pending'], 'post_status' => 'pending']);
wp_set_current_user(0);

// The recommended auth_callback must not cost the revision support that task 01-02 proved for the old shape.
wp_set_current_user($U['administrator']);
$rev_page = wp_insert_post(['post_type' => 'page', 'post_status' => 'draft', 'post_title' => 'r0']);
update_post_meta($rev_page, '_blixis_document', wp_slash($tricky));
wp_update_post(['ID' => $rev_page, 'post_title' => 'r1']);
$rev_one = (int) array_key_first(wp_get_post_revisions($rev_page, ['orderby' => 'ID', 'order' => 'DESC', 'posts_per_page' => 1]));
t_check('auth_callback false: a revision stores the document byte-exact', get_metadata('post', $rev_one, '_blixis_document', true) === $tricky);
update_post_meta($rev_page, '_blixis_document', wp_slash('{"schema":1,"v":2}'));
wp_update_post(['ID' => $rev_page, 'post_title' => 'r2']);
wp_restore_post_revision($rev_one);
t_check('auth_callback false: restoring brings the document back byte-exact', get_post_meta($rev_page, '_blixis_document', true) === $tricky);
wp_delete_post($rev_page, true);
wp_set_current_user(0);

// What a live-page author can do through core is a role question, not a route question.
$r = t_rest('POST', "/wp/v2/pages/{$S['publish_owned']}", $owner, [], ['content' => 'CORE-EDIT-MARKER']);
wp_cache_flush();
t_observe('edit_published_pages_lets_core_change_live_post_content_without_publish_pages', str_contains(get_post($S['publish_owned'])->post_content, 'CORE-EDIT-MARKER'));

// Argument validation in WordPress runs before permission_callback.
$r = t_rest('PUT', "$route/document", [], [], ['document' => '{not json']);
t_observe('anonymous_invalid_args_status_before_permission_check', [$r['status'], $r['json']['code'] ?? null]);
$r = t_rest('PUT', "$route/document", [], [], []);
t_observe('anonymous_missing_args_status_before_permission_check', [$r['status'], $r['json']['code'] ?? null]);

/* ------------------------------------------------------------------ protected data */

t_section('protected-data');
foreach (['_blixis_document', '_blixis_doc_shape_0102'] as $key) {
    t_check("$key is protected meta", is_protected_meta($key, 'post'));
}
$sweep_ids = ['publish' => $S['publish'], 'draft' => $S['draft']];
$anon_h = [];
$admin_h = t_auth_headers('administrator', 'cookie+nonce');
$editor_h = t_auth_headers('editor', 'cookie+nonce');
$sub_h = t_auth_headers('subscriber', 'cookie+nonce');
$app_h = t_auth_headers('administrator', 'app_password');
$grep = static fn (string $s): bool => str_contains($s, T_DOC_MARKER) || str_contains($s, 'SECRET-META-MARKER') || str_contains($s, 'AUTOSAVE-DOC-MARKER');
$rev = (int) array_key_first(wp_get_post_revisions($S['publish_owned']));
$named = [
    "/wp/v2/pages/{$S['publish']}" => [[], ['context' => 'edit'], ['_fields' => 'meta,_blixis_document'], ['context' => 'edit', '_fields' => 'meta']],
    "/wp/v2/pages/{$S['draft']}" => [['context' => 'edit'], ['_fields' => 'meta']],
    '/wp/v2/pages' => [['context' => 'edit', 'status' => 'any'], ['search' => T_DOC_MARKER, 'context' => 'edit'], ['_fields' => 'meta', 'status' => 'draft'], ['meta_key' => '_blixis_document'], ['metaKey' => '_blixis_document']],
    "/wp/v2/pages/{$S['publish']}/revisions" => [[], ['context' => 'edit']],
    "/wp/v2/pages/{$S['publish_owned']}/revisions/$rev" => [['context' => 'edit']],
    "/wp/v2/pages/{$S['publish']}/autosaves" => [[], ['context' => 'edit']],
    '/wp/v2/search' => [['search' => T_DOC_MARKER], ['search' => T_DOC_MARKER, 'subtype' => 'page'], ['search' => '_blixis_document'], ['search' => 'Public', '_fields' => 'meta']],
];
foreach ($named as $route => $queries) {
    foreach ($queries as $query) {
        foreach (['anon' => $anon_h, 'subscriber' => $sub_h, 'editor' => $editor_h, 'admin' => $admin_h, 'admin app password' => $app_h] as $who => $h) {
            $r = t_rest('GET', $route, $h, $query);
            t_check("$who $route " . json_encode($query) . ' exposes no document', !$grep($r['body']), substr($r['body'], 0, 200));
        }
    }
}
$search = t_rest('GET', '/wp/v2/search', $admin_h, ['search' => T_DOC_MARKER]);
t_check('search finds nothing by document content', $search['status'] === 200 && $search['json'] === [], $search['body']);

// Every GET route the install registers, including ones new in this WordPress version.
$routes = array_keys(rest_get_server()->get_routes());
$swept = 0;
foreach ($routes as $pattern) {
    if (str_starts_with($pattern, '/blixis-editor/') || str_starts_with($pattern, '/blixis-fixture/')) {
        continue;
    }
    foreach ($sweep_ids as $id) {
        $concrete = preg_replace_callback('/\(\?P<(\w+)>[^()]*(?:\([^()]*\)[^()]*)*\)\??/', static fn (array $m): string => in_array($m[1], ['id', 'parent'], true) ? (string) $id : 'x', $pattern);
        if (str_contains($concrete, '(') || str_contains($concrete, '[')) {
            continue;
        }
        $query = ['context' => 'edit', 'per_page' => '100', 'status' => 'any'];
        foreach ([$anon_h, $admin_h] as $h) {
            $r = t_rest('GET', $concrete, $h, $query);
            $r2 = t_rest('GET', $concrete, $h);
            $swept += 2;
            t_check("sweep $concrete exposes no document", !$grep($r['body']) && !$grep($r2['body']), substr($r['body'], 0, 200));
        }
        if ($concrete === $pattern) {
            break;
        }
    }
}
t_observe('sweep_routes_registered', count($routes));
t_observe('sweep_requests', $swept);

// Writes through generic paths.
$before = get_post_meta($S['publish'], '_blixis_document', true);
$r = t_rest('POST', "/wp/v2/pages/{$S['publish']}", $editor_h, [], ['meta' => ['_blixis_document' => '{"evil":1}', '_blixis_doc_shape_0102' => '{"evil":1}']]);
wp_cache_flush();
t_check('generic meta write is ignored', get_post_meta($S['publish'], '_blixis_document', true) === $before, $r['status'] . substr($r['body'], 0, 150));

// XML-RPC: the path that bypasses the REST registration entirely.
$pw = static fn (string $actor): array => [get_userdata($GLOBALS['T']['users'][$actor])->user_login, $GLOBALS['T']['pw'][$actor]];
foreach (['subscriber', 'page_author_other', 'page_author_owner', 'editor', 'administrator'] as $actor) {
    [$login, $pass] = $pw($actor);
    foreach ([$S['publish_owned'], $S['draft']] as $id) {
        foreach ([
            ['wp.getPost', ['<int>1</int>', t_xs($login), t_xs($pass), "<int>$id</int>"]],
            ['metaWeblog.getPost', ["<int>$id</int>", t_xs($login), t_xs($pass)]],
            ['wp.getPage', ['<int>1</int>', "<int>$id</int>", t_xs($login), t_xs($pass)]],
        ] as [$method, $params]) {
            $r = t_xmlrpc($method, $params);
            t_check("xmlrpc $method $actor on $id does not expose _blixis_document", !str_contains($r['body'], '"_blixis_document"') && !str_contains($r['body'], '<string>_blixis_document</string>') && !str_contains($r['body'], T_DOC_MARKER . '-draft') && !str_contains($r['body'], T_DOC_MARKER . '-publish_owned'), substr($r['body'], 0, 200));
        }
    }
}
[$login, $pass] = $pw('page_author_owner');
$r = t_xmlrpc('wp.getPost', ['<int>1</int>', t_xs($login), t_xs($pass), "<int>{$S['draft']}</int>"]);
t_observe('xmlrpc_reachable_status', $r['status']);
t_observe('xmlrpc_01_02_auth_callback_shape_readable_by_page_author', str_contains($r['body'], '_blixis_doc_shape_0102'));

$field = static fn (array $parts): string => '<struct><member><name>custom_fields</name><value><array><data><value><struct>' . implode('', $parts) . '</struct></value></data></array></value></member></struct>';
$member = static fn (string $name, string $value): string => "<member><name>$name</name><value><string>" . htmlspecialchars($value, ENT_XML1) . '</string></value></member>';
$mid = static function (int $id, string $key): int {
    global $wpdb;
    return (int) $wpdb->get_var($wpdb->prepare("SELECT meta_id FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key = %s", $id, $key));
};
$xml_edit = static fn (string $login, string $pass, int $id, string $struct): array => t_xmlrpc('wp.editPost', ['<int>1</int>', t_xs($login), t_xs($pass), "<int>$id</int>", $struct]);
$current = get_post_meta($S['draft'], '_blixis_document', true);
$r = $xml_edit($login, $pass, $S['draft'], $field([$member('id', (string) $mid($S['draft'], '_blixis_document')), $member('key', '_blixis_document'), $member('value', '{"evil":"xmlrpc"}')]));
wp_cache_flush();
t_check('xmlrpc update cannot change _blixis_document', get_post_meta($S['draft'], '_blixis_document', true) === $current, substr($r['body'], 0, 200));
$r = $xml_edit($login, $pass, $S['draft'], $field([$member('key', '_blixis_document'), $member('value', '{"evil":"xmlrpc-add"}')]));
wp_cache_flush();
t_check('xmlrpc add cannot add a second _blixis_document', count(get_post_meta($S['draft'], '_blixis_document')) === 1 && get_post_meta($S['draft'], '_blixis_document', true) === $current);
$r = $xml_edit($login, $pass, $S['draft'], $field([$member('id', (string) $mid($S['draft'], '_blixis_document'))]));
wp_cache_flush();
t_check('xmlrpc delete cannot remove _blixis_document', get_post_meta($S['draft'], '_blixis_document', true) === $current);
$r = $xml_edit($login, $pass, $S['draft'], $field([$member('id', (string) $mid($S['draft'], '_blixis_doc_shape_0102')), $member('key', '_blixis_doc_shape_0102'), $member('value', 'not json and not validated')]));
wp_cache_flush();
t_observe('xmlrpc_01_02_auth_callback_shape_writable_without_validation', get_post_meta($S['draft'], '_blixis_doc_shape_0102', true) === 'not json and not validated');
$r = t_xmlrpc('wp.editPost', ['<int>1</int>', t_xs($login), t_xs($pass), "<int>{$S['draft']}</int>", '<struct>' . $member('post_status', 'publish') . '</struct>']);
wp_cache_flush();
t_check('xmlrpc cannot publish without publish_pages', get_post_status($S['draft']) === 'draft', substr($r['body'], 0, 200));

// wp-admin custom-field AJAX path. An unprotected key is the contrast, so a refusal here means the meta rule and not a failed login.
$expires = time() + 3600;
$ajax_token = WP_Session_Tokens::get_instance($U['administrator'])->create($expires);
$ajax_logged_in = wp_generate_auth_cookie($U['administrator'], $expires, 'logged_in', $ajax_token);
$ajax_cookie = AUTH_COOKIE . '=' . rawurlencode(wp_generate_auth_cookie($U['administrator'], $expires, 'auth', $ajax_token)) . '; ' . LOGGED_IN_COOKIE . '=' . rawurlencode($ajax_logged_in);
$_COOKIE[LOGGED_IN_COOKIE] = $ajax_logged_in;
wp_set_current_user($U['administrator']);
$ajax_nonce = wp_create_nonce('add-meta');
unset($_COOKIE[LOGGED_IN_COOKIE]);
wp_set_current_user(0);
$ajax_add = static fn (string $key, string $value): array => t_raw('POST', '/wp-admin/admin-ajax.php', ['Cookie' => $ajax_cookie, 'Content-Type' => 'application/x-www-form-urlencoded'], http_build_query(['action' => 'add-meta', '_ajax_nonce' => $ajax_nonce, 'post_id' => $S['publish'], 'metakeyinput' => $key, 'metavalue' => $value]));
$ajax_contrast = $ajax_add('blixis_plain_contrast', 'contrast-value');
wp_cache_flush();
t_check('contrast: admin-ajax add-meta works for an unprotected key', get_post_meta($S['publish'], 'blixis_plain_contrast', true) === 'contrast-value', $ajax_contrast['status'] . ' ' . substr($ajax_contrast['body'], 0, 120));
$r = $ajax_add('_blixis_document', '{"evil":1}');
wp_cache_flush();
t_check('admin-ajax add-meta cannot add _blixis_document', count(get_post_meta($S['publish'], '_blixis_document')) === 1 && !str_contains((string) json_encode(get_post_meta($S['publish'], '_blixis_document')), 'evil'), $r['status'] . ' ' . substr($r['body'], 0, 120));

// Positive control: meta that is exposed really does appear over HTTP, so the absence above means something.
update_post_meta($S['publish_owned'], 'blixis_control_meta', 'CONTROL-META-MARKER');
$r = t_rest('GET', "/wp/v2/pages/{$S['publish_owned']}");
t_check('control: show_in_rest meta is visible to anonymous over HTTP', str_contains($r['body'], 'CONTROL-META-MARKER'), substr($r['body'], 0, 150));
delete_post_meta($S['publish_owned'], 'blixis_control_meta');

/* ------------------------------------------------------------------ errors and metadata routes */

t_section('errors');
t_config_named('keyed');
t_check('health equals the contract example', t_rest('GET', '/blixis/v1/health')['json'] === t_json('examples/health.json'));
t_check('schema equals the contract example', t_rest('GET', '/blixis/v1/schema')['json'] === t_json('examples/schema.json'));
t_check('every error example is served by the schema list', array_diff(array_keys($errors), t_rest('GET', '/blixis/v1/schema')['json']['error_codes']) === []);
foreach (['/blixis/v1/health', '/blixis/v1/schema'] as $route) {
    $r = t_rest('GET', $route, ['Origin' => 'https://evil.example.test']);
    // DB_NAME is left out: in this harness it is "contract", a substring of the contract_version field.
    $secrets = [ABSPATH, DB_HOST, DB_USER, DB_PASSWORD, AUTH_KEY, $wpdb->prefix . 'options', get_bloginfo('version'), PHP_VERSION, 'mariadb', 'php', 'wordpress', 'plugin', 'admin@'];
    foreach ($secrets as $secret) {
        t_check("$route body omits a sensitive value", !str_contains(strtolower($r['body']), strtolower((string) $secret)), (string) $secret);
    }
    t_check("$route needs no key", $r['status'] === 200);
    t_check("$route ignores credentials", t_fingerprint(t_rest('GET', $route)) === t_fingerprint(t_rest('GET', $route, t_auth_headers('administrator', 'cookie+nonce'))));
    t_check("$route refuses query parameters", t_rest('GET', $route, [], ['verbose' => '1'])['status'] === 400);
    t_check("$route headers name no PHP version", !isset($r['headers']['x-powered-by']) && !str_contains((string) json_encode($r['headers']), PHP_VERSION), json_encode($r['headers']));
}
$leaks = ['stack trace', '#0 ', '.php', 'SELECT', 'blixis_no_such_table', 'wp_', 'Fatal', 'Warning', '<b>', '/tmp/'];
foreach (['exception', 'type_error', 'sql', 'warning'] as $fault) {
    update_option('blixis_fixture_fault', $fault);
    $r = t_rest('GET', $item, $bearer);
    if ($fault === 'exception' || $fault === 'type_error') {
        t_check("fault $fault: body equals the INTERNAL_ERROR example", $r['status'] === 500 && $r['json'] === $errors['INTERNAL_ERROR'], $r['status'] . ' ' . substr($r['body'], 0, 300));
    } else {
        t_check("fault $fault: response is still clean JSON", $r['status'] === 200 && is_array($r['json']), $r['status'] . ' ' . substr($r['body'], 0, 300));
    }
    foreach ($leaks as $leak) {
        if ($r['status'] !== 200) {
            t_check("fault $fault: body omits '$leak'", !str_contains($r['body'], $leak), substr($r['body'], 0, 300));
        }
    }
    if ($r['status'] === 200) {
        t_check("fault $fault: no error text in the JSON", !preg_match('/Warning|Undefined|WordPress database error|blixis_no_such_table/', $r['body']), substr($r['body'], 0, 300));
    }
}
delete_option('blixis_fixture_fault');
$logs = (string) @file_get_contents('/tmp/debug.log');
t_check('exception class reaches the log, not the client', str_contains($logs, 'outcome=exception class=RuntimeException'));

// Control parameters cannot reshape a response.
foreach (['_envelope' => '1', '_jsonp' => 'evil', '_fields' => 'id', '_embed' => '1'] as $param => $value) {
    $r = t_rest('GET', $item, $bearer, [$param => $value]);
    t_check("$param is refused with a plain contract body", $r['status'] === 400 && $r['json'] === $errors['INVALID_QUERY'], $r['status'] . substr($r['body'], 0, 120));
}
$r = t_raw('GET', "/wp-json/blixis/v1/content/{$S['publish']}?_jsonp=" . rawurlencode('bad callback!'), $bearer);
t_check('invalid JSONP callback gets the contract body, not a core error', $r['status'] === 400 && $r['json'] === $errors['INVALID_QUERY'], $r['status'] . substr($r['body'], 0, 120));

/* ------------------------------------------------------------------ result */

foreach ($GLOBALS['T']['sections'] as $name => [$p, $f]) {
    echo "SECTION $name pass=$p fail=$f\n";
}
echo 'CONTRACT_RESULT pass=' . $GLOBALS['T']['pass'] . ' fail=' . $GLOBALS['T']['fail'] . "\n";
