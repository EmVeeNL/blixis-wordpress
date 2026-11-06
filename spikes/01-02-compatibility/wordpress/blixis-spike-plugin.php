<?php
/**
 * Plugin Name: Blixis 01-02 Compatibility Spike
 * Description: Throwaway plugin for the 01-02 smoke tests. Not product code.
 * Version: 0.0.0
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

const BLIXIS_SPIKE_META = '_blixis_document';
const BLIXIS_SPIKE_REST_VARIANT = '_blixis_rest_variant';

add_action('init', static function (): void {
    $auth = static fn ($allowed, $key, $post_id, $user_id): bool => user_can($user_id, 'edit_post', $post_id);

    // The planned shape: protected, revisioned, and only reachable through a dedicated route.
    register_post_meta('page', BLIXIS_SPIKE_META, [
        'type' => 'string',
        'single' => true,
        'show_in_rest' => false,
        'revisions_enabled' => true,
        'auth_callback' => $auth,
    ]);

    // The rejected shape, kept to measure what the generic routes would expose.
    register_post_meta('page', BLIXIS_SPIKE_REST_VARIANT, [
        'type' => 'string',
        'single' => true,
        'show_in_rest' => true,
        'auth_callback' => $auth,
    ]);
});

add_action('rest_api_init', static function (): void {
    $can_edit = static fn (WP_REST_Request $r): bool => current_user_can('edit_post', (int) $r['id']);

    register_rest_route('blixis-spike/v1', '/pages/(?P<id>\d+)/document', [
        [
            'methods' => 'GET',
            'permission_callback' => $can_edit,
            'callback' => static fn (WP_REST_Request $r) => [
                'document' => get_post_meta((int) $r['id'], BLIXIS_SPIKE_META, true),
            ],
        ],
        [
            'methods' => 'PUT',
            'permission_callback' => $can_edit,
            'args' => [
                'document' => [
                    'required' => true,
                    'type' => 'string',
                    'validate_callback' => static function ($value) {
                        // json_validate() needs PHP 8.3, and PHP 8.2 is in the tested range.
                        if (!is_string($value) || (json_decode($value) === null && json_last_error() !== JSON_ERROR_NONE)) {
                            return new WP_Error('blixis_spike_invalid_json', 'Document must be valid JSON.', ['status' => 400]);
                        }
                        return true;
                    },
                ],
            ],
            'callback' => static function (WP_REST_Request $r) {
                // update_post_meta() unslashes its value, so JSON must be slashed first.
                update_post_meta((int) $r['id'], BLIXIS_SPIKE_META, wp_slash($r['document']));
                return ['document' => get_post_meta((int) $r['id'], BLIXIS_SPIKE_META, true)];
            },
        ],
    ]);
});
