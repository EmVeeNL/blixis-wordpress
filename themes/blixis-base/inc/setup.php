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
}
add_action( 'after_setup_theme', __NAMESPACE__ . '\setup' );
