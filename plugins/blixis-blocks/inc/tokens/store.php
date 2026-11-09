<?php
/**
 * Stored BlixisThemeConfig (tasks 03-03 and 03-05).
 *
 * One autoloaded option, blixis_theme_config, holds JSON: revision, hash, config,
 * previous. Writes use a compare-and-swap UPDATE on the exact stored bytes, so two
 * writers cannot silently overwrite each other. Reads revalidate and check the hash.
 *
 * This file stores configuration only. Applying it to a site (theme.json data, the
 * token stylesheet, cache invalidation) and rollback belong to task 03-05.
 *
 * @package Blixis\Blocks
 */

declare(strict_types=1);

namespace Blixis\Blocks\Tokens;

use WP_Error;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const STORE_OPTION = 'blixis_theme_config';

/**
 * Raw stored bytes, read past every cache.
 *
 * @return string|null Null when nothing is stored.
 */
function store_raw(): ?string {
	global $wpdb;
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Compare-and-swap needs the exact stored bytes.
	$value = $wpdb->get_var( $wpdb->prepare( "SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", STORE_OPTION ) );
	return is_string( $value ) ? $value : null;
}

/**
 * The stored record, revalidated.
 *
 * @return array{revision: int, hash: string, config: array<string, mixed>, previous: array<string, mixed>|null}|null
 *         Null when nothing valid is stored.
 */
function store_read(): ?array {
	$raw = store_raw();
	if ( null === $raw ) {
		return null;
	}
	$record = json_decode( $raw, true, 64 );
	if ( ! is_array( $record ) || ! is_int( $record['revision'] ?? null ) || ! is_array( $record['config'] ?? null ) ) {
		return null;
	}
	$checked = validate_bytes( canonical_json( $record['config'] ) );
	if ( ! $checked['ok'] || config_hash( $checked['config'] ) !== ( $record['hash'] ?? '' ) ) {
		return null;
	}
	return array(
		'revision' => $record['revision'],
		'hash'     => (string) $record['hash'],
		'config'   => $checked['config'],
		'previous' => is_array( $record['previous'] ?? null ) ? $record['previous'] : null,
	);
}

/**
 * Store a config if the stored revision is still the one the caller read.
 *
 * @param string $bytes             Raw config JSON; validated here.
 * @param int    $expected_revision Revision the caller started from; 0 when nothing was stored.
 * @return array{revision: int, hash: string}|WP_Error
 */
function store_write( string $bytes, int $expected_revision ): array|WP_Error {
	global $wpdb;

	$checked = validate_bytes( $bytes );
	if ( ! $checked['ok'] ) {
		return new WP_Error(
			'blixis_config_invalid',
			__( 'The configuration is invalid.', 'blixis-blocks' ),
			array(
				'status' => 400,
				'errors' => $checked['errors'],
			)
		);
	}
	$config = $checked['config'];
	$raw    = store_raw();
	$old    = null === $raw ? null : json_decode( $raw, true, 64 );
	$stored = is_array( $old ) && is_int( $old['revision'] ?? null ) ? $old['revision'] : 0;

	if ( $stored !== $expected_revision ) {
		return new WP_Error( 'blixis_config_conflict', __( 'The configuration was changed elsewhere. Review the current values and save again.', 'blixis-blocks' ), array( 'status' => 409 ) );
	}

	$record = array(
		'revision' => $stored + 1,
		'hash'     => config_hash( $config ),
		'config'   => $config,
		'previous' => is_array( $old ) && is_array( $old['config'] ?? null ) ? $old['config'] : null,
	);
	$json   = canonical_json( $record );

	if ( null === $raw ) {
		// add_option fails when another writer created the row first.
		$ok = add_option( STORE_OPTION, $json, '', true );
	} else {
		// Compare a hash of the bytes: `=` on the column ignores case under its collation.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- Compare-and-swap on the exact bytes read above.
		$ok = 1 === $wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = %s AND SHA2(option_value, 256) = %s", $json, STORE_OPTION, hash( 'sha256', $raw ) ) );
	}
	wp_cache_delete( STORE_OPTION, 'options' );
	wp_cache_delete( 'alloptions', 'options' );

	if ( ! $ok ) {
		return new WP_Error( 'blixis_config_conflict', __( 'The configuration was changed elsewhere. Review the current values and save again.', 'blixis-blocks' ), array( 'status' => 409 ) );
	}
	/**
	 * Fires after a configuration was stored. Task 03-05 clears caches here.
	 *
	 * @param int    $revision New revision.
	 * @param string $hash     Config hash.
	 */
	do_action( 'blixis_tokens_saved', $record['revision'], $record['hash'] );
	return array(
		'revision' => $record['revision'],
		'hash'     => $record['hash'],
	);
}
