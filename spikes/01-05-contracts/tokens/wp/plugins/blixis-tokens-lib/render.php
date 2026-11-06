<?php
/**
 * Allowlist element renderer. Throwaway proof for task 01-05.
 * resolve functions are pure and also load outside WordPress. blixis_render_node() needs
 * the real esc_html, esc_attr, esc_url, and wp_kses, so it only runs inside WordPress.
 */

declare(strict_types=1);

/**
 * Returns the element registry.
 *
 * @return array<mixed>
 */
function blixis_registry(): array {
	static $registry = null;
	if ( null === $registry ) {
		$registry = blixis_contract_json( 'renderer/registry.json' );
	}
	return $registry;
}

/**
 * Mobile-first resolution: each breakpoint takes its own override, else the nearest lower value.
 *
 * @param string|null           $base      Base value.
 * @param array<string, string> $overrides Overrides by breakpoint.
 * @return array<string, string|null>
 */
function blixis_resolve_responsive( ?string $base, array $overrides ): array {
	$out     = array( 'base' => $base );
	$current = $base;
	foreach ( blixis_registry()['breakpoints'] as $breakpoint ) {
		$current            = $overrides[ $breakpoint ] ?? $current;
		$out[ $breakpoint ] = $current;
	}
	return $out;
}

/**
 * Turns resolved values into allowlisted classes. Only table values reach the output.
 *
 * @param string                     $prop     Responsive prop.
 * @param array<string, string|null> $resolved Resolved values.
 * @return string[]
 */
function blixis_responsive_classes( string $prop, array $resolved ): array {
	$registry = blixis_registry();
	$table    = $registry['classes'][ $prop ] ?? array();
	$out      = array();
	$previous = null;
	foreach ( array_merge( array( 'base' ), $registry['breakpoints'] ) as $step ) {
		$value = $resolved[ $step ] ?? null;
		if ( null !== $value && $value !== $previous ) {
			$prefix = 'base' === $step ? '' : $step . ':';
			foreach ( explode( ' ', $table[ $value ] ?? '' ) as $name ) {
				$out[] = $prefix . $name;
			}
		}
		$previous = $value;
	}
	return $out;
}

/**
 * Pointer-escapes a key.
 *
 * @param string|int $key Key.
 * @return string
 */
function blixis_pointer_key( $key ): string {
	return str_replace( array( '~', '/' ), array( '~0', '~1' ), (string) $key );
}

/**
 * Checks a URL against the contract allowlist.
 *
 * @param string $url URL.
 * @return bool
 */
function blixis_is_safe_url( string $url ): bool {
	return blixis_grammar_matches( blixis_registry()['urlPattern'], $url );
}

/**
 * Validates a node against the registry without producing output.
 *
 * @param array<string, mixed> $node Node.
 * @return array{resolved: array<string, mixed>|null, diagnostics: array<int, array{code: string, path: string}>}
 */
