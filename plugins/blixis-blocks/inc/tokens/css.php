<?php
/**
 * Token stylesheet generator (task 03-02).
 *
 * The single production generator for the --blixis-* custom properties. Takes only
 * configs returned by validate_bytes(); never concatenates raw input. theme.json
 * data comes from theme-json.php.
 *
 * @package Blixis\Blocks
 */

declare(strict_types=1);

namespace Blixis\Blocks\Tokens;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Sorts keys recursively.
 *
 * @param mixed $value Value.
 * @return mixed
 */
function canonicalize( $value ) {
	if ( is_array( $value ) ) {
		if ( array_is_list( $value ) ) {
			return array_map( __NAMESPACE__ . '\\canonicalize', $value );
		}
		ksort( $value, SORT_STRING );
		return array_map( __NAMESPACE__ . '\\canonicalize', $value );
	}
	return $value;
}

/**
 * Canonical JSON with the same bytes as JSON.stringify on sorted keys.
 *
 * @param mixed $value Value.
 * @return string
 */
function canonical_json( $value ): string {
	// phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- output must match the TypeScript bytes, which wp_json_encode does not guarantee.
	return (string) json_encode( canonicalize( $value ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR );
}

/**
 * Short content hash of a normalized config.
 *
 * @param array<string, mixed> $config Normalized config.
 * @return string
 */
function config_hash( array $config ): string {
	return substr( hash( 'sha256', canonical_json( $config ) ), 0, 16 );
}

/**
 * Builds a font stack from a validated family.
 *
 * @param string $key    Font role.
 * @param string $family Family name.
 * @return string
 */
function font_stack( string $key, string $family ): string {
	$map = token_map();
	if ( in_array( $family, $map['fontGenerics'], true ) ) {
		return $family;
	}
	return '"' . $family . '", ' . ( $map['fontFallbacks'][ $key ] ?? 'sans-serif' );
}

/**
 * Maps a normalized config to CSS custom properties.
 *
 * @param array<string, mixed> $config Normalized config.
 * @return array<string, string>
 */
function css_variables( array $config ): array {
	$out = array();
	foreach ( token_map()['sections'] as $section ) {
		if ( ! empty( $section['buildOnly'] ) ) {
			continue;
		}
		foreach ( $section['tokens'] as $key => $name ) {
			$value        = $config[ $section['section'] ][ $key ];
			$out[ $name ] = 'font' === $section['kind'] ? font_stack( (string) $key, $value ) : $value;
		}
	}
	return $out;
}

/**
 * Generates the token stylesheet.
 *
 * @param array<string, mixed> $config Normalized config.
 * @return string
 */
function generate_css( array $config ): string {
	$map   = token_map();
	$lines = array(
		'/* Blixis tokens: contract ' . $map['contractVersion'] . ', generator ' . $map['generatorVersion'] . ', config ' . config_hash( $config ) . ' */',
		':root {',
	);
	foreach ( css_variables( $config ) as $name => $value ) {
		$lines[] = '  ' . $name . ': ' . $value . ';';
	}
	$lines[] = '}';
	$lines[] = '@media (prefers-reduced-motion: reduce) {';
	$lines[] = '  :root {';
	foreach ( $map['sections'] as $section ) {
		if ( 'motion' !== $section['section'] ) {
			continue;
		}
		foreach ( $section['tokens'] as $key => $name ) {
			if ( 'easing' !== $key ) {
				$lines[] = '    ' . $name . ': 0ms;';
			}
		}
	}
	$lines[] = '  }';
	$lines[] = '}';
	$lines[] = '';
	return implode( "\n", $lines );
}

/**
 * Cache key of the generated stylesheet.
 *
 * @param array<string, mixed> $config Normalized config.
 * @return string
 */
function css_cache_key( array $config ): string {
	$map = token_map();
	return 'blixis:css:c' . $map['contractVersion'] . ':g' . $map['generatorVersion'] . ':' . config_hash( $config );
}
