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
 * @param bool                 $dark   Use the dark palette for the colours, when the config has one.
 * @return array<string, string>
 */
function css_variables( array $config, bool $dark = false ): array {
	$out = array();
	foreach ( token_map()['sections'] as $section ) {
		if ( ! empty( $section['buildOnly'] ) ) {
			continue;
		}
		$source = 'colors' === $section['section'] && $dark && isset( $config['colorsDark'] ) ? 'colorsDark' : $section['section'];
		foreach ( $section['tokens'] as $key => $name ) {
			$value        = $config[ $source ][ $key ];
			$out[ $name ] = 'font' === $section['kind'] ? font_stack( (string) $key, $value ) : $value;
		}
	}
	return $out;
}

/**
 * Only the colour custom properties of a palette.
 *
 * @param array<string, mixed> $config Normalized config.
 * @param bool                 $dark   Dark palette.
 * @return array<string, string>
 */
function color_variables( array $config, bool $dark ): array {
	$out = array();
	foreach ( token_map()['sections'] as $section ) {
		if ( 'colors' !== $section['section'] ) {
			continue;
		}
		foreach ( $section['tokens'] as $key => $name ) {
			$out[ $name ] = $config[ $dark && isset( $config['colorsDark'] ) ? 'colorsDark' : 'colors' ][ $key ];
		}
	}
	return $out;
}

/**
 * Normalizes a colour scheme setting; anything unknown is the default.
 *
 * @param mixed $scheme Candidate.
 * @return string system, light, or dark.
 */
function normalize_scheme( $scheme ): string {
	$setting = token_map()['colorScheme'];
	return is_string( $scheme ) && in_array( $scheme, $setting['values'], true ) ? $scheme : $setting['default'];
}

/**
 * Generates the token stylesheet.
 *
 * Without a dark palette the scheme setting changes nothing. With one, "system" follows
 * the visitor's prefers-color-scheme, "light" ignores the dark palette, and "dark"
 * always uses it.
 *
 * @param array<string, mixed> $config Normalized config.
 * @param string               $scheme system, light, or dark.
 * @return string
 */
function generate_css( array $config, string $scheme = 'system' ): string {
	$map      = token_map();
	$scheme   = normalize_scheme( $scheme );
	$has_dark = isset( $config['colorsDark'] );
	$lines    = array(
		'/* Blixis tokens: contract ' . $map['contractVersion'] . ', generator ' . $map['generatorVersion'] . ', config ' . config_hash( $config ) . ' */',
		':root {',
	);
	foreach ( css_variables( $config, $has_dark && 'dark' === $scheme ) as $name => $value ) {
		$lines[] = '  ' . $name . ': ' . $value . ';';
	}
	if ( $has_dark ) {
		$lines[] = '  color-scheme: ' . ( 'system' === $scheme ? 'light dark' : $scheme ) . ';';
	}
	$lines[] = '}';
	if ( $has_dark && 'system' === $scheme ) {
		$lines[] = '@media (prefers-color-scheme: dark) {';
		$lines[] = '  :root {';
		foreach ( color_variables( $config, true ) as $name => $value ) {
			$lines[] = '    ' . $name . ': ' . $value . ';';
		}
		$lines[] = '  }';
		$lines[] = '}';
	}
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
 * The colour scheme setting is part of the key only when it changes the output.
 *
 * @param array<string, mixed> $config Normalized config.
 * @param string               $scheme system, light, or dark.
 * @return string
 */
function css_cache_key( array $config, string $scheme = 'system' ): string {
	$map    = token_map();
	$scheme = normalize_scheme( $scheme );
	$key    = 'blixis:css:c' . $map['contractVersion'] . ':g' . $map['generatorVersion'] . ':' . config_hash( $config );
	return isset( $config['colorsDark'] ) && 'system' !== $scheme ? $key . ':s' . $scheme : $key;
}
