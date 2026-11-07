<?php
/**
 * Plugin Name: Blixis 02-04 proof helpers (test only, never shipped)
 *
 * - ?t0204_front=1 shows a static front page (page 5003) instead of the posts index.
 * - ?t0204_locale=nl_NL|ar switches the request locale (packs are installed by run-wp.sh).
 * - Sends X-T0204-Expected-Skip: the core translation of "Skip to content" in the active locale,
 *   so the browser can compare the rendered skip link with what WordPress itself translates.
 */

declare(strict_types=1);

// phpcs:disable WordPress.Security.NonceVerification, WordPress.Security.ValidatedSanitizedInput
if ( isset( $_GET['t0204_front'] ) ) {
	add_filter( 'pre_option_show_on_front', static fn() => 'page' );
	add_filter( 'pre_option_page_on_front', static fn() => 5003 );
}

if ( isset( $_GET['t0204_locale'] ) && in_array( $_GET['t0204_locale'], array( 'nl_NL', 'ar' ), true ) ) {
	$t0204_locale = (string) $_GET['t0204_locale'];
	add_filter( 'locale', static fn() => $t0204_locale );
}

add_action(
	'send_headers',
	static function (): void {
		// Core's own string, core's text domain.
		header( 'X-T0204-Expected-Skip: ' . rawurlencode( __( 'Skip to content' ) ) ); // phpcs:ignore WordPress.WP.I18n.MissingArgDomain
		header( 'X-T0204-Locale: ' . get_locale() );
	}
);
