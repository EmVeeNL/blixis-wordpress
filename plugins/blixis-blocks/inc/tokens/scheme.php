<?php
/**
 * Site colour scheme setting (task 03-06).
 *
 * Chooses how a configuration with a dark palette is shown: follow the visitor's system
 * setting (default), always light, or always dark. There is no visitor-facing toggle.
 * The value lives in one validated option; changing it needs the edit_theme_options
 * capability and purges page caches like any other token change.
 *
 * @package Blixis\Blocks
 */

declare(strict_types=1);

namespace Blixis\Blocks\Tokens;

use WP_Error;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const SCHEME_OPTION_GROUP = 'blixis_tokens';

/**
 * The stored scheme; anything missing or unknown is the default.
 *
 * @return string system, light, or dark.
 */
function scheme_get(): string {
	return normalize_scheme( get_option( token_map()['colorScheme']['option'], token_map()['colorScheme']['default'] ) );
}

/**
 * Sanitize callback: keeps the current value when the submitted one is not allowed.
 *
 * @param mixed $value Submitted value.
 * @return string
 */
function scheme_sanitize( $value ): string {
	$allowed = token_map()['colorScheme']['values'];
	return is_string( $value ) && in_array( $value, $allowed, true ) ? $value : scheme_get();
}

/**
 * Saves the scheme. Checks the capability and the value.
 *
 * @param mixed $value Submitted value.
 * @return string|WP_Error The stored value.
 */
function scheme_save( $value ): string|WP_Error {
	if ( ! current_user_can( 'edit_theme_options' ) ) {
		return new WP_Error( 'blixis_scheme_forbidden', __( 'Sorry, you are not allowed to change the colour scheme.', 'blixis-blocks' ), array( 'status' => 403 ) );
	}
	$setting = token_map()['colorScheme'];
	if ( ! is_string( $value ) || ! in_array( $value, $setting['values'], true ) ) {
		return new WP_Error( 'blixis_scheme_invalid', __( 'The colour scheme must be system, light, or dark.', 'blixis-blocks' ), array( 'status' => 400 ) );
	}
	if ( scheme_get() !== $value || false === get_option( $setting['option'] ) ) {
		update_option( $setting['option'], $value, true );
		reset_request_cache();
		$stored = store_read();
		/** This action is documented in inc/tokens/apply.php. */
		do_action( 'blixis_tokens_changed', $stored ? $stored['revision'] : 0, $stored ? $stored['hash'] : '' );
	}
	return $value;
}

add_action(
	'admin_init',
	static function (): void {
		register_setting(
			SCHEME_OPTION_GROUP,
			token_map()['colorScheme']['option'],
			array(
				'type'              => 'string',
				'default'           => token_map()['colorScheme']['default'],
				'sanitize_callback' => __NAMESPACE__ . '\\scheme_sanitize',
				'show_in_rest'      => false,
			)
		);
	}
);

// Saving through options.php would otherwise need manage_options.
add_filter(
	'option_page_capability_' . SCHEME_OPTION_GROUP,
	static fn(): string => 'edit_theme_options'
);
