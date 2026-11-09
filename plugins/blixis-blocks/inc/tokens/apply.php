<?php
/**
 * Apply stored tokens to the site, preview drafts, and roll back (task 03-05).
 *
 * The effective configuration is the stored config, or its previous config when the
 * stored one does not validate, or nothing (Base presets). It applies only while its
 * child theme is the active stylesheet. It reaches WordPress through the theme-origin
 * theme.json data and an inline `blixis-tokens` stylesheet, and chosen Font Library
 * fonts are printed as local @font-face rules. Site Editor user settings cannot
 * override a Blixis token preset.
 *
 * A preview request (`?blixis_preview=<nonce>` from a user who can edit theme options)
 * applies that user's wizard draft instead, is never cached, and is not indexed.
 *
 * @package Blixis\Blocks
 */

declare(strict_types=1);

namespace Blixis\Blocks\Tokens;

use WP_Error;
use WP_Theme_JSON_Data;

use function Blixis\Blocks\Fonts\print_font_faces_for;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const PREVIEW_PARAM  = 'blixis_preview';
const PREVIEW_ACTION = 'blixis_preview';
const DRAFT_META     = 'blixis_setup_draft';

/**
 * Whether this request is a valid draft preview for the current user.
 */
function is_preview(): bool {
	static $result = null;
	if ( null !== $result ) {
		return $result;
	}
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- The value is the nonce.
	$nonce  = isset( $_GET[ PREVIEW_PARAM ] ) ? sanitize_text_field( wp_unslash( $_GET[ PREVIEW_PARAM ] ) ) : '';
	$result = '' !== $nonce && is_user_logged_in() && current_user_can( 'edit_theme_options' ) && false !== wp_verify_nonce( $nonce, PREVIEW_ACTION );
	return $result;
}

/**
 * The current user's validated wizard draft, or null.
 *
 * @return array<string, mixed>|null
 */
function draft_config(): ?array {
	$raw   = get_user_meta( get_current_user_id(), DRAFT_META, true );
	$draft = is_string( $raw ) ? json_decode( $raw, true, 32 ) : null;
	if ( ! is_array( $draft ) || ! is_array( $draft['config'] ?? null ) ) {
		$stored = store_read();
		return $stored ? $stored['config'] : null;
	}
	$checked = validate_bytes( canonical_json( $draft['config'] ) );
	return $checked['ok'] ? $checked['config'] : null;
}

/**
 * The configuration to apply on this request, or null for Base presets.
 *
 * @return array<string, mixed>|null
 */
function effective_config( bool $reset = false ): ?array {
	static $cache = array();
	if ( $reset ) {
		$cache = array();
		return null;
	}
	$key = is_preview() ? 'preview' : 'stored';
	if ( array_key_exists( $key, $cache ) ) {
		return $cache[ $key ];
	}
	if ( 'preview' === $key ) {
		$config = draft_config();
	} else {
		$stored = store_read();
		$config = $stored ? $stored['config'] : previous_config();
	}
	// Preview shows the draft on whatever theme is active; the public site applies a config
	// only to its own child theme.
	if ( null !== $config && 'stored' === $key && ( $config['theme']['slug'] ?? '' ) !== get_stylesheet() ) {
		$config = null;
	}
	$cache[ $key ] = $config;
	return $config;
}

/**
 * The previous config of a stored row whose current config does not validate.
 *
 * @return array<string, mixed>|null
 */
function previous_config(): ?array {
	$raw    = store_raw();
	$record = null === $raw ? null : json_decode( $raw, true, 64 );
	if ( ! is_array( $record ) || ! is_array( $record['previous'] ?? null ) ) {
		return null;
	}
	$checked = validate_bytes( canonical_json( $record['previous'] ) );
	return $checked['ok'] ? $checked['config'] : null;
}

/**
 * Forget the per-request caches. Used after a save and by tests.
 */
function reset_request_cache(): void {
	effective_config( true );
	wp_clean_theme_json_cache();
}

/**
 * Roll back to the previous configuration, as a new revision.
 *
 * @param int $expected_revision Revision the caller is looking at.
 * @return array{revision: int, hash: string}|WP_Error
 */
