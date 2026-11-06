<?php
/**
 * Plugin Name: Blixis 01-05 Content API proof
 * Description: Throwaway proof of the proposed Content API contract and key handling. Not product code.
 * Version: 0.0.0
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

const BLIXIS_API_VERSION = '1.0';
const BLIXIS_API_VARY = 'Authorization, Origin';
const BLIXIS_API_SCOPE = 'read:published';
const BLIXIS_API_PER_PAGE_MAX = 50;
const BLIXIS_API_TYPES = ['page'];
const BLIXIS_API_FIELDS = ['id', 'type', 'slug', 'title', 'link', 'date_gmt', 'modified_gmt', 'html'];
const BLIXIS_API_ERRORS = [
    'INVALID_QUERY' => [400, 'The request has an unsupported or invalid query parameter.'],
    'UNAUTHORIZED' => [401, 'A valid API key is required.'],
    'FORBIDDEN' => [403, 'This API key does not have the required scope.'],
    'HTTPS_REQUIRED' => [403, 'This API requires HTTPS.'],
    'NOT_FOUND' => [404, 'Not found.'],
    'METHOD_NOT_ALLOWED' => [405, 'This API is read-only.'],
    'RATE_LIMITED' => [429, 'Too many requests.'],
    'INTERNAL_ERROR' => [500, 'The request could not be completed.'],
];

/* ---------- Configuration: keyed, HTTPS-only, no CORS origins, unless explicitly changed. ---------- */

function blixis_api_config(): array
{
    $stored = get_option('blixis_api_config', []);
    return (is_array($stored) ? $stored : []) + [
        'mode' => 'keyed',
        'require_https' => true,
        'trusted_proxies' => [],
        'cors_allowlist' => [],
        'rate_limit' => 0,
    ];
}

function blixis_api_peer_is_trusted(): bool
{
    return in_array($_SERVER['REMOTE_ADDR'] ?? '', blixis_api_config()['trusted_proxies'], true);
}

