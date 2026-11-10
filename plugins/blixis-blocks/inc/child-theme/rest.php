<?php
/**
 * REST route for the child theme generator (task 03-01).
 *
 * POST /wp-json/blixis-editor/v1/child-themes
 *
 * Requires a logged-in user with edit_theme_options and install_themes, plus a
 * valid wp_rest nonce in the X-WP-Nonce header. Application passwords and
 * other nonce-less authentication are refused, because generation is a
 * browser setup action. The route is hidden from the REST index.
 *
 * @package Blixis\Blocks
 */

declare(strict_types=1);

namespace Blixis\Blocks\ChildTheme;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

if (!defined('ABSPATH')) {
    exit;
}

const REST_NAMESPACE = 'blixis-editor/v1';
const REST_ROUTE     = '/child-themes';

/**
 * Permission check. Idempotent: WordPress may call it twice per request.
 *
 * @param WP_REST_Request $request Request.
 * @return true|WP_Error
 */
function rest_permission( WP_REST_Request $request ): bool|WP_Error {
    if (!is_user_logged_in()) {
        return new WP_Error('rest_forbidden', __('You must be logged in.', 'blixis-blocks'), array( 'status' => 401 ));
    }
    if (!current_user_can('edit_theme_options') || !current_user_can('install_themes')) {
        return new WP_Error('rest_forbidden', __('You are not allowed to create child themes.', 'blixis-blocks'), array( 'status' => 403 ));
    }
    $nonce = (string) $request->get_header('x_wp_nonce');
    if ('' === $nonce || !wp_verify_nonce($nonce, 'wp_rest')) {
        return new WP_Error('blixis_child_nonce_required', __('A valid request nonce is required.', 'blixis-blocks'), array( 'status' => 403 ));
    }
    return true;
}

/**
 * Create a child theme.
 *
 * @param WP_REST_Request $request Request.
 * @return WP_REST_Response|WP_Error
 */
function rest_create( WP_REST_Request $request ): WP_REST_Response|WP_Error {
    $body = $request->get_json_params();
    if (!is_array($body)) {
        return new WP_Error('blixis_child_invalid', __('The child theme details are invalid.', 'blixis-blocks'), array(
			'status' => 400,
			'errors' => array(
				array(
					'field' => '',
					'code'  => 'invalid_type',
				),
			),
		));
    }
    $result = create($body);
    if (is_wp_error($result)) {
        return $result;
    }
    return new WP_REST_Response($result, 201);
}

add_action(
    'rest_api_init',
    static function (): void {
        register_rest_route(
            REST_NAMESPACE,
            REST_ROUTE,
            array(
                'methods'             => 'POST',
                'callback'            => __NAMESPACE__ . '\\rest_create',
                'permission_callback' => __NAMESPACE__ . '\\rest_permission',
                'args'                => array(
					'starter' => array(
						'type'        => 'string',
						'enum'        => array( 'none', 'neutral' ),
						'required'    => false,
						'description' => __( 'Legacy layout field retained for compatibility.', 'blixis-blocks' ),
					),
					'layout'  => array(
						'type'        => 'string',
						'enum'        => array( 'blank', 'business', 'portfolio', 'blog', 'landing' ),
						'required'    => false,
						'description' => __( 'Front page layout.', 'blixis-blocks' ),
					),
				),
                'show_in_index'       => false,
            )
        );
    }
);
