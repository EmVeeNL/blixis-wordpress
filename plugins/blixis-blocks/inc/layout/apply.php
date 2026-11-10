<?php
/** Apply the active child theme's validated layout settings. */

declare(strict_types=1);

namespace Blixis\Blocks\Layout;

use function Blixis\Blocks\Tokens\canonical_json;
use function Blixis\Blocks\Tokens\is_preview;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Return the current user's validated preview draft or the active theme's stored layout.
 *
 * @return array<string, mixed>|null
 */
function effective_config( bool $reset = false ): ?array {
	static $cache = null;
	if ( $reset ) {
		$cache = null;
		return null;
	}
	if ( null !== $cache ) {
		return false === $cache ? null : $cache;
	}
	if ( is_preview() ) {
		// The preview nonce and capability are checked before this user's draft is read.
		if ( function_exists( '\Blixis\\Blocks\\Setup\\draft' ) ) {
			$draft  = \Blixis\Blocks\Setup\draft( get_current_user_id() );
			$layout = $draft['layout'] ?? null;
			if ( is_array( $layout ) ) {
				$checked = validate_bytes( canonical_json( $layout ) );
				if ( $checked['ok'] ) {
					$cache = $checked['config'];
					return $cache;
				}
			}
		}
	}
	$stored = store_read();
	$config = $stored ? $stored['config'] : null;
	if ( null === $config || ( $config['theme']['slug'] ?? '' ) !== get_stylesheet() ) {
		$cache = false;
		return null;
	}
	$cache = $config;
	return $cache;
}

add_action(
	'blixis_layout_saved',
	static function ( int $revision, string $hash ): void {
		effective_config( true );
		do_action( 'blixis_layout_changed', $revision, $hash );
	},
	10,
	2
);