function store_rollback( int $expected_revision ): array|WP_Error {
	$stored = store_read();
	if ( ! $stored || ! is_array( $stored['previous'] ) ) {
		return new WP_Error( 'blixis_config_no_previous', __( 'There is no previous configuration to roll back to.', 'blixis-blocks' ), array( 'status' => 409 ) );
	}
	return store_write( canonical_json( $stored['previous'] ), $expected_revision );
}

/**
 * Theme-origin theme.json data from the effective config.
 *
 * @param WP_Theme_JSON_Data $data Theme data.
 */
function filter_theme_json( $data ) {
	$config = effective_config();
	if ( null === $config ) {
		return $data;
	}
	$tokens = theme_json_from_validated_config( $config );
	return $tokens ? $data->update_with( $tokens ) : $data;
}

/**
 * Remove user-origin (Site Editor) overrides of the presets Blixis tokens own.
 *
 * @param WP_Theme_JSON_Data $data User data.
 */
function filter_user_theme_json( $data ) {
	if ( null === effective_config() ) {
		return $data;
	}
	$raw     = $data->get_data();
	$changed = false;
	$owned   = array(
		array( 'color', 'palette' ),
		array( 'typography', 'fontFamilies' ),
		array( 'typography', 'fontSizes' ),
		array( 'spacing', 'spacingSizes' ),
		array( 'border', 'radiusSizes' ),
		array( 'shadow', 'presets' ),
	);
	foreach ( $owned as list( $group, $key ) ) {
		if ( isset( $raw['settings'][ $group ][ $key ]['theme'] ) ) {
			unset( $raw['settings'][ $group ][ $key ]['theme'] );
			$changed = true;
		}
	}
	foreach ( array( 'contentSize', 'wideSize' ) as $key ) {
		if ( isset( $raw['settings']['layout'][ $key ] ) ) {
			unset( $raw['settings']['layout'][ $key ] );
			$changed = true;
		}
	}
	if ( ! $changed ) {
		return $data;
	}
	return new WP_Theme_JSON_Data( $raw, 'custom' );
}

/**
 * Inline token stylesheet and fonts.
 */
function enqueue_tokens(): void {
	$config = effective_config();
	if ( null === $config ) {
		return;
	}
	wp_register_style( 'blixis-tokens', false, array(), null ); // phpcs:ignore WordPress.WP.EnqueuedResourceParameters.MissingVersion -- Inline only.
	wp_enqueue_style( 'blixis-tokens' );
	wp_add_inline_style( 'blixis-tokens', generate_css( $config ) );
}

/**
 * Preview responses must never be cached or indexed.
 */
function preview_headers(): void {
	if ( is_preview() ) {
		nocache_headers();
		header( 'X-Robots-Tag: noindex, nofollow' );
		header( 'Cache-Control: no-store, private' );
	}
}

add_filter( 'wp_theme_json_data_theme', __NAMESPACE__ . '\\filter_theme_json', 20 );
add_filter( 'wp_theme_json_data_user', __NAMESPACE__ . '\\filter_user_theme_json', 20 );
add_action( 'wp_enqueue_scripts', __NAMESPACE__ . '\\enqueue_tokens', 20 );
add_action( 'enqueue_block_assets', __NAMESPACE__ . '\\enqueue_tokens', 20 );
add_action(
	'wp_head',
	static function (): void {
		$config = effective_config();
		if ( null !== $config ) {
			print_font_faces_for( $config );
		}
	},
	5
);
add_action( 'send_headers', __NAMESPACE__ . '\\preview_headers' );
add_filter(
	'wp_robots',
	static function ( array $robots ): array {
		return is_preview() ? wp_robots_no_robots( $robots ) : $robots;
	}
);

// A saved configuration must reach global styles at once, and page caches must be told.
add_action(
	'blixis_tokens_saved',
	static function ( int $revision, string $hash ): void {
		reset_request_cache();
		/**
		 * Fires after the stored token configuration changed. Page caches should purge here.
		 *
		 * @param int    $revision New revision.
		 * @param string $hash     Config hash.
		 */
		do_action( 'blixis_tokens_changed', $revision, $hash );
	},
	10,
	2
);
