<?php
// Run with `wp eval-file`. Writes one JSON result line to stdout.

$base = 'http://127.0.0.1:8080';
$checks = [];
$observed = [];
$check = static function (string $name, bool $ok, string $detail = '') use (&$checks): void {
    $checks[] = ['name' => $name, 'ok' => $ok, 'detail' => $detail];
};

$user = static function (string $login, string $role): int {
    return (int) wp_insert_user([
        'user_login' => $login,
        'user_pass' => wp_generate_password(24),
        'user_email' => "$login@example.test",
        'role' => $role,
    ]);
};
// Default authors cannot edit pages at all, so ownership needs a role with page capabilities.
add_role('spike_page_author', 'Spike page author', ['read' => true, 'edit_pages' => true, 'edit_published_pages' => true]);
$editor = $user('spike_editor', 'editor');
$author = $user('spike_author', 'spike_page_author');
$other = $user('spike_other', 'spike_page_author');
$default_author = $user('spike_default_author', 'author');
$subscriber = $user('spike_subscriber', 'subscriber');

$rest = static function (string $method, string $route, array $body = [], int $as = 0): WP_REST_Response {
    wp_set_current_user($as);
    $request = new WP_REST_Request($method, $route);
    if ($method === 'GET') {
        $request->set_query_params($body);
    } elseif ($body) {
        $request->set_body_params($body);
    }
    return rest_ensure_response(rest_do_request($request));
};

$page = static function (string $status, int $owner, string $title, string $content = '') {
    wp_set_current_user($owner);
    return (int) wp_insert_post(['post_type' => 'page', 'post_status' => $status, 'post_author' => $owner, 'post_title' => $title, 'post_content' => $content]);
};

$key = '_blixis_document';
$tricky = (string) json_encode([
    'schema' => 1,
    'marker' => 'BLIXIS-SECRET-MARKER',
    'text' => 'quote " backslash \\ path C:\\new\\table <script>alert(1)</script> é 日本語 🌱',
], JSON_UNESCAPED_UNICODE);

// Round trip through the dedicated route.
$draft = $page('draft', $author, 'Draft title DRAFT-TITLE-MARKER', 'DRAFT-BODY-MARKER');
$route = "/blixis-spike/v1/pages/$draft/document";
$r = $rest('PUT', $route, ['document' => $tricky], $author);
$check('meta: author saves own draft', $r->get_status() === 200, (string) $r->get_status());
$check('meta: JSON with quotes, backslashes, HTML, and Unicode round-trips byte-exact', get_post_meta($draft, $key, true) === $tricky);
update_post_meta($draft, $key, $tricky);
$observed['unslashed_update_post_meta_corrupts_json'] = get_post_meta($draft, $key, true) !== $tricky;
update_post_meta($draft, $key, wp_slash($tricky));

// Permission cases.
foreach ([['anonymous', 0, 401], ['subscriber', $subscriber, 403], ['default author role', $default_author, 403], ['other page author', $other, 403]] as [$who, $id, $want]) {
    $get = $rest('GET', $route, [], $id)->get_status();
    $put = $rest('PUT', $route, ['document' => '{}'], $id)->get_status();
    $check("permission: $who denied read ($want)", $get === $want, (string) $get);
    $check("permission: $who denied write ($want)", $put === $want, (string) $put);
}
$check('permission: denied writes changed nothing', get_post_meta($draft, $key, true) === $tricky);
$check('permission: editor reads another author\'s draft', $rest('GET', $route, [], $editor)->get_status() === 200);

// Invalid input.
$invalid = $rest('PUT', $route, ['document' => '{not json'], $author)->get_status();
$check('validation: invalid JSON rejected (400)', $invalid === 400, (string) $invalid);
$check('validation: rejected input changed nothing', get_post_meta($draft, $key, true) === $tricky);

// Size.
$large = (string) json_encode(['pad' => str_repeat('a', 1024 * 1024)]);
$rest('PUT', $route, ['document' => $large], $author);
$check('meta: 1 MiB document round-trips', get_post_meta($draft, $key, true) === $large);
update_post_meta($draft, $key, wp_slash($tricky));

// Generic route exposure.
$public = $page('publish', $editor, 'Public page', 'PUBLIC-BODY');
update_post_meta($public, $key, wp_slash($tricky));
update_post_meta($public, '_blixis_rest_variant', 'VARIANT-MARKER');
$anon = (string) wp_json_encode($rest('GET', "/wp/v2/pages/$public")->get_data());
$check('exposure: anonymous generic route omits protected document', !str_contains($anon, 'BLIXIS-SECRET-MARKER'));
$edit = (string) wp_json_encode($rest('GET', "/wp/v2/pages/$public", ['context' => 'edit'], $editor)->get_data());
$check('exposure: editor generic route omits protected document', !str_contains($edit, 'BLIXIS-SECRET-MARKER'));
$observed['show_in_rest_true_exposes_meta_to_anonymous'] = str_contains($anon, 'VARIANT-MARKER');
$status = $rest('GET', "/wp/v2/pages/$draft")->get_status();
$check('exposure: anonymous generic route denies draft (401)', $status === 401, (string) $status);

