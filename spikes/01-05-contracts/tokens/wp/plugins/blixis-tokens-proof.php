<?php
/**
 * Plugin Name: Blixis Tokens Proof
 * Description: Throwaway proof for task 01-05. Persistence, theme.json filter, token CSS, renderer hook.
 * Version: 0.0.0
 * Requires PHP: 8.3
 */

declare(strict_types=1);

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/blixis-tokens-lib/validate.php';
require_once __DIR__ . '/blixis-tokens-lib/generate.php';
require_once __DIR__ . '/blixis-tokens-lib/render.php';

const BLIXIS_PROOF_OPTION = 'blixis_theme_config';
const BLIXIS_PROOF_META   = '_blixis_proof_nodes';

/**
 * Reads the option row straight from the database, skipping every cache.
 *
 * @return string|null
 */
function blixis_proof_raw_row(): ?string {
	global $wpdb;
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- Compare-and-swap needs the stored bytes.
	return $wpdb->get_var( $wpdb->prepare( "SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", BLIXIS_PROOF_OPTION ) );
}

/**
 * Validates one stored snapshot again. Stored data is never trusted: a restored backup or a
 * direct database edit must not reach CSS.
 *
 * @param mixed $snapshot Decoded snapshot.
 * @return array<string, mixed>|null
 */
function blixis_proof_check_snapshot( $snapshot ): ?array {
	if ( ! is_array( $snapshot ) || ! is_array( $snapshot['config'] ?? null ) ) {
		return null;
	}
	$result = blixis_validate_bytes( (string) wp_json_encode( $snapshot['config'] ) );
	if ( ! $result['ok'] || blixis_config_hash( $result['config'] ) !== ( $snapshot['hash'] ?? '' ) ) {
		return null;
	}
	return $result['config'];
}

/**
 * Returns the active config: the stored one, else the previous one, else nothing.
 *
 * @return array{config: array<string, mixed>|null, source: string, revision: int, hash: string|null}
 */
function blixis_proof_read(): array {
	$row = json_decode( (string) get_option( BLIXIS_PROOF_OPTION, '' ), true );
	if ( is_array( $row ) ) {
		$config = blixis_proof_check_snapshot( $row );
		if ( null !== $config ) {
			return array(
				'config'   => $config,
				'source'   => 'stored',
				'revision' => (int) $row['revision'],
				'hash'     => blixis_config_hash( $config ),
			);
		}
		$previous = blixis_proof_check_snapshot( $row['previous'] ?? null );
		if ( null !== $previous ) {
			return array(
				'config'   => $previous,
				'source'   => 'previous',
				'revision' => (int) $row['revision'],
				'hash'     => blixis_config_hash( $previous ),
			);
		}
	}
	return array(
		'config'   => null,
		'source'   => 'none',
		'revision' => is_array( $row ) ? (int) ( $row['revision'] ?? 0 ) : 0,
		'hash'     => null,
	);
}

/**
 * Validates and stores a config in one row with compare-and-swap.
 * The whole row changes in one UPDATE, so config, hash, and previous can never disagree.
 *
 * @param string   $bytes             Raw JSON.
 * @param int|null $expected_revision Revision the editor loaded; null skips the check.
 * @return array<string, mixed>
 */
function blixis_proof_save( string $bytes, ?int $expected_revision = null ): array {
	global $wpdb;
	$result = blixis_validate_bytes( $bytes );
	if ( ! $result['ok'] ) {
		return array(
			'status' => 'invalid',
			'errors' => $result['errors'],
		);
	}
	$old_raw = blixis_proof_raw_row();
	$old     = null === $old_raw ? null : json_decode( $old_raw, true );
	$current = is_array( $old ) ? (int) ( $old['revision'] ?? 0 ) : 0;
	if ( null !== $expected_revision && $expected_revision !== $current ) {
		return array(
			'status'   => 'conflict',
			'revision' => $current,
		);
	}
	$config = $result['config'];
	$hash   = blixis_config_hash( $config );
	$new    = (string) wp_json_encode(
		array(
			'revision' => $current + 1,
			'hash'     => $hash,
			'config'   => $config,
			'previous' => is_array( $old ) && null !== blixis_proof_check_snapshot( $old )
				? array(
					'hash'   => $old['hash'],
					'config' => $old['config'],
				)
				: null,
		)
	);
	if ( null === $old_raw ) {
		if ( ! add_option( BLIXIS_PROOF_OPTION, $new, '', true ) ) {
			return array( 'status' => 'write_failed' );
		}
	} else {
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- update_option has no compare-and-swap.
		$affected = $wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = %s AND option_value = %s", $new, BLIXIS_PROOF_OPTION, $old_raw ) );
		if ( false === $affected ) {
			return array( 'status' => 'write_failed' );
		}
		if ( 0 === $affected ) {
			return array(
				'status'   => 'conflict',
				'revision' => $current,
			);
		}
		wp_cache_delete( 'alloptions', 'options' );
		wp_cache_delete( BLIXIS_PROOF_OPTION, 'options' );
	}
	blixis_proof_after_change( $hash );
	return array(
		'status'   => 'saved',
		'revision' => $current + 1,
		'hash'     => $hash,
		'cssKey'   => blixis_css_cache_key( $config ),
	);
}

/**
 * Restores the previous config as a new revision.
 *
 * @return array<string, mixed>
 */
function blixis_proof_rollback(): array {
	$row = json_decode( (string) blixis_proof_raw_row(), true );
	if ( ! is_array( $row ) || null === blixis_proof_check_snapshot( $row['previous'] ?? null ) ) {
		return array( 'status' => 'nothing_to_restore' );
	}
	return blixis_proof_save( (string) wp_json_encode( $row['previous']['config'] ), (int) $row['revision'] );
}

