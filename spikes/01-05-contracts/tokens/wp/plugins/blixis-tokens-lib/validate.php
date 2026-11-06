<?php
/**
 * PHP half of the token validator. Throwaway proof for task 01-05.
 * Must agree with tokens/src/validate.ts on code and path for every input.
 * Loads outside WordPress as well, so plain PHP can run the same fixtures.
 */

declare(strict_types=1);

/**
 * Reads a file from the bundled contract.
 *
 * @param string $relative Path below docs/contracts/tokens/v1.
 * @return string
 */
function blixis_contract_raw( string $relative ): string {
	static $bundle = null;
	if ( null === $bundle ) {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local bundle.
		$bundle = json_decode( (string) file_get_contents( __DIR__ . '/contract-bundle.json' ), true, 16, JSON_THROW_ON_ERROR );
	}
	if ( ! isset( $bundle[ $relative ] ) ) {
		throw new RuntimeException( 'Missing contract file ' . $relative ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- Proof code.
	}
	return $bundle[ $relative ];
}

/**
 * Reads a JSON contract file as arrays.
 *
 * @param string $relative Path below docs/contracts/tokens/v1.
 * @return array<mixed>
 */
function blixis_contract_json( string $relative ): array {
	return json_decode( blixis_contract_raw( $relative ), true, 64, JSON_THROW_ON_ERROR );
}

/**
 * Lists bundled contract paths with a prefix.
 *
 * @param string $prefix Path prefix.
 * @return string[]
 */
function blixis_contract_list( string $prefix ): array {
	// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local bundle.
	$bundle = json_decode( (string) file_get_contents( __DIR__ . '/contract-bundle.json' ), true, 16, JSON_THROW_ON_ERROR );
	$names  = array();
	foreach ( array_keys( $bundle ) as $name ) {
		if ( str_starts_with( $name, $prefix ) ) {
			$names[] = $name;
		}
	}
	sort( $names, SORT_STRING );
	return $names;
}

/**
 * Returns the token map.
 *
 * @return array<mixed>
 */
function blixis_token_map(): array {
	static $map = null;
	if ( null === $map ) {
		$map = blixis_contract_json( 'token-map.json' );
	}
	return $map;
}

/**
 * Tests a contract grammar. D makes $ strict, because PCRE's $ otherwise accepts a trailing newline.
 *
 * @param string $grammar Grammar source.
 * @param string $value   Candidate.
 * @return bool
 */
function blixis_grammar_matches( string $grammar, string $value ): bool {
	return 1 === preg_match( '~' . str_replace( '~', '\~', $grammar ) . '~D', $value );
}

/**
 * Builds an RFC 6901 child pointer.
 *
 * @param string     $parent_path Parent pointer.
 * @param string|int $key         Key.
 * @return string
 */
function blixis_pointer( string $parent_path, $key ): string {
	return $parent_path . '/' . str_replace( array( '~', '/' ), array( '~0', '~1' ), (string) $key );
}

/**
 * Normalizes a hex colour: lower case and six or eight digits.
 *
 * @param string $value Valid colour.
 * @return string
 */
function blixis_normalize_color( string $value ): string {
	$lower = strtolower( $value );
	if ( 4 === strlen( $lower ) ) {
		return '#' . $lower[1] . $lower[1] . $lower[2] . $lower[2] . $lower[3] . $lower[3];
	}
	return $lower;
}

/**
 * Validates raw config bytes.
 *
 * @param string $bytes Raw request body.
 * @return array{ok: bool, errors: array<int, array{code: string, path: string}>, config?: array<string, mixed>}
 */
function blixis_validate_bytes( string $bytes ): array {
	$map  = blixis_token_map();
	$fail = static fn( string $code, string $path ): array => array(
		'ok'     => false,
		'errors' => array(
			array(
				'code' => $code,
				'path' => $path,
			),
		),
	);
	if ( strlen( $bytes ) > $map['limits']['maxBytes'] ) {
		return $fail( 'config.too_large', '' );
	}
	if ( blixis_exceeds_depth( $bytes, $map['limits']['maxDepth'] ) ) {
		return $fail( 'config.too_deep', '' );
	}
	// Object mode, not assoc: assoc cannot tell {} from [].
	$root = json_decode( $bytes, false, 64 );
	if ( JSON_ERROR_NONE !== json_last_error() ) {
		return $fail( 'config.invalid_json', '' );
	}
	if ( ! is_object( $root ) ) {
		return $fail( 'config.not_object', '' );
	}
	return blixis_validate_object( $root, $map );
}

/**
 * Measures nesting on raw bytes. json_decode reports a syntax error on very deep input
 * (bison stack limit), so this must run first. Applies to malformed text too.
 *
 * @param string $bytes Raw input.
 * @param int    $limit Maximum depth.
 * @return bool
 */
function blixis_exceeds_depth( string $bytes, int $limit ): bool {
	$depth     = 0;
	$in_string = false;
	$length    = strlen( $bytes );
	for ( $i = 0; $i < $length; $i++ ) {
		$byte = $bytes[ $i ];
		if ( $in_string ) {
			if ( '\\' === $byte ) {
				++$i;
			} elseif ( '"' === $byte ) {
				$in_string = false;
			}
		} elseif ( '"' === $byte ) {
			$in_string = true;
		} elseif ( '[' === $byte || '{' === $byte ) {
			++$depth;
			if ( $depth > $limit ) {
				return true;
			}
		} elseif ( ']' === $byte || '}' === $byte ) {
			--$depth;
		}
	}
	return false;
}

/**
 * Validates the decoded object.
 *
 * @param object       $root Decoded root.
 * @param array<mixed> $map  Token map.
 * @return array{ok: bool, errors: array<int, array{code: string, path: string}>, config?: array<string, mixed>}
 */
function blixis_validate_object( object $root, array $map ): array {
	$single = static fn( string $code, string $path ): array => array(
		'ok'     => false,
		'errors' => array(
			array(
				'code' => $code,
				'path' => $path,
			),
		),
	);
	if ( ! property_exists( $root, 'schemaVersion' ) ) {
		return $single( 'field.required', '/schemaVersion' );
	}
	$version = $root->schemaVersion; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- JSON key.
	if ( ! is_int( $version ) && ! is_float( $version ) ) {
		return $single( 'field.wrong_type', '/schemaVersion' );
	}
	// JSON has one number type: 1.0 and 1e0 are 1 in JSON.parse and in JSON Schema's integer.
	if ( (float) $version !== (float) $map['contractVersion'] ) {
		return $single( 'schema.version_unsupported', '/schemaVersion' );
	}

	$errors = array();
	$output = array( 'schemaVersion' => $map['contractVersion'] );
	$known  = array( 'schemaVersion', 'theme' );
	foreach ( $map['sections'] as $section ) {
		$known[] = $section['section'];
	}
	foreach ( $root as $key => $unused ) {
		if ( ! in_array( (string) $key, $known, true ) ) {
			$errors[] = array(
				'code' => 'field.unknown',
				'path' => blixis_pointer( '', $key ),
			);
		}
	}

	blixis_validate_theme( $root, $map, $errors, $output );

	foreach ( $map['sections'] as $section ) {
		$name = $section['section'];
		if ( ! property_exists( $root, $name ) ) {
			$errors[] = array(
				'code' => 'field.required',
				'path' => '/' . $name,
			);
			continue;
		}
		$raw = $root->{$name};
		if ( ! is_object( $raw ) ) {
			$errors[] = array(
				'code' => 'field.wrong_type',
				'path' => '/' . $name,
			);
			continue;
		}
		foreach ( $raw as $key => $unused ) {
			if ( ! array_key_exists( (string) $key, $section['tokens'] ) ) {
				$errors[] = array(
					'code' => 'field.unknown',
					'path' => blixis_pointer( '/' . $name, $key ),
				);
			}
		}
		$clean         = array();
		$shape_ok      = true;
		$grammar_error = false;
		foreach ( array_keys( $section['tokens'] ) as $key ) {
			$key  = (string) $key;
			$path = '/' . $name . '/' . $key;
			if ( ! property_exists( $raw, $key ) ) {
				$errors[] = array(
					'code' => 'field.required',
					'path' => $path,
				);
				$shape_ok = false;
				continue;
			}
			$value = $raw->{$key};
			if ( ! is_string( $value ) ) {
				$errors[] = array(
					'code' => 'field.wrong_type',
					'path' => $path,
				);
				$shape_ok = false;
				continue;
			}
			$grammar = $section['kind'];
			if ( 'motion' === $grammar ) {
				$grammar = 'easing' === $key ? 'easing' : 'duration';
			}
			if ( ! blixis_grammar_matches( $map['grammars'][ $grammar ], $value ) ) {
				$errors[]      = array(
					'code' => $map['errorCodes'][ $grammar ],
					'path' => $path,
				);
				$grammar_error = true;
				continue;
			}
			if ( 'color' === $section['kind'] ) {
				$value = blixis_normalize_color( $value );
			} elseif ( 'shadow' === $section['kind'] ) {
				$value = strtolower( $value );
			}
			$clean[ $key ] = $value;
		}
		if ( 'breakpoint' === $section['kind'] && $shape_ok && ! $grammar_error ) {
			blixis_validate_breakpoints( $raw, $map, $errors );
		}
		$output[ $name ] = $clean;
	}

	if ( $errors ) {
		usort(
			$errors,
			static fn( array $a, array $b ): int => strcmp( $a['path'], $b['path'] ) ?: strcmp( $a['code'], $b['code'] )
		);
		return array(
			'ok'     => false,
			'errors' => $errors,
		);
	}
	return array(
		'ok'     => true,
		'errors' => array(),
		'config' => $output,
	);
}

/**
 * Validates the theme section.
 *
 * @param object       $root   Decoded root.
 * @param array<mixed> $map    Token map.
 * @param array<mixed> $errors Error list.
 * @param array<mixed> $output Normalized output.
 * @return void
 */
function blixis_validate_theme( object $root, array $map, array &$errors, array &$output ): void {
	$add = static function ( string $code, string $path ) use ( &$errors ): void {
		$errors[] = array(
			'code' => $code,
			'path' => $path,
		);
	};
	if ( ! property_exists( $root, 'theme' ) ) {
		$add( 'field.required', '/theme' );
		return;
	}
	$theme = $root->theme;
	if ( ! is_object( $theme ) ) {
		$add( 'field.wrong_type', '/theme' );
		return;
	}
	foreach ( $theme as $key => $unused ) {
		if ( 'slug' !== (string) $key && 'parent' !== (string) $key ) {
			$add( 'field.unknown', blixis_pointer( '/theme', $key ) );
		}
	}
	if ( ! property_exists( $theme, 'slug' ) ) {
		$add( 'field.required', '/theme/slug' );
	} elseif ( ! is_string( $theme->slug ) ) {
		$add( 'field.wrong_type', '/theme/slug' );
	} elseif ( ! blixis_grammar_matches( $map['grammars']['slug'], $theme->slug ) ) {
		$add( 'token.slug.invalid', '/theme/slug' );
	}
	if ( ! property_exists( $theme, 'parent' ) ) {
		$add( 'field.required', '/theme/parent' );
	} elseif ( ! is_string( $theme->parent ) ) {
		$add( 'field.wrong_type', '/theme/parent' );
	} elseif ( $theme->parent !== $map['theme']['parent'] ) {
		$add( 'token.parent.invalid', '/theme/parent' );
	}
	$output['theme'] = array(
		'slug'   => $theme->slug ?? null,
		'parent' => $theme->parent ?? null,
	);
}

/**
 * Checks ascending order, then the fixed build-time preset.
 *
 * @param object       $raw    Decoded section.
 * @param array<mixed> $map    Token map.
 * @param array<mixed> $errors Error list.
 * @return void
 */
function blixis_validate_breakpoints( object $raw, array $map, array &$errors ): void {
	$previous  = -1.0;
	$ascending = true;
	foreach ( array_keys( $map['breakpointPreset'] ) as $key ) {
		$size = (float) $raw->{$key};
		if ( $size <= $previous ) {
			$errors[]  = array(
				'code' => 'token.breakpoint.not_ascending',
				'path' => '/breakpoints/' . $key,
			);
			$ascending = false;
		}
		$previous = $size;
	}
	if ( ! $ascending ) {
		return;
	}
	foreach ( $map['breakpointPreset'] as $key => $value ) {
		if ( $raw->{$key} !== $value ) {
			$errors[] = array(
				'code' => 'token.breakpoint.not_preset',
				'path' => '/breakpoints/' . $key,
			);
		}
	}
}
