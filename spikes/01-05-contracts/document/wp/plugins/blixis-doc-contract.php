<?php
/**
 * Plugin Name: Blixis Document Contract Proof
 * Description: Throwaway proof for task 01-05. Not product code.
 * Version: 0.0.0
 * Requires PHP: 8.3
 */

declare(strict_types=1);

require_once __DIR__ . '/blixis-doc-contract-lib/validator.php';
require_once __DIR__ . '/blixis-doc-contract-lib/migrate.php';
require_once __DIR__ . '/blixis-doc-contract-lib/render.php';

const BDC_META = '_blixis_document';
const BDC_HASH = '_blixis_content_hash';
const BDC_NS = 'blixis-contract/v1';

/** @return array<string, array<string, mixed>> */
function bdc_registry(): array
{
    static $registry = null;
    return $registry ??= json_decode((string) file_get_contents(__DIR__ . '/blixis-doc-contract-lib/registry.json'), true, 64, JSON_THROW_ON_ERROR);
}

/** Which schema version this plugin build can read. An option only so one test can act as two builds. */
function bdc_reader(): int
{
    return (int) get_option('bdc_reader', 1);
}

add_action('init', static function (): void {
    foreach (['post', 'page'] as $type) {
        foreach ([BDC_META, BDC_HASH] as $key) {
            register_post_meta($type, $key, [
                'type' => 'string',
                'single' => true,
                'show_in_rest' => false,
                'revisions_enabled' => true,
                // No generic caller writes these. The route has its own capability check.
                'auth_callback' => '__return_false',
            ]);
        }
    }
});

function bdc_token_for(string $raw): string
{
    return '"sha256:' . hash('sha256', $raw) . '"';
}

function bdc_raw(int $id): string
{
    return (string) get_post_meta($id, BDC_META, true);
}

function bdc_has_document(int $id): bool
{
    return metadata_exists('post', $id, BDC_META);
}