/**
 * Invalidates what depends on the config and records an audit event.
 *
 * @param string $hash New config hash.
 * @return void
 */
function blixis_proof_after_change( string $hash ): void {
	wp_clean_theme_json_cache();
	do_action( 'blixis_tokens_changed', $hash, get_current_user_id() );
}

add_filter(
	'wp_theme_json_data_theme',
	static function ( $theme_json ) {
		$active = blixis_proof_read();
		if ( null === $active['config'] || get_stylesheet() !== $active['config']['theme']['slug'] ) {
			return $theme_json;
		}
		return $theme_json->update_with( blixis_generate_theme_json( $active['config'] ) );
	}
);

add_action(
	'wp_enqueue_scripts',
	static function (): void {
		$active = blixis_proof_read();
		if ( null === $active['config'] || get_stylesheet() !== $active['config']['theme']['slug'] ) {
			return;
		}
		wp_register_style( 'blixis-tokens', false, array(), $active['hash'] );
		wp_enqueue_style( 'blixis-tokens' );
		wp_add_inline_style( 'blixis-tokens', blixis_generate_css( $active['config'] ) );
	}
);

/**
 * Enqueues the stand-in editor bundle. Hooked for admin only.
 *
 * @return void
 */
function blixis_proof_enqueue_editor(): void {
	wp_enqueue_script( 'blixis-editor', 'data:text/javascript,', array( 'react', 'react-dom', 'wp-element' ), '0', true );
}
add_action( 'admin_enqueue_scripts', 'blixis_proof_enqueue_editor' );

add_action(
	'init',
	static function (): void {
		register_post_meta(
			'page',
			BLIXIS_PROOF_META,
			array(
				'single'       => true,
				'type'         => 'string',
				'show_in_rest' => false,
				'auth_callback' => static fn( $allowed, $key, $post_id ) => current_user_can( 'edit_post', $post_id ),
			)
		);
		add_shortcode( 'blixis_proof_probe', static fn(): string => 'SHORTCODE_EXECUTED' );
	}
);

/**
 * Resolves an attachment for the renderer.
 *
 * @param int $id Attachment ID.
 * @return array{url: string, width: int, height: int}|null
 */
function blixis_proof_media( int $id ): ?array {
	$src = wp_get_attachment_image_src( $id, 'full' );
	if ( ! $src ) {
		return null;
	}
	return array(
		'url'    => $src[0],
		'width'  => (int) $src[1],
		'height' => (int) $src[2],
	);
}

/**
 * Renders the stored proof nodes of a post. Never changes the stored value.
 *
 * @param int                 $post_id     Post.
 * @param array<string,mixed> $diagnostics Out: diagnostics by node ID.
 * @return string|null
 */
function blixis_proof_render_post( int $post_id, array &$diagnostics = array() ): ?string {
	$raw = get_post_meta( $post_id, BLIXIS_PROOF_META, true );
	if ( '' === $raw ) {
		return null;
	}
	$nodes = json_decode( (string) $raw, true );
	$html  = '';
	foreach ( is_array( $nodes ) ? $nodes : array() as $node ) {
		$found                                 = array();
		$html                                 .= blixis_render_node( is_array( $node ) ? $node : array(), 'blixis_proof_media', $found );
		$diagnostics[ (string) ( $node['id'] ?? '' ) ] = $found;
	}
	return $html;
}

// Runs after every core content filter. A body rendered earlier would have its text
// texturized and its shortcodes executed; see wp/test.php.
add_filter(
	'the_content',
	static function ( string $content ): string {
		$post_id = get_the_ID();
		if ( ! $post_id ) {
			return $content;
		}
		// Core replaced the body with the password form by now; a late replacement would undo that.
		// The option exists only so wp/test.php can prove the leak with the guard removed.
		if ( post_password_required( $post_id ) && ! get_option( 'blixis_proof_unsafe_no_password_guard' ) ) {
			return $content;
		}
		$html = blixis_proof_render_post( (int) $post_id );
		return $html ?? $content;
	},
	PHP_INT_MAX
);

add_action(
	'rest_api_init',
	static function (): void {
		$can_manage = static fn(): bool => current_user_can( 'edit_theme_options' );
		register_rest_route(
			'blixis-proof/v1',
			'/tokens',
			array(
				array(
					'methods'             => 'POST',
					'permission_callback' => $can_manage,
					'callback'            => static function ( WP_REST_Request $request ) {
						$match    = $request->get_header( 'if-match' );
						$revision = null === $match ? null : (int) $match;
						$result   = blixis_proof_save( $request->get_body(), $revision );
						$status   = array(
							'saved'        => 200,
							'invalid'      => 422,
							'conflict'     => 409,
							'write_failed' => 500,
						);
						return new WP_REST_Response( $result, $status[ $result['status'] ] );
					},
				),
				array(
					'methods'             => 'GET',
					'permission_callback' => $can_manage,
					'callback'            => static function () {
						$active = blixis_proof_read();
						return new WP_REST_Response(
							array(
								'config'   => $active['config'],
								'hash'     => $active['hash'],
								'revision' => $active['revision'],
								'source'   => $active['source'],
							)
						);
					},
				),
			)
		);
		register_rest_route(
			'blixis-proof/v1',
			'/diagnostics/(?P<id>\d+)',
			array(
				'methods'             => 'GET',
				'permission_callback' => static fn( WP_REST_Request $request ): bool => current_user_can( 'edit_post', (int) $request['id'] ),
				'callback'            => static function ( WP_REST_Request $request ) {
					$found = array();
					blixis_proof_render_post( (int) $request['id'], $found );
					return new WP_REST_Response( $found );
				},
			)
		);
	}
);
