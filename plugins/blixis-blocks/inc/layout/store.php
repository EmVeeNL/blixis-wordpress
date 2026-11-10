<?php
/**
 * Stored BlixisLayoutConfig (task 03-07 Part A).
 *
 * One autoloaded option, blixis_layout_config, holds JSON: revision, hash, config, previous.
 * It works like the token store (inc/tokens/store.php): a write is one compare-and-swap UPDATE
 * on the exact stored bytes, a read revalidates and checks the hash, and a rollback writes the
 * previous config as a new revision.
 *
 * This file stores configuration only. It renders nothing; Base reads the stored config in a
 * later step (docs/development/LAYOUT.md). Writing needs the edit_theme_options capability,
 * which the REST routes and wizard handlers that call these functions must check first
 * (can_manage()). Nothing here is public, and no draft is read by a visitor.
 *
 * @package Blixis\Blocks
 */

declare(strict_types=1);

namespace Blixis\Blocks\Layout;

use WP_Error;

use function Blixis\Blocks\Tokens\canonical_json;
use function Blixis\Blocks\Tokens\config_hash;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

require_once __DIR__ . '/validate.php';
require_once __DIR__ . '/../tokens/css.php';

const STORE_OPTION = 'blixis_layout_config';

/**
 * Whether the current user may change the layout configuration.
 *
 * @return bool
 */
function can_manage(): bool {
	return current_user_can( 'edit_theme_options' );
}

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
	// A stored older config is read under its own rules and migrated (the contract has one
	// version so far). The stored hash belongs to the config as written, so it is checked at the
	// stored version; the returned hash belongs to the migrated config.
	$checked = validate_bytes( canonical_json( $record['config'] ) );
	if ( ! $checked['ok'] ) {
		return null;
	}
	$as_stored                  = $checked['config'];
	$as_stored['schemaVersion'] = $record['config']['schemaVersion'];
	if ( config_hash( $as_stored ) !== ( $record['hash'] ?? '' ) ) {
		return null;
	}
	return array(
		'revision' => $record['revision'],
		'hash'     => config_hash( $checked['config'] ),
		'config'   => $checked['config'],
		'previous' => is_array( $record['previous'] ?? null ) ? $record['previous'] : null,
	);
}

/**
 * The previous config of a stored row whose current config does not validate.
 *
 * Callers that apply a config fall back to this, then to Base's plain parts.
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
			'blixis_layout_invalid',
			__( 'The layout configuration is invalid.', 'blixis-blocks' ),
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
		return conflict();
	}

	// The replaced config is kept as the rollback target, migrated when it is valid, so a save
	// leaves no older schema version behind. A row that no longer validates is kept as it is.
	$previous = null;
	if ( is_array( $old ) && is_array( $old['config'] ?? null ) ) {
		$migrated = validate_bytes( canonical_json( $old['config'] ) );
		$previous = $migrated['ok'] ? $migrated['config'] : $old['config'];
	}
	$record = array(
		'revision' => $stored + 1,
		'hash'     => config_hash( $config ),
		'config'   => $config,
		'previous' => $previous,
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
		return conflict();
	}
	/**
	 * Fires after a layout configuration was stored. Page caches should purge here once Base
	 * renders the configuration.
	 *
	 * @param int    $revision New revision.
	 * @param string $hash     Config hash.
	 */
	do_action( 'blixis_layout_saved', $record['revision'], $record['hash'] );
	return array(
		'revision' => $record['revision'],
		'hash'     => $record['hash'],
	);
}

/**
 * Roll back to the previous configuration, as a new revision.
 *
 * The replaced config becomes the new previous, so a rollback can be undone.
 *
 * @param int $expected_revision Revision the caller is looking at.
 * @return array{revision: int, hash: string}|WP_Error
 */
function store_rollback( int $expected_revision ): array|WP_Error {
	$stored = store_read();
	if ( ! $stored || ! is_array( $stored['previous'] ) ) {
		return new WP_Error( 'blixis_layout_no_previous', __( 'There is no previous layout configuration to roll back to.', 'blixis-blocks' ), array( 'status' => 409 ) );
	}
	return store_write( canonical_json( $stored['previous'] ), $expected_revision );
}

/**
 * The error for a write that lost a race.
 *
 * @return WP_Error
 */
function conflict(): WP_Error {
	return new WP_Error( 'blixis_layout_conflict', __( 'The layout configuration was changed elsewhere. Review the current values and save again.', 'blixis-blocks' ), array( 'status' => 409 ) );
}
