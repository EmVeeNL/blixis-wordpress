<?php
/**
 * The single production generator for CSS and theme.json data. Throwaway proof for task 01-05.
 * Takes only configs returned by blixis_validate_bytes(); never concatenates raw input.
 */

declare(strict_types=1);

/**
 * Sorts keys recursively.
 *
 * @param mixed $value Value.
 * @return mixed
 */
function blixis_canonicalize( $value ) {
	if ( is_array( $value ) ) {
		if ( array_is_list( $value ) ) {
			return array_map( 'blixis_canonicalize', $value );
		}
		ksort( $value, SORT_STRING );
		return array_map( 'blixis_canonicalize', $value );
	}
	return $value;
}

/**
 * Canonical JSON with the same bytes as JSON.stringify on sorted keys.
 *
 * @param mixed $value Value.
 * @return string
 */
function blixis_canonical_json( $value ): string {
	// phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- wp_json_encode is unavailable outside WordPress.
	return (string) json_encode( blixis_canonicalize( $value ), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR );
}

/**
 * Short content hash of a normalized config.
 *
 * @param array<string, mixed> $config Normalized config.
 * @return string
 */
function blixis_config_hash( array $config ): string {
	return substr( hash( 'sha256', blixis_canonical_json( $config ) ), 0, 16 );
}

/**
 * Builds a font stack from a validated family.
 *
 * @param string $key    Font role.
 * @param string $family Family name.
 * @return string
 */
function blixis_font_stack( string $key, string $family ): string {
	$map = blixis_token_map();
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
function blixis_css_variables( array $config ): array {
	$out = array();
	foreach ( blixis_token_map()['sections'] as $section ) {
		if ( ! empty( $section['buildOnly'] ) ) {
			continue;
		}
		foreach ( $section['tokens'] as $key => $name ) {
			$value        = $config[ $section['section'] ][ $key ];
			$out[ $name ] = 'font' === $section['kind'] ? blixis_font_stack( (string) $key, $value ) : $value;
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
function blixis_generate_css( array $config ): string {
	$map   = blixis_token_map();
	$lines = array(
		'/* Blixis tokens: contract ' . $map['contractVersion'] . ', generator ' . $map['generatorVersion'] . ', config ' . blixis_config_hash( $config ) . ' */',
		':root {',
	);
	foreach ( blixis_css_variables( $config ) as $name => $value ) {
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
 * Builds preset entries.
 *
 * @param array<string|int, string> $values Section values.
 * @param callable                  $build  Returns entry fields.
 * @return array<int, array<string, mixed>>
 */
function blixis_presets( array $values, callable $build ): array {
	$out = array();
	foreach ( $values as $slug => $value ) {
		$slug  = (string) $slug;
		$out[] = array_merge(
			array(
				'slug' => $slug,
				'name' => ucfirst( $slug ),
			),
			$build( $slug, $value )
		);
	}
	return $out;
}

/**
 * Generates theme.json data merged through wp_theme_json_data_theme.
 *
 * @param array<string, mixed> $config Normalized config.
 * @return array<string, mixed>
 */
function blixis_generate_theme_json( array $config ): array {
	return array(
		'version'  => 3,
		'settings' => array(
			'color'      => array(
				'defaultPalette' => false,
				'palette'        => blixis_presets( $config['colors'], static fn( $s, $v ) => array( 'color' => $v ) ),
			),
			'typography' => array(
				'defaultFontSizes' => false,
				'fontFamilies'     => blixis_presets( $config['fonts'], static fn( $s, $v ) => array( 'fontFamily' => blixis_font_stack( $s, $v ) ) ),
				// fluid: false is required. WordPress otherwise rewrites the size to clamp() and parity with --blixis-text-* is lost.
				'fontSizes'        => blixis_presets(
					$config['typeScale'],
					static fn( $s, $v ) => array(
						'size'  => $v,
						'fluid' => false,
					)
				),
			),
			'spacing'    => array(
				'defaultSpacingSizes' => false,
				'spacingSizes'        => blixis_presets( $config['spacing'], static fn( $s, $v ) => array( 'size' => $v ) ),
			),
			'border'     => array(
				'radiusSizes' => blixis_presets( $config['radius'], static fn( $s, $v ) => array( 'size' => $v ) ),
			),
			'shadow'     => array(
				'defaultPresets' => false,
				'presets'        => blixis_presets( $config['shadows'], static fn( $s, $v ) => array( 'shadow' => $v ) ),
			),
			'layout'     => array(
				'contentSize' => $config['layout']['contentWidth'],
				'wideSize'    => $config['layout']['wideWidth'],
			),
			'custom'     => array(
				'blixis' => array(
					'layout' => array( 'gutter' => $config['layout']['gutter'] ),
					'motion' => array(
						'durationFast' => $config['motion']['durationFast'],
						'durationBase' => $config['motion']['durationBase'],
						'durationSlow' => $config['motion']['durationSlow'],
						'easing'       => $config['motion']['easing'],
					),
				),
			),
		),
		'styles'   => array(
			'color' => array(
				'background' => 'var:preset|color|surface',
				'text'       => 'var:preset|color|foreground',
			),
		),
	);
}

/**
 * Cache key of the generated stylesheet.
 *
 * @param array<string, mixed> $config Normalized config.
 * @return string
 */
function blixis_css_cache_key( array $config ): string {
	$map = blixis_token_map();
	return 'blixis:css:c' . $map['contractVersion'] . ':g' . $map['generatorVersion'] . ':' . blixis_config_hash( $config );
}

/**
 * Cache key of a rendered document fragment. Null means never cache.
 *
 * @param array<string, mixed> $input Key inputs.
 * @return string|null
 */
function blixis_fragment_cache_key( array $input ): ?string {
	if ( 'publish' !== $input['status'] || $input['hasPassword'] ) {
		return null;
	}
	return 'blixis:html:p' . $input['postId'] . ':d' . $input['documentHash'] . ':v' . $input['rendererVersion'] . ':' . $input['registryHash'];
}

/**
 * Cache key of a full public page. Null means never cache.
 *
 * @param array<string, mixed> $input Key inputs.
 * @return string|null
 */
function blixis_page_cache_key( array $input ): ?string {
	$fragment = blixis_fragment_cache_key( $input );
	return null === $fragment ? null : str_replace( 'blixis:html:', 'blixis:page:', $fragment ) . ':' . $input['configHash'];
}
