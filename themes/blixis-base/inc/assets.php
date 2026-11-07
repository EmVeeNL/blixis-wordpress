<?php
/**
 * Front-end asset loading.
 *
 * @package Blixis_Base
 */

declare(strict_types=1);

namespace Blixis\Base;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Enqueue the parent stylesheet from the parent directory, so child themes
 * can depend on the `blixis-base` handle. Compiled utilities arrive with the
 * build pipeline (task 02-02) and are not loaded here.
 */
function enqueue_assets(): void {
	$version = wp_get_theme( 'blixis-base' )->get( 'Version' );

	wp_enqueue_style(
		'blixis-base',
		get_template_directory_uri() . '/style.css',
		array(),
		is_string( $version ) ? $version : null
	);
}
add_action( 'wp_enqueue_scripts', __NAMESPACE__ . '\enqueue_assets' );