// Revisions.
$rev = $page('draft', $editor, 'r0');
$latest = static fn (int $id): int => (int) array_key_first(wp_get_post_revisions($id, ['orderby' => 'ID', 'order' => 'DESC', 'posts_per_page' => 1]));
update_post_meta($rev, $key, wp_slash($tricky));
wp_update_post(['ID' => $rev, 'post_title' => 'r1']);
$r1 = $latest($rev);
$check('revisions: revision stores byte-exact document', get_metadata('post', $r1, $key, true) === $tricky);
$v2 = '{"schema":1,"v":2}';
update_post_meta($rev, $key, wp_slash($v2));
wp_update_post(['ID' => $rev, 'post_title' => 'r2']);
$check('revisions: new revision stores new document', get_metadata('post', $latest($rev), $key, true) === $v2);
wp_restore_post_revision($r1);
$check('revisions: restore brings back byte-exact document', get_post_meta($rev, $key, true) === $tricky, substr((string) get_post_meta($rev, $key, true), 0, 120));

$before = count(wp_get_post_revisions($rev));
update_post_meta($rev, $key, wp_slash('{"schema":1,"v":3}'));
wp_update_post(['ID' => $rev]);
$observed['meta_only_change_creates_revision'] = count(wp_get_post_revisions($rev)) > $before;

$list = (string) wp_json_encode($rest('GET', "/wp/v2/pages/$rev/revisions", [], $editor)->get_data());
$check('revisions: generic revisions route omits document', !str_contains($list, 'BLIXIS-SECRET-MARKER'));
$check('revisions: subscriber denied revisions route', $rest('GET', "/wp/v2/pages/$rev/revisions", [], $subscriber)->get_status() === 403);

// Autosave never publishes.
$a = $rest('POST', "/wp/v2/pages/$public/autosaves", ['title' => 'Autosaved', 'content' => 'AUTOSAVE-BODY'], $editor);
wp_cache_flush();
$check('autosave: request accepted on published page', in_array($a->get_status(), [200, 201], true), (string) $a->get_status());
$check('autosave: published title unchanged', get_post($public)->post_title === 'Public page');
$check('autosave: published document unchanged', get_post_meta($public, $key, true) === $tricky);
$a = $rest('POST', "/wp/v2/pages/$draft/autosaves", ['title' => 'Draft autosave'], $author);
wp_cache_flush();
$check('autosave: draft autosave accepted', in_array($a->get_status(), [200, 201], true), (string) $a->get_status());
$check('autosave: draft stays draft', get_post_status($draft) === 'draft', (string) $a->get_status());

// Real HTTP: cookie authentication, nonce, and preview.
$session = static function (int $id): array {
    $expires = time() + 3600;
    $token = WP_Session_Tokens::get_instance($id)->create($expires);
    $cookie = wp_generate_auth_cookie($id, $expires, 'logged_in', $token);
    $_COOKIE[LOGGED_IN_COOKIE] = $cookie;
    wp_set_current_user($id);
    $nonce = wp_create_nonce('wp_rest');
    return ['cookie' => LOGGED_IN_COOKIE . '=' . rawurlencode($cookie), 'nonce' => $nonce];
};
$s = $session($editor);
$http = static function (string $method, string $url, array $headers = [], ?string $body = null) use ($base): array {
    $res = wp_remote_request($base . $url, ['method' => $method, 'headers' => $headers, 'body' => $body, 'timeout' => 20, 'redirection' => 0]);
    return is_wp_error($res)
        ? ['status' => 0, 'body' => $res->get_error_message()]
        : ['status' => (int) wp_remote_retrieve_response_code($res), 'body' => (string) wp_remote_retrieve_body($res)];
};
$url = "/?rest_route=/blixis-spike/v1/pages/$draft/document";
$json = ['Content-Type' => 'application/json'];
$payload = (string) wp_json_encode(['document' => '{"schema":1,"http":true}']);

$res = $http('PUT', $url, $json, $payload);
$check('http: anonymous write denied (401)', $res['status'] === 401, (string) $res['status']);
$res = $http('PUT', $url, $json + ['Cookie' => $s['cookie']], $payload);
$check('http: cookie without nonce denied (401)', $res['status'] === 401, (string) $res['status']);
$res = $http('PUT', $url, $json + ['Cookie' => $s['cookie'], 'X-WP-Nonce' => 'invalid'], $payload);
$check('http: cookie with bad nonce denied (403)', $res['status'] === 403, (string) $res['status']);
wp_cache_flush();
$check('http: denied writes changed nothing', get_post_meta($draft, $key, true) === $tricky);
$res = $http('PUT', $url, $json + ['Cookie' => $s['cookie'], 'X-WP-Nonce' => $s['nonce']], $payload);
$check('http: cookie with valid nonce writes (200)', $res['status'] === 200, $res['status'] . ' ' . substr($res['body'], 0, 120));

$preview = "/?page_id=$draft&preview=true";
$res = $http('GET', $preview);
$check('preview: anonymous request does not see draft', !str_contains($res['body'], 'DRAFT-BODY-MARKER'), (string) $res['status']);
$sub = $session($subscriber);
$res = $http('GET', $preview, ['Cookie' => $sub['cookie']]);
$check('preview: subscriber does not see draft', !str_contains($res['body'], 'DRAFT-BODY-MARKER'), (string) $res['status']);
$s = $session($editor);
$res = $http('GET', $preview, ['Cookie' => $s['cookie']]);
$check('preview: editor sees draft', $res['status'] === 200 && str_contains($res['body'], 'DRAFT-BODY-MARKER'), (string) $res['status']);
wp_cache_flush();
$check('preview: viewing did not publish', get_post_status($draft) === 'draft');

$scripts = wp_scripts();
$observed['bundled_react'] = $scripts->registered['react']->ver ?? null;
$observed['bundled_react_dom'] = $scripts->registered['react-dom']->ver ?? null;
$observed['has_react_jsx_runtime'] = isset($scripts->registered['react-jsx-runtime']);

echo 'SMOKE_RESULT ' . wp_json_encode(['checks' => $checks, 'observed' => $observed]) . "\n";
