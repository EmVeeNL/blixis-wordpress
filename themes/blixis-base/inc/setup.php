<?php
/**
 * Theme setup and supports.
 *
 * @package Blixis_Base
 */

declare(strict_types=1);

namespace Blixis\Base;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Register translations and theme supports. Branding and tokens stay in child themes.
 */
function setup(): void {
	load_theme_textdomain( 'blixis-base', get_template_directory() . '/languages' );

	add_theme_support( 'wp-block-styles' );
	add_theme_support( 'responsive-embeds' );
	add_theme_support( 'editor-styles' );
	add_editor_style( 'style.css' );

	// Editor parity is limited to the compiled utilities. Token-driven editor
	// styles belong to task 02-03. A missing build is reported on the front end.
	if ( null !== get_tailwind_asset() ) {
		add_editor_style( TAILWIND_ASSET );
	}
}
add_action( 'after_setup_theme', __NAMESPACE__ . '\setup' );