/** Forwarded headers count only from a configured proxy; is_ssl() itself never reads them. */
function blixis_api_transport_is_secure(): bool
{
    if (is_ssl()) {
        return true;
    }
    return blixis_api_peer_is_trusted() && strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

function blixis_api_client_address(): string
{
    if (blixis_api_peer_is_trusted() && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $hops = array_map('trim', explode(',', (string) $_SERVER['HTTP_X_FORWARDED_FOR']));
        return (string) end($hops);
    }
    return (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
}

/* ---------- Keys: an identifier plus a keyed hash. The secret exists only in the create response. ---------- */

function blixis_api_key_hash(string $secret): string
{
    return hash_hmac('sha256', $secret, hash_hmac('sha256', 'blixis-api-key-v1', wp_salt('secure_auth')));
}

/** @return array{key: string, id: string} */
function blixis_api_key_create(array $scopes, ?int $expires_at = null): array
{
    $id = bin2hex(random_bytes(8));
    $secret = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    add_option("blixis_api_key_$id", [
        'id' => $id,
        'hash_version' => 1,
        'hash' => blixis_api_key_hash($secret),
        'scopes' => $scopes,
        'created_at' => time(),
        'expires_at' => $expires_at,
        'revoked_at' => null,
        'replaced_by' => null,
    ], '', false);
    return ['key' => "bxk_{$id}_$secret", 'id' => $id];
}

function blixis_api_key_revoke(string $id, ?string $replaced_by = null): bool
{
    $record = get_option("blixis_api_key_$id");
    if (!is_array($record)) {
        return false;
    }
    $record['revoked_at'] = time();
    $record['replaced_by'] = $replaced_by;
    return update_option("blixis_api_key_$id", $record, false);
}

/** Rotation is immediate. A client that needs overlap creates a second key and revokes the first later. */
function blixis_api_key_rotate(string $id): ?array
{
    $record = get_option("blixis_api_key_$id");
    if (!is_array($record)) {
        return null;
    }
    $new = blixis_api_key_create($record['scopes'], $record['expires_at']);
    blixis_api_key_revoke($id, $new['id']);
    return $new;
}

function blixis_api_key_metadata(array $record): array
{
    unset($record['hash']);
    return $record;
}

/** @return array{ok: bool, id: ?string, reason: string, scopes: array} */
function blixis_api_key_verify(string $presented): array
{
    $fail = static fn (string $reason, ?string $id = null): array => ['ok' => false, 'id' => $id, 'reason' => $reason, 'scopes' => []];
    if (preg_match('/\Abxk_([a-f0-9]{16})_([A-Za-z0-9_-]{43})\z/', $presented, $m) !== 1) {
        return $fail('malformed');
    }
    $record = get_option("blixis_api_key_{$m[1]}");
    // Always compute and compare, so an unknown identifier takes the same path as a wrong secret.
    $expected = is_array($record) ? (string) $record['hash'] : str_repeat('0', 64);
    if (!hash_equals($expected, blixis_api_key_hash($m[2])) || !is_array($record)) {
        return $fail(is_array($record) ? 'wrong_secret' : 'unknown_id', is_array($record) ? $m[1] : null);
    }
    if ($record['revoked_at'] !== null) {
        return $fail('revoked', $m[1]);
    }
    if ($record['expires_at'] !== null && $record['expires_at'] <= time()) {
        return $fail('expired', $m[1]);
    }
    return ['ok' => true, 'id' => $m[1], 'reason' => 'ok', 'scopes' => (array) $record['scopes']];
}

function blixis_api_audit(string $outcome, ?string $key_id): void
{
    // Only a stored identifier is logged, never presented input, a secret, or a hash.
    error_log(sprintf('blixis_api outcome=%s key_id=%s', $outcome, $key_id ?? 'none'));
}

/* ---------- Rate limit: one atomic counter statement, because transients are read-modify-write. ---------- */

function blixis_api_rate_limit_hit(string $subject, int $limit, int $window = 60): bool
{
    global $wpdb;
    $slot = (int) floor(time() / $window);
    $wpdb->query($wpdb->prepare(
        "INSERT INTO {$wpdb->prefix}blixis_api_rate (subject, slot, hits) VALUES (%s, %d, 1) ON DUPLICATE KEY UPDATE hits = LAST_INSERT_ID(hits + 1)",
        hash('sha256', $subject),
        $slot
    ));
    $hits = (int) $wpdb->insert_id ?: 1;
    return $hits > $limit;
}

function blixis_api_install_rate_table(): void
{
    global $wpdb;
    $wpdb->query("CREATE TABLE IF NOT EXISTS {$wpdb->prefix}blixis_api_rate (subject CHAR(64) NOT NULL, slot BIGINT NOT NULL, hits INT NOT NULL, PRIMARY KEY (subject, slot))");
}

/* ---------- The request gate. ---------- */

function blixis_api_error(string $code): WP_Error
{
    return new WP_Error($code, BLIXIS_API_ERRORS[$code][1], ['status' => BLIXIS_API_ERRORS[$code][0]]);
}

function blixis_api_gate(WP_REST_Request $request, bool $needs_client, array $allowed_query): bool|WP_Error
{
    // No capability check here: a WordPress login never changes what this namespace returns.
    // The user is not changed here either, because internal rest_do_request() callers must keep theirs.
    $GLOBALS['blixis_api_client'] = ['type' => 'anonymous', 'id' => null];

    if ($needs_client) {
        $config = blixis_api_config();
        $header = trim((string) $request->get_header('authorization'));
        $bearer = preg_match('/^Bearer(\s+(.*))?$/i', $header, $m) === 1;

        if (($config['mode'] !== 'anonymous' || $bearer) && $config['require_https'] && !blixis_api_transport_is_secure()) {
            return blixis_api_error('HTTPS_REQUIRED');
        }
        if ($bearer) {
            $result = blixis_api_key_verify((string) ($m[2] ?? ''));
            blixis_api_audit($result['reason'], $result['id']);
            if (!$result['ok']) {
                return blixis_api_error('UNAUTHORIZED');
            }
            if (!in_array(BLIXIS_API_SCOPE, $result['scopes'], true)) {
                return blixis_api_error('FORBIDDEN');
            }
            $GLOBALS['blixis_api_client'] = ['type' => 'key', 'id' => $result['id']];
        } elseif ($config['mode'] !== 'anonymous') {
            return blixis_api_error('UNAUTHORIZED');
        }
        if ($config['rate_limit'] > 0) {
            $client = $GLOBALS['blixis_api_client'];
            $subject = $client['type'] === 'key' ? 'key:' . $client['id'] : 'addr:' . blixis_api_client_address();
            if (blixis_api_rate_limit_hit($subject, (int) $config['rate_limit'])) {
                return blixis_api_error('RATE_LIMITED');
            }
        }
    }
    // The raw keys include control parameters already removed from $_GET; internal dispatches have only the request's.
    foreach (array_merge($GLOBALS['blixis_api_raw_query_keys'] ?? [], array_keys($request->get_query_params())) as $key) {
        if ($key !== 'rest_route' && !in_array($key, $allowed_query, true)) {
            return blixis_api_error('INVALID_QUERY');
        }
    }
    return true;
}

/* ---------- Reads. ---------- */

function blixis_api_visible_post(int $id): ?WP_Post
{
    $post = $id > 0 ? get_post($id) : null;
    if (!$post instanceof WP_Post
        || $post->post_status !== 'publish'
        || $post->post_password !== ''
        || !in_array($post->post_type, BLIXIS_API_TYPES, true)
        || !is_post_type_viewable($post->post_type)) {
        return null;
    }
    return $post;
}

function blixis_api_project(WP_Post $post): array
{
    $gmt = static fn (string $date): string => str_replace(' ', 'T', $date) . 'Z';
    // Rendering always runs logged out, so user-dependent output can never enter a shared cache.
    $viewer = get_current_user_id();
    wp_set_current_user(0);
    $GLOBALS['post'] = $post;
    setup_postdata($post);
    $html = apply_filters('the_content', $post->post_content);
    wp_reset_postdata();
    wp_set_current_user($viewer);
    return [
        'id' => $post->ID,
        'type' => $post->post_type,
        'slug' => $post->post_name,
        'title' => $post->post_title,
        'link' => get_permalink($post),
        'date_gmt' => $gmt($post->post_date_gmt),
        'modified_gmt' => $gmt($post->post_modified_gmt),
        'html' => $html,
    ];
}

function blixis_api_cached(WP_REST_Request $request, array $body, string $cache_control): WP_REST_Response
{
    $etag = '"' . hash('sha256', (string) wp_json_encode($body)) . '"';
    $headers = ['ETag' => $etag, 'Cache-Control' => $cache_control];
    $candidates = array_map(static fn (string $v): string => preg_replace('/^W\//', '', trim($v)), explode(',', (string) $request->get_header('if_none_match')));
    if (in_array($etag, $candidates, true) || in_array('*', $candidates, true)) {
        return new WP_REST_Response(null, 304, $headers);
    }
    return new WP_REST_Response($body, 200, $headers);
}

function blixis_api_content_cache_control(): string
{
    return ($GLOBALS['blixis_api_client']['type'] ?? '') === 'key'
        ? 'private, max-age=0, must-revalidate'
        : 'public, max-age=60, must-revalidate';
}

/** Nothing thrown or printed by a read can reach the client. */
function blixis_api_guarded(callable $read): callable
{
    return static function (WP_REST_Request $request) use ($read) {
        try {
            do_action('blixis_api_fault_probe');
            return $read($request);
        } catch (Throwable $e) {
            error_log('blixis_api outcome=exception class=' . get_class($e));
            return blixis_api_error('INTERNAL_ERROR');
        }
    };
}

function blixis_api_read_item(WP_REST_Request $request)
{
    $post = blixis_api_visible_post((int) $request['id']);
    if ($post === null) {
        return blixis_api_error('NOT_FOUND');
    }
    return blixis_api_cached($request, ['contract_version' => BLIXIS_API_VERSION, 'item' => blixis_api_project($post)], blixis_api_content_cache_control());
}

function blixis_api_read_list(WP_REST_Request $request)
{
    global $wpdb;
    $query = $request->get_query_params();
    foreach (['page', 'per_page', 'slug'] as $key) {
        if (isset($query[$key]) && !is_string($query[$key])) {
            return blixis_api_error('INVALID_QUERY');
        }
    }
    foreach (['page' => PHP_INT_MAX, 'per_page' => BLIXIS_API_PER_PAGE_MAX] as $key => $max) {
        if (isset($query[$key]) && (preg_match('/\A[1-9][0-9]{0,8}\z/', $query[$key]) !== 1 || (int) $query[$key] > $max)) {
            return blixis_api_error('INVALID_QUERY');
        }
    }
    if (isset($query['slug']) && preg_match('/\A[a-z0-9%_-]{1,200}\z/', $query['slug']) !== 1) {
        return blixis_api_error('INVALID_QUERY');
    }
    $page = (int) ($query['page'] ?? 1);
    $per_page = (int) ($query['per_page'] ?? 20);

    // Direct SQL: no pre_get_posts or posts_where filter from another plugin can widen the status set.
    $types = implode(',', array_map(static fn (string $t): string => $wpdb->prepare('%s', $t), BLIXIS_API_TYPES));
    $where = "post_type IN ($types) AND post_status = 'publish' AND post_password = ''";
    if (isset($query['slug'])) {
        $where .= $wpdb->prepare(' AND post_name = %s', $query['slug']);
    }
    $total = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE $where");
    $ids = $wpdb->get_col($wpdb->prepare("SELECT ID FROM {$wpdb->posts} WHERE $where ORDER BY post_date_gmt DESC, ID DESC LIMIT %d OFFSET %d", $per_page, ($page - 1) * $per_page));

    $items = [];
    foreach ($ids as $id) {
        $post = blixis_api_visible_post((int) $id);
        if ($post !== null) {
            $items[] = blixis_api_project($post);
        }
    }
    return blixis_api_cached($request, [
        'contract_version' => BLIXIS_API_VERSION,
        'items' => $items,
        'pagination' => ['page' => $page, 'per_page' => $per_page, 'total' => $total, 'total_pages' => (int) ceil($total / $per_page)],
    ], blixis_api_content_cache_control());
}

/* ---------- Routes. ---------- */

add_action('rest_api_init', static function (): void {
    $content = static fn (array $allowed) => static fn (WP_REST_Request $r) => blixis_api_gate($r, true, $allowed);
    $open = static fn (WP_REST_Request $r) => blixis_api_gate($r, false, []);

    register_rest_route('blixis/v1', '/content', [
        'methods' => 'GET',
        'permission_callback' => $content(['page', 'per_page', 'slug']),
        'callback' => blixis_api_guarded('blixis_api_read_list'),
    ]);
    register_rest_route('blixis/v1', '/content/(?P<id>[1-9][0-9]{0,18})', [
        'methods' => 'GET',
        'permission_callback' => $content([]),
        'callback' => blixis_api_guarded('blixis_api_read_item'),
    ]);
    register_rest_route('blixis/v1', '/schema', [
        'methods' => 'GET',
        'permission_callback' => $open,
        'callback' => blixis_api_guarded(static fn (WP_REST_Request $r) => blixis_api_cached($r, [
            'contract_version' => BLIXIS_API_VERSION,
            'scopes' => [BLIXIS_API_SCOPE],
            'limits' => ['per_page_max' => BLIXIS_API_PER_PAGE_MAX],
            'item_fields' => BLIXIS_API_FIELDS,
            'error_codes' => array_keys(BLIXIS_API_ERRORS),
        ], 'public, max-age=300')),
    ]);
    register_rest_route('blixis/v1', '/health', [
        'methods' => 'GET',
        'permission_callback' => $open,
        'callback' => blixis_api_guarded(static fn () => new WP_REST_Response(['contract_version' => BLIXIS_API_VERSION, 'status' => 'ok'], 200, ['Cache-Control' => 'no-store'])),
    ]);

    // Key administration: a separate namespace, cookie and nonce only, manage_options only.
    $admin = static fn (): bool => current_user_can('manage_options') && rest_get_authenticated_app_password() === null;
    register_rest_route('blixis-admin/v1', '/keys', [
        [
            'methods' => 'GET',
            'permission_callback' => $admin,
            'callback' => static function () {
                global $wpdb;
                $names = $wpdb->get_col("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE 'blixis\\_api\\_key\\_%'");
                return array_map(static fn (string $n): array => blixis_api_key_metadata((array) get_option($n)), $names);
            },
        ],
        [
            'methods' => 'POST',
            'permission_callback' => $admin,
            'callback' => static fn () => new WP_REST_Response(blixis_api_key_create([BLIXIS_API_SCOPE]), 201),
        ],
    ]);
    register_rest_route('blixis-admin/v1', '/keys/(?P<key_id>[a-f0-9]{16})', [
        'methods' => 'DELETE',
        'permission_callback' => $admin,
        'callback' => static fn (WP_REST_Request $r) => ['revoked' => blixis_api_key_revoke((string) $r['key_id'])],
    ]);
});

/* ---------- Normalising core behaviour for this namespace. Route matching in WordPress is case-insensitive. ---------- */

function blixis_api_is_own_route(string $route): bool
{
    return preg_match('#^/*blixis/v1(/|$)#i', $route) === 1;
}

add_action('rest_api_init', static function (): void {
    $route = (string) ($GLOBALS['wp']->query_vars['rest_route'] ?? '');
    if (!blixis_api_is_own_route($route)) {
        return;
    }
    global $wpdb;
    // Query control parameters are refused by the gate, so the server must not act on them first.
    $GLOBALS['blixis_api_raw_query_keys'] = array_keys($_GET);
    unset($_GET['_jsonp'], $_GET['_envelope'], $_GET['_method'], $_GET['_embed'], $_GET['_fields'], $_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']);

    // Core reflects any Origin and allows credentials. This API uses an allowlist and never allows credentials.
    remove_filter('rest_pre_serve_request', 'rest_send_cors_headers');
    // Core calls every handler's permission_callback again here to build Allow, which would run the
    // gate, its rate limit counter, and its audit line twice per request.
    remove_filter('rest_post_dispatch', 'rest_send_allow_header');
    // Priority matters: on a bad nonce core adds its own filter at 20 to force nocache headers.
    add_filter('rest_send_nocache_headers', '__return_false', PHP_INT_MAX);
    header_remove('X-Powered-By');
    $wpdb->hide_errors();
    ob_start();

    // Bad WordPress credentials must not produce a core error here; good ones must not grant anything.
    add_filter('rest_authentication_errors', static function () {
        wp_set_current_user(0);
        // Core puts a fresh nonce for the logged-in user into the response. On a public response a
        // shared cache would store it and hand it to other visitors.
        header_remove('X-WP-Nonce');
        return null;
    }, PHP_INT_MAX);
}, 11);

add_filter('rest_post_dispatch', static function (WP_REST_Response $response, WP_REST_Server $server, WP_REST_Request $request): WP_REST_Response {
    if (!blixis_api_is_own_route($request->get_route())) {
        return $response;
    }
    $headers = [];
    if ($response->get_status() >= 400) {
        $code = (string) ($response->get_data()['code'] ?? '');
        if (!isset(BLIXIS_API_ERRORS[$code])) {
            if (!in_array($request->get_method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
                $code = 'METHOD_NOT_ALLOWED';
            } elseif ($code === 'rest_no_route') {
                $code = 'NOT_FOUND';
            } elseif (in_array($code, ['rest_invalid_param', 'rest_missing_callback_param'], true)) {
                $code = 'INVALID_QUERY';
            } else {
                $code = 'INTERNAL_ERROR';
            }
        }
        [$status, $message] = BLIXIS_API_ERRORS[$code];
        $response = new WP_REST_Response(['contract_version' => BLIXIS_API_VERSION, 'code' => $code, 'message' => $message, 'data' => ['status' => $status]], $status);
        $headers['Cache-Control'] = 'no-store';
        $extra = [
            'UNAUTHORIZED' => ['WWW-Authenticate' => 'Bearer realm="blixis-content"'],
            'METHOD_NOT_ALLOWED' => ['Allow' => 'GET, HEAD, OPTIONS'],
            'RATE_LIMITED' => ['Retry-After' => '60'],
        ];
        $headers += $extra[$code] ?? [];
    } elseif (!isset($response->get_headers()['Cache-Control'])) {
        $headers['Cache-Control'] = 'no-store';
    }
    if ($request->get_method() === 'OPTIONS') {
        $headers['Allow'] = 'GET, HEAD, OPTIONS';
    }
    $headers['Vary'] = BLIXIS_API_VARY;
    $origin = get_http_origin();
    if ($origin !== null && $origin !== '' && in_array($origin, blixis_api_config()['cors_allowlist'], true)) {
        $headers['Access-Control-Allow-Origin'] = $origin;
        $headers['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS';
        $headers['Access-Control-Allow-Headers'] = 'Authorization, If-None-Match';
        $headers['Access-Control-Expose-Headers'] = 'ETag, Retry-After';
    }
    $response->set_headers($headers + $response->get_headers());
    return $response;
}, 1, 3);

add_filter('rest_pre_serve_request', static function (bool $served, WP_HTTP_Response $result, WP_REST_Request $request): bool {
    if ($served || !blixis_api_is_own_route($request->get_route())) {
        return $served;
    }
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    if ($request->get_method() !== 'HEAD' && $result->get_status() !== 304) {
        echo wp_json_encode($result->get_data());
    }
    return true;
}, 20, 3);
