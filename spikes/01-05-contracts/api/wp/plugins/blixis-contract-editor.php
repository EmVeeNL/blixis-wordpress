<?php
/**
 * Plugin Name: Blixis 01-05 editor boundary proof
 * Description: Throwaway proof of the proposed editor routes, protected meta shape, and preview headers. Not product code.
 * Version: 0.0.0
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

const BLIXIS_EDITOR_META = '_blixis_document';
const BLIXIS_EDITOR_META_0102 = '_blixis_doc_shape_0102';

add_action('init', static function (): void {
    // Recommended shape: no generic path may read or write it, including users who can edit the page.
    register_post_meta('page', BLIXIS_EDITOR_META, [
        'type' => 'string',
        'single' => true,
        'show_in_rest' => false,
        'revisions_enabled' => true,
        'auth_callback' => '__return_false',
    ]);
    // The 01-02 spike shape, kept only to measure what it exposes outside REST.
    register_post_meta('page', BLIXIS_EDITOR_META_0102, [
        'type' => 'string',
        'single' => true,
        'show_in_rest' => false,
        'auth_callback' => static fn ($allowed, $key, $post_id, $user_id): bool => user_can($user_id, 'edit_post', $post_id),
    ]);
});

function blixis_editor_page(int $id): ?WP_Post
{
    $post = get_post($id);
    return $post instanceof WP_Post && $post->post_type === 'page' && $post->post_status !== 'trash' ? $post : null;
}

function blixis_editor_can_edit(WP_REST_Request $request): bool
{
    $id = (int) $request['id'];
    return blixis_editor_page($id) !== null && current_user_can('edit_post', $id);
}

add_action('rest_api_init', static function (): void {
    $document_arg = [
        'required' => true,
        'type' => 'string',
        'validate_callback' => static fn ($value) => is_string($value) && json_validate($value)
            ? true
            : new WP_Error('blixis_invalid_document', 'Document must be valid JSON.', ['status' => 400]),
    ];

    register_rest_route('blixis-editor/v1', '/pages/(?P<id>[0-9]+)/document', [
        [
            'methods' => 'GET',
            'permission_callback' => 'blixis_editor_can_edit',
            'callback' => static fn (WP_REST_Request $r) => ['document' => get_post_meta((int) $r['id'], BLIXIS_EDITOR_META, true)],
        ],
        [
            'methods' => 'PUT',
            'permission_callback' => 'blixis_editor_can_edit',
            'args' => ['document' => $document_arg],
            'callback' => static function (WP_REST_Request $r) {
                $id = (int) $r['id'];
                // The stored document of a live page is what visitors see. Changing it is publishing.
                if (in_array(get_post_status($id), ['publish', 'future', 'private'], true)) {
                    return new WP_Error('blixis_use_autosave', 'Save to the autosave route, then publish.', ['status' => 409]);
                }
                update_post_meta($id, BLIXIS_EDITOR_META, wp_slash($r['document']));
                return ['saved' => true];
            },
        ],
    ]);
    register_rest_route('blixis-editor/v1', '/pages/(?P<id>[0-9]+)/autosave', [
        'methods' => 'POST',
        'permission_callback' => 'blixis_editor_can_edit',
        'args' => ['document' => $document_arg],
        'callback' => static function (WP_REST_Request $r) {
            $id = (int) $r['id'];
            $autosave = wp_get_post_autosave($id, get_current_user_id());
            $revision = $autosave ? $autosave->ID : _wp_put_post_revision(get_post($id, ARRAY_A), true);
            if (!$revision || is_wp_error($revision)) {
                return new WP_Error('blixis_autosave_failed', 'Autosave failed.', ['status' => 500]);
            }
            // update_metadata(), because update_post_meta() redirects a revision ID to the parent.
            update_metadata('post', $revision, BLIXIS_EDITOR_META, wp_slash($r['document']));
            return ['autosave_id' => $revision, 'status' => get_post_status($id)];
        },
    ]);
    register_rest_route('blixis-editor/v1', '/pages/(?P<id>[0-9]+)/publish', [
        'methods' => 'POST',
        'permission_callback' => static fn (WP_REST_Request $r): bool => blixis_editor_can_edit($r) && current_user_can('publish_pages'),
        'callback' => static function (WP_REST_Request $r) {
            $id = (int) $r['id'];
            $autosave = wp_get_post_autosave($id, get_current_user_id());
            if ($autosave) {
                $document = get_metadata('post', $autosave->ID, BLIXIS_EDITOR_META, true);
                if ($document !== '') {
                    update_post_meta($id, BLIXIS_EDITOR_META, wp_slash($document));
                }
            }
            wp_update_post(['ID' => $id, 'post_status' => 'publish']);
            return ['status' => get_post_status($id)];
        },
    ]);
});

/* Preview responses: never stored, never indexed. Applies to any view of non-public content. */
add_action('template_redirect', static function (): void {
    if (get_option('blixis_fixture_preview_headers', '1') !== '1') {
        return;
    }
    $id = get_queried_object_id();
    if (is_preview() || ($id && is_singular() && get_post_status($id) !== 'publish')) {
        nocache_headers();
        header('Cache-Control: no-store, private');
        header('X-Robots-Tag: noindex, nofollow');
        add_filter('wp_robots', 'wp_robots_no_robots');
    }
}, 0);
