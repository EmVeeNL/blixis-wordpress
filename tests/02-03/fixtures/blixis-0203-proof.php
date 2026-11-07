<?php
/**
 * Plugin Name: Blixis 02-03 proof filter (test only, never shipped)
 *
 * Models how a later persistence layer (task 03-05) would hand a validated config to the
 * production generator. It reads a normalized config from the option `t0203_config`,
 * applies it only when theme.slug is the active stylesheet, and fails closed: if the
 * generator is absent or refuses the input, the theme data is returned unchanged.
 */

declare(strict_types=1);

add_filter(
	'wp_theme_json_data_theme',
	static function ( $data ) {
		$raw = get_option( 't0203_config' );
		if ( ! is_string( $raw ) ) {
			return $data;
		}
		$config = json_decode( $raw, true );
		if ( ! is_array( $config ) || ( $config['theme']['slug'] ?? null ) !== get_stylesheet() ) {
			return $data;
		}
		$fn = 'Blixis\\Blocks\\Tokens\\theme_json_from_validated_config';
		if ( ! function_exists( $fn ) ) {
			return $data;
		}
		try {
			$generated = $fn( $config );
		} catch ( \Throwable $e ) {
			return $data;
		}
		return is_array( $generated ) && array() !== $generated ? $data->update_with( $generated ) : $data;
	},
	10
);