function blixis_resolve_node( array $node ): array {
	$registry    = blixis_registry();
	$diagnostics = array();
	$type        = is_string( $node['type'] ?? null ) ? $node['type'] : '';
	if ( ! isset( $registry['elements'][ $type ] ) ) {
		return array(
			'resolved'    => null,
			'diagnostics' => array(
				array(
					'code' => 'render.unknown_type',
					'path' => '/type',
				),
			),
		);
	}
	$element = $registry['elements'][ $type ];
	$version = $node['version'] ?? null;
	// is_float admits 1.0, which is the same JSON number as 1 in the admin preview.
	$version_ok = ( is_int( $version ) || is_float( $version ) ) && (float) $version === (float) $element['version'];
	if ( ! $version_ok ) {
		return array(
			'resolved'    => null,
			'diagnostics' => array(
				array(
					'code' => 'render.unknown_version',
					'path' => '/version',
				),
			),
		);
	}
	$props  = is_array( $node['props'] ?? null ) ? $node['props'] : array();
	$values = array();
	foreach ( $element['props'] as $name => $spec ) {
		$values[ $name ] = $spec['default'];
	}
	foreach ( $props as $key => $unused ) {
		if ( ! isset( $element['props'][ $key ] ) && ! in_array( (string) $key, $element['responsive'], true ) ) {
			$diagnostics[] = array(
				'code' => 'render.unknown_prop',
				'path' => '/props/' . blixis_pointer_key( $key ),
			);
		}
	}
	foreach ( $element['props'] as $name => $spec ) {
		if ( ! array_key_exists( $name, $props ) ) {
			continue;
		}
		$value = $props[ $name ];
		$ok    = false;
		switch ( $spec['kind'] ) {
			case 'text':
			case 'inlineHtml':
			case 'url':
				$ok = is_string( $value );
				break;
			case 'enum':
				$ok = is_string( $value ) && in_array( $value, $spec['values'], true );
				break;
			case 'int':
				if ( is_float( $value ) && floor( $value ) === $value ) {
					$value = (int) $value;
				}
				$ok = is_int( $value ) && $value >= $spec['min'] && $value <= $spec['max'];
				break;
		}
		if ( $ok ) {
			$values[ $name ] = $value;
		} else {
			$diagnostics[] = array(
				'code' => 'render.invalid_prop',
				'path' => '/props/' . $name,
			);
		}
	}
	$bases     = array();
	$overrides = array();
	foreach ( $element['responsive'] as $prop ) {
		$bases[ $prop ]     = null;
		$overrides[ $prop ] = array();
		if ( ! array_key_exists( $prop, $props ) ) {
			continue;
		}
		$value = $props[ $prop ];
		if ( is_string( $value ) && isset( $registry['classes'][ $prop ][ $value ] ) ) {
			$bases[ $prop ] = $value;
		} else {
			$diagnostics[] = array(
				'code' => 'render.invalid_prop',
				'path' => '/props/' . $prop,
			);
		}
	}
	$responsive = is_array( $node['responsive'] ?? null ) ? $node['responsive'] : array();
	foreach ( $responsive as $breakpoint => $set ) {
		$bp_path = '/responsive/' . blixis_pointer_key( $breakpoint );
		if ( ! in_array( (string) $breakpoint, $registry['breakpoints'], true ) || ! is_array( $set ) ) {
			$diagnostics[] = array(
				'code' => 'render.invalid_responsive',
				'path' => $bp_path,
			);
			continue;
		}
		foreach ( $set as $prop => $value ) {
			$path = $bp_path . '/' . blixis_pointer_key( $prop );
			if ( ! in_array( (string) $prop, $element['responsive'], true ) ) {
				$diagnostics[] = array(
					'code' => 'render.invalid_responsive',
					'path' => $path,
				);
				continue;
			}
			if ( is_string( $value ) && isset( $registry['classes'][ $prop ][ $value ] ) ) {
				$overrides[ $prop ][ (string) $breakpoint ] = $value;
			} else {
				$diagnostics[] = array(
					'code' => 'render.invalid_prop',
					'path' => $path,
				);
			}
		}
	}
	$classes = array( $element['baseClass'] );
	foreach ( $element['responsive'] as $prop ) {
		$classes = array_merge( $classes, blixis_responsive_classes( $prop, blixis_resolve_responsive( $bases[ $prop ], $overrides[ $prop ] ) ) );
	}
	return array(
		'resolved'    => array(
			'values'  => $values,
			'classes' => implode( ' ', $classes ),
		),
		'diagnostics' => $diagnostics,
	);
}

/**
 * Escapes literal text for an HTML context. Stored text is plain text, not HTML, but
 * esc_html and esc_attr do not double-encode, so "&amp;" would display as "&" here and as
 * "&amp;" in React. Encoding the ampersand first keeps the stored characters literal.
 *
 * @param string $text Stored text.
 * @return string
 */
function blixis_esc_text( string $text ): string {
	return esc_html( str_replace( '&', '&amp;', $text ) );
}

