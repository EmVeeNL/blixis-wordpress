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
 * Theme-relative path of the committed Tailwind build (task 02-02).
 */
const TAILWIND_ASSET = 'assets/build/tailwind.css';

/**
 * Describe the compiled Tailwind stylesheet in the parent theme.
 *
 * The file is always resolved from the parent theme directory, so an active
 * child theme inherits it and cannot shadow it by accident.
 *
 * @return array{path: string, url: string, version: string}|null Null when the file is missing or unreadable.
 */
function get_tailwind_asset(): ?array {
	static $cache = null;

	if ( null !== $cache ) {
		return array() === $cache ? null : $cache;
	}

	$path = get_template_directory() . '/' . TAILWIND_ASSET;
	$hash = is_readable( $path ) ? md5_file( $path ) : false;

	if ( false === $hash ) {
		$cache = array();
		return null;
	}

	$cache = array(
		'path'    => $path,
		'url'     => get_template_directory_uri() . '/' . TAILWIND_ASSET,
		// Content hash: stable across deploys of an identical committed build, changes with any rebuild.
		'version' => substr( $hash, 0, 12 ),
	);

	return $cache;
}

/**
 * Report a missing compiled stylesheet. Production logs and keeps serving the
 * page; any other environment stops with a visible error so a skipped build
 * cannot pass unnoticed.
 */
function report_missing_tailwind_asset(): void {
	$message = sprintf(
		'Blixis Base: compiled stylesheet %s is missing. Run the Tailwind build.',
		TAILWIND_ASSET
	);

	if ( 'production' === wp_get_environment_type() ) {
		// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Production must not break the page; log only.
		error_log( $message );
		return;
	}

	wp_die( esc_html( $message ), esc_html__( 'Missing build asset', 'blixis-base' ), array( 'response' => 500 ) );
}

/**
 * Enqueue the parent stylesheet from the parent directory, so child themes
 * can depend on the `blixis-base` handle, then the compiled Tailwind utilities.
 * Utilities are unlayered and load after WordPress global styles so they win
 * on equal specificity.
 */
function enqueue_assets(): void {
	$version = wp_get_theme( 'blixis-base' )->get( 'Version' );

	wp_enqueue_style(
		'blixis-base',
		get_template_directory_uri() . '/style.css',
		array(),
		is_string( $version ) ? $version : null
	);

	$tailwind = get_tailwind_asset();
	if ( null === $tailwind ) {
		report_missing_tailwind_asset();
		return;
	}

	// Global styles are enqueued at priority 10, so this runs after them. Only
	// depend on the handle when it exists: an unregistered dependency would
	// make WordPress silently drop this stylesheet.
	$deps = array( 'blixis-base' );
	if ( wp_style_is( 'global-styles', 'registered' ) ) {
		$deps[] = 'global-styles';
	}

	wp_enqueue_style( 'blixis-base-tailwind', $tailwind['url'], $deps, $tailwind['version'] );
}
add_action( 'wp_enqueue_scripts', __NAMESPACE__ . '\enqueue_assets', 20 );