/** @return array{status: string, codes: array<int, string>, errors: array<int, array{code: string, path: string}>, truncated: bool, preserved: array<int, string>} */
function bdc_validate(string $raw, ?string $stored): array
{
    $reader = bdc_reader();
    if ($reader >= 2) {
        // Hypothetical v2 reader: validate a v2 document through its lossless v1 shape.
        $doc = json_decode($raw);
        if ($doc instanceof stdClass && ($doc->schemaVersion ?? null) === 2) {
            $raw = (string) json_encode(blixis_doc_migrate_v2_to_v1($doc), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            $stored = null;
        }
    }
    return blixis_doc_validate($raw, bdc_registry(), $stored, min($reader, 1));
}

/**
 * Read path. Never writes. An older document migrates in memory; anything else falls back.
 *
 * @return array{state: string, doc: ?stdClass, codes: array<int, string>}
 */
function bdc_load(int $id): array
{
    if (!bdc_has_document($id)) {
        return ['state' => 'none', 'doc' => null, 'codes' => []];
    }
    $raw = bdc_raw($id);
    $doc = json_decode($raw, false, 64);
    $version = $doc instanceof stdClass ? ($doc->schemaVersion ?? null) : null;
    if (is_int($version) && $version > bdc_reader()) {
        return ['state' => 'fallback', 'doc' => null, 'codes' => ['unsupported_schema_version']];
    }
    $result = bdc_validate($raw, $raw);
    if ($result['status'] !== 'valid') {
        return ['state' => 'fallback', 'doc' => null, 'codes' => $result['codes']];
    }
    $migrated = blixis_doc_migrate($doc, bdc_reader());
    if (!$migrated['ok']) {
        return ['state' => 'fallback', 'doc' => null, 'codes' => [(string) $migrated['code']]];
    }
    return ['state' => 'ready', 'doc' => $migrated['output'], 'codes' => []];
}

// One write at a time per request sets the hash inside wp_insert_post, before WordPress copies the
// meta into the new revision. Kses has already run by then, so the hash matches what is stored.
$GLOBALS['bdc_writing'] = 0;
add_filter('wp_insert_post_data', static function (array $data, array $postarr): array {
    if ($GLOBALS['bdc_writing'] !== 0 && (int) ($postarr['ID'] ?? 0) === $GLOBALS['bdc_writing']) {
        update_post_meta($GLOBALS['bdc_writing'], BDC_HASH, hash('sha256', wp_unslash($data['post_content'])));
    }
    return $data;
}, PHP_INT_MAX, 2);

function bdc_diverged(int $id): bool
{
    $hash = (string) get_post_meta($id, BDC_HASH, true);
    $post = get_post($id);
    return bdc_has_document($id) && $post !== null && $hash !== hash('sha256', $post->post_content);
}

/** @return array{code: int, error: ?string, token: ?string, errors: array<int, mixed>} */
function bdc_reply(int $code, ?string $error = null, ?string $token = null, array $errors = []): array
{
    return ['code' => $code, 'error' => $error, 'token' => $token, 'errors' => $errors];
}

/**
 * The only write path. $if_match is the token from the last read.
 *
 * @param array{mode?: string} $options
 * @return array{code: int, error: ?string, token: ?string, errors: array<int, mixed>}
 */
function bdc_save(int $id, string $raw, ?string $if_match, array $options = []): array
{
    global $wpdb;
    if ($if_match === null || $if_match === '') {
        return bdc_reply(428, 'precondition_required');
    }
    $current = bdc_raw($id);
    if (!hash_equals(bdc_token_for($current), $if_match)) {
        return bdc_reply(412, 'version_conflict', bdc_token_for($current));
    }
    if ($current !== '') {
        $held = json_decode($current);
        if ($held instanceof stdClass && is_int($held->schemaVersion ?? null) && $held->schemaVersion > bdc_reader()) {
            return bdc_reply(409, 'stored_document_unsupported', bdc_token_for($current));
        }
    }
    $result = bdc_validate($raw, $current === '' ? null : $current);
    if ($result['status'] !== 'valid') {
        return bdc_reply(422, 'invalid_document', null, $result['errors']);
    }

    do_action('bdc_between_check_and_write', $id);
    $sleep = (int) get_option('bdc_race_sleep_ms', 0);
    if ($sleep > 0) {
        usleep($sleep * 1000);
    }

    // 'lock' is the proposed write. The other two exist only so the test can measure what they lose.
    $mode = $options['mode'] ?? (string) get_option('bdc_write_mode', 'lock');
    $wpdb->query('START TRANSACTION');
    try {
        if ($mode === 'none') {
            update_post_meta($id, BDC_META, wp_slash($raw));
        } elseif ($mode === 'sha-swap') {
            // Compares in the database, but cannot serialize a first write: no row exists to swap.
            if ($current === '' && !metadata_exists('post', $id, BDC_META)) {
                if (add_post_meta($id, BDC_META, wp_slash($raw), true) === false) {
                    throw new DomainException('version_conflict');
                }
            } elseif ($raw !== $current) {
                $changed = $wpdb->query($wpdb->prepare(
                    "UPDATE {$wpdb->postmeta} SET meta_value = %s WHERE post_id = %d AND meta_key = %s AND SHA2(meta_value, 256) = %s",
                    $raw,
                    $id,
                    BDC_META,
                    hash('sha256', $current),
                ));
                if ($changed !== 1) {
                    throw new DomainException('version_conflict');
                }
            }
        } else {
            // The post row is the per-post mutex, so it also covers a first write with no meta row.
            $wpdb->get_var($wpdb->prepare("SELECT ID FROM {$wpdb->posts} WHERE ID = %d FOR UPDATE", $id));
            $rows = $wpdb->get_col($wpdb->prepare(
                "SELECT meta_value FROM {$wpdb->postmeta} WHERE post_id = %d AND meta_key = %s FOR UPDATE",
                $id,
                BDC_META,
            ));
            if (count($rows) > 1 || ($rows[0] ?? '') !== $current) {
                throw new DomainException('version_conflict');
            }
            if ($rows === []) {
                add_post_meta($id, BDC_META, wp_slash($raw), true);
            } elseif ($raw !== $current) {
                $wpdb->update($wpdb->postmeta, ['meta_value' => $raw], ['post_id' => $id, 'meta_key' => BDC_META]);
            }
        }
        wp_cache_delete($id, 'post_meta');
        do_action('bdc_after_cas', $id);

        $doc = json_decode($raw);
        if ($doc instanceof stdClass && ($doc->schemaVersion ?? 0) === 2) {
            $doc = blixis_doc_migrate_v2_to_v1($doc);
        }
        $GLOBALS['bdc_writing'] = $id;
        $updated = wp_update_post(['ID' => $id, 'post_content' => wp_slash(bdc_project_content($doc, bdc_strategy()))], true);
        $GLOBALS['bdc_writing'] = 0;
        if ($updated instanceof WP_Error) {
            throw new RuntimeException($updated->get_error_message());
        }
        do_action('bdc_before_commit', $id);
        $wpdb->query('COMMIT');
    } catch (DomainException) {
        $GLOBALS['bdc_writing'] = 0;
        $wpdb->query('ROLLBACK');
        clean_post_cache($id);
        wp_cache_delete($id, 'post_meta');
        return bdc_reply(412, 'version_conflict');
    } catch (Throwable $e) {
        $GLOBALS['bdc_writing'] = 0;
        $wpdb->query('ROLLBACK');
        clean_post_cache($id);
        wp_cache_delete($id, 'post_meta');
        return bdc_reply(500, 'write_failed');
    }
    return bdc_reply(200, null, bdc_token_for($raw));
}

/** Bulk or on-demand migration of one post. Same guarded write; failure leaves the post alone. */
function bdc_migrate_post(int $id, int $target): array
{
    $raw = bdc_raw($id);
    $result = blixis_doc_migrate(json_decode($raw), $target);
    if (!$result['ok']) {
        return bdc_reply(409, (string) $result['code']);
    }
    $encoded = (string) json_encode($result['output'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_LINE_TERMINATORS);
    return bdc_save($id, $encoded, bdc_token_for($raw));
}

/** An autosave goes only onto the user's autosave revision row. The post itself is never touched. */
function bdc_autosave(int $id, string $raw): array
{
    require_once ABSPATH . 'wp-admin/includes/post.php';
    $result = bdc_validate($raw, bdc_raw($id) ?: null);
    if ($result['status'] !== 'valid') {
        return bdc_reply(422, 'invalid_document', null, $result['errors']);
    }
    $existing = wp_get_post_autosave($id, get_current_user_id());
    $autosave = $existing ? $existing->ID : _wp_put_post_revision(get_post($id), true);
    if (!is_int($autosave) || $autosave === 0) {
        return bdc_reply(500, 'autosave_failed');
    }
    update_metadata('post', $autosave, BDC_META, wp_slash($raw));
    return bdc_reply(200, null, bdc_token_for($raw)) + ['autosave' => $autosave];
}

/** Explicit hand-over to the block editor. The document stays recoverable through revisions. */
function bdc_convert_to_gutenberg(int $id): void
{
    wp_update_post(['ID' => $id, 'post_title' => get_post($id)->post_title]);
    delete_post_meta($id, BDC_META);
    delete_post_meta($id, BDC_HASH);
}

add_filter('use_block_editor_for_post', static fn ($use, $post) => bdc_has_document((int) $post->ID) ? false : $use, 10, 2);

foreach (['post', 'page'] as $bdc_type) {
    add_filter("rest_pre_insert_$bdc_type", static function ($prepared, WP_REST_Request $request) {
        if (isset($request['id'], $request['content']) && bdc_has_document((int) $request['id'])) {
            return new WP_Error('blixis_owned', 'This page is owned by the Blixis editor. Convert it first.', ['status' => 409]);
        }
        return $prepared;
    }, 10, 2);
}

// After every core filter, as the token and renderer contract requires. An earlier hook lets core run
// shortcodes in user text.
add_filter('the_content', static function ($content) {
    $post = get_post();
    if (!$post instanceof WP_Post || !bdc_has_document((int) $post->ID)) {
        return $content;
    }
    if ((string) get_option('bdc_naive_password', '') === '' && post_password_required($post)) {
        return $content;
    }
    $loaded = bdc_load((int) $post->ID);
    if ($loaded['state'] !== 'ready') {
        return $content;
    }
    return '<div data-blixis-rendered="1">' . bdc_render($loaded['doc']) . '</div>';
}, PHP_INT_MAX);

add_action('rest_api_init', static function (): void {
    $can_edit = static fn (WP_REST_Request $r): bool => current_user_can('edit_post', (int) $r['id']);
    $id = ['id' => ['validate_callback' => static fn ($v): bool => is_numeric($v)]];
    $send = static function (array $reply): WP_REST_Response {
        $body = $reply['code'] === 200 ? ['token' => $reply['token']] : ['error' => $reply['error'], 'errors' => $reply['errors']];
        $response = new WP_REST_Response($body, $reply['code']);
        if ($reply['token'] !== null) {
            $response->header('ETag', $reply['token']);
        }
        return $response;
    };
    register_rest_route(BDC_NS, '/posts/(?P<id>\d+)/document', [
        [
            'methods' => 'GET',
            'args' => $id,
            'permission_callback' => $can_edit,
            'callback' => static function (WP_REST_Request $r): WP_REST_Response {
                $response = new WP_REST_Response(['document' => bdc_raw((int) $r['id'])], 200);
                $response->header('ETag', bdc_token_for(bdc_raw((int) $r['id'])));
                return $response;
            },
        ],
        [
            'methods' => 'PUT',
            'args' => $id,
            'permission_callback' => $can_edit,
            'callback' => static fn (WP_REST_Request $r): WP_REST_Response => $send(bdc_save((int) $r['id'], (string) $r->get_body(), $r->get_header('if_match'))),
        ],
    ]);
    register_rest_route(BDC_NS, '/posts/(?P<id>\d+)/autosave', [
        'methods' => 'POST',
        'args' => $id,
        'permission_callback' => $can_edit,
        'callback' => static fn (WP_REST_Request $r): WP_REST_Response => $send(bdc_autosave((int) $r['id'], (string) $r->get_body())),
    ]);
});