/**
 * Attribute variant of blixis_esc_text().
 *
 * @param string $text Stored text.
 * @return string
 */
function blixis_esc_text_attr( string $text ): string {
	return esc_attr( str_replace( '&', '&amp;', $text ) );
}

/**
 * Inline HTML allowlist for the only rich field.
 *
 * @return array<string, array<string, bool>>
 */
function blixis_kses_inline(): array {
	return array(
		'a'      => array( 'href' => true ),
		'strong' => array(),
		'em'     => array(),
		'br'     => array(),
		'code'   => array(),
	);
}

/**
 * Renders one node. Diagnostics go to the out-parameter and never into the HTML, because
 * the HTML is cacheable and public.
 *
 * @param array<string, mixed>                  $node        Node.
 * @param callable                              $media       Resolves an attachment ID to url/width/height or null.
 * @param array<int, array{code: string, path: string}> $diagnostics Out: diagnostics.
 * @return string
 */
function blixis_render_node( array $node, callable $media, array &$diagnostics ): string {
	$result      = blixis_resolve_node( $node );
	$diagnostics = $result['diagnostics'];
	$html        = '';
	if ( null !== $result['resolved'] ) {
		$values = $result['resolved']['values'];
		$class  = esc_attr( $result['resolved']['classes'] );
		$type   = $node['type'];
		$add    = static function ( string $code, string $path ) use ( &$diagnostics ): void {
			$diagnostics[] = array(
				'code' => $code,
				'path' => $path,
			);
		};
		if ( 'blixis/heading' === $type || 'blixis/paragraph' === $type ) {
			$tag  = 'blixis/heading' === $type ? 'h' . (int) $values['level'] : 'p';
			$rich = 'blixis/paragraph' === $type ? $values['html'] : '';
			if ( '' !== $rich ) {
				$body = wp_kses( $rich, blixis_kses_inline(), blixis_registry()['urlProtocols'] );
				$html = '<' . $tag . ' class="' . $class . '">' . $body . '</' . $tag . '>';
			} elseif ( '' === $values['text'] ) {
				$add( 'render.empty_content', '/props/text' );
			} else {
				$html = '<' . $tag . ' class="' . $class . '">' . blixis_esc_text( $values['text'] ) . '</' . $tag . '>';
			}
		} elseif ( 'blixis/button' === $type ) {
			$url = $values['url'];
			if ( '' === $values['label'] ) {
				$add( 'render.empty_content', '/props/label' );
			} else {
				$href = '';
				if ( '' !== $url ) {
					if ( blixis_is_safe_url( $url ) ) {
						$href = esc_url( $url, blixis_registry()['urlProtocols'] );
					}
					if ( '' === $href ) {
						$add( 'render.unsafe_url', '/props/url' );
					}
				}
				$label = blixis_esc_text( $values['label'] );
				$html  = '' !== $href
					? '<a class="' . $class . '" href="' . $href . '">' . $label . '</a>'
					: '<span class="' . $class . '">' . $label . '</span>';
			}
		} elseif ( 'blixis/image' === $type ) {
			$item = null === $values['mediaId'] ? null : $media( $values['mediaId'] );
			if ( null === $item ) {
				$add( 'render.media_missing', '/props/mediaId' );
			} else {
				$src = blixis_is_safe_url( $item['url'] ) ? esc_url( $item['url'], blixis_registry()['urlProtocols'] ) : '';
				if ( '' === $src ) {
					$add( 'render.unsafe_url', '/props/mediaId' );
				} else {
					$html = '<img class="' . $class . '" src="' . $src . '" alt="' . blixis_esc_text_attr( $values['alt'] )
						. '" width="' . (int) $item['width'] . '" height="' . (int) $item['height']
						. '" loading="' . esc_attr( $values['loading'] ) . '">';
				}
			}
		}
	}
	usort(
		$diagnostics,
		static fn( array $a, array $b ): int => strcmp( $a['path'], $b['path'] ) ?: strcmp( $a['code'], $b['code'] )
	);
	return $html;
}
