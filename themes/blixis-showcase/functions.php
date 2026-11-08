<?php
/**
 * Blixis Showcase child theme bootstrap.
 *
 * @package Blixis_Showcase
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Load the optional showcase styles after Blixis Base.
 */
function blixis_showcase_enqueue_styles(): void {
	$path    = get_stylesheet_directory() . '/style.css';
	$version = is_readable( $path ) ? (string) filemtime( $path ) : (string) wp_get_theme()->get( 'Version' );

	wp_enqueue_style(
		'blixis-showcase',
		get_stylesheet_uri(),
		array( 'blixis-base' ),
		$version
	);
}
add_action( 'wp_enqueue_scripts', 'blixis_showcase_enqueue_styles', 30 );
