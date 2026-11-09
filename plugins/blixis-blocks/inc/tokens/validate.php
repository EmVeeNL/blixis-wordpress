<?php
/**
 * BlixisThemeConfig validator (task 03-02, contract v2 from task 03-06).
 *
 * Contract: docs/contracts/tokens. Validates raw bytes and returns a normalized
 * config or a sorted list of {code, path} errors. Pure PHP: no WordPress calls,
 * no output, no storage. The TypeScript validator in packages/tokens must return
 * the same result for every input; tests/03-02 compares them.
 *
 * @package Blixis\Blocks
 */

declare(strict_types=1);

namespace Blixis\Blocks\Tokens;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

require_once __DIR__ . '/color.php';

/**
 * The token map: closed names, grammars, error codes, limits, and the breakpoint preset.
 *
 * A copy of docs/contracts/tokens/v1/token-map.json, shipped with the plugin; a test
 * keeps the two identical.
 *
 * @return array<mixed>
 */
function token_map(): array {
	static $map = null;
	if ( null === $map ) {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local plugin file.
		$map = json_decode( (string) file_get_contents( __DIR__ . '/token-map.json' ), true, 64, JSON_THROW_ON_ERROR );
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
function grammar_matches( string $grammar, string $value ): bool {
	return 1 === preg_match( '~' . str_replace( '~', '\~', $grammar ) . '~D', $value );
}

/**
 * Builds an RFC 6901 child pointer.
 *
 * @param string     $parent_path Parent pointer.
 * @param string|int $key         Key.
 * @return string
 */
function pointer( string $parent_path, $key ): string {
	return $parent_path . '/' . str_replace( array( '~', '/' ), array( '~0', '~1' ), (string) $key );
}

/**
 * Normalizes a colour: hex becomes lower case with six or eight digits; other formats stay as entered.
 *
 * @param string $value Valid colour.
 * @return string
 */
function normalize_color( string $value ): string {
	if ( '#' !== $value[0] ) {
		// rgb(), hsl() and oklch() keep the entered text.
		return $value;
	}
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
function validate_bytes( string $bytes ): array {
	$map  = token_map();
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
	if ( exceeds_depth( $bytes, $map['limits']['maxDepth'] ) ) {
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
	return validate_object( $root, $map );
}

/**
 * Measures nesting on raw bytes. json_decode reports a syntax error on very deep input
 * (bison stack limit), so this must run first. Applies to malformed text too.
 *
 * @param string $bytes Raw input.
 * @param int    $limit Maximum depth.
 * @return bool
 */
function exceeds_depth( string $bytes, int $limit ): bool {
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
 * Migrates a normalized config to the current schema version, one step at a time.
 *
 * Pure: takes a config that already passed validation at its own version. Version 1 to 2
 * only changes the version number, because every v1 value is a valid v2 value; the
 * additions (colour formats, units, colorsDark) are optional or widen a grammar.
 * Anything that is not a lower, known version is returned unchanged.
 *
 * @param array<string, mixed> $config Normalized config.
 * @return array<string, mixed>
 */
function migrate_config( array $config ): array {
	$current = (int) token_map()['contractVersion'];
	$version = $config['schemaVersion'] ?? null;
	while ( is_int( $version ) && $version >= 1 && $version < $current ) {
		if ( 1 === $version ) {
			$config['schemaVersion'] = 2;
		}
		$version = $config['schemaVersion'];
	}
	return $config;
}

/**
 * The grammar name that applies to a section and key.
 *
 * @param array<mixed> $map     Token map.
 * @param array<mixed> $section Section definition.
 * @param string       $key     Token key.
 * @return string
 */
function field_grammar( array $map, array $section, string $key ): string {
	if ( 'motion' === $section['kind'] ) {
		$default = 'easing' === $key ? 'easing' : 'duration';
	} else {
		$default = $section['kind'];
	}
	return $map['fields'][ $section['section'] ][ $key ]['grammar'] ?? $default;
}

/**
 * Whether a value fits its grammar, including colour component ranges and the colours in shadows.
 *
 * @param array<string, string> $grammars Grammar sources for the config version being read.
 * @param string                $grammar  Grammar name.
 * @param string                $value    Candidate.
 * @param bool                  $legacy   True for a version 1 config (hex only, no range rules needed).
 * @return bool
 */
function value_fits( array $grammars, string $grammar, string $value, bool $legacy ): bool {
	if ( ! grammar_matches( $grammars[ $grammar ], $value ) ) {
		return false;
	}
	if ( $legacy ) {
		return true;
	}
	if ( 'color' === $grammar ) {
		return null !== parse_color( $value );
	}
	if ( 'shadow' === $grammar ) {
		foreach ( shadow_colors( $value ) as $color ) {
			if ( null === parse_color( $color ) ) {
				return false;
			}
		}
	}
	return true;
}

/**
 * Validates the decoded object.
 *
 * @param object       $root Decoded root.
 * @param array<mixed> $map  Token map.
 * @return array{ok: bool, errors: array<int, array{code: string, path: string}>, config?: array<string, mixed>}
 */
function validate_object( object $root, array $map ): array {
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
	$legacy = false;
	if ( (float) $version === (float) $map['contractVersion'] ) {
		$grammars = $map['grammars'];
	} elseif ( isset( $map['legacyVersions'][ (string) (int) $version ] ) && (float) (int) $version === (float) $version ) {
		// A stored older config is read under the rules it was written with, then migrated.
		$legacy   = true;
		$grammars = $map['legacyVersions'][ (string) (int) $version ]['grammars'] + $map['grammars'];
	} else {
		return $single( 'schema.version_unsupported', '/schemaVersion' );
	}

	$errors   = array();
	$output   = array( 'schemaVersion' => (int) $version );
	$known    = array( 'schemaVersion', 'theme' );
	$optional = $legacy ? array() : $map['optionalSections'];
	foreach ( $map['sections'] as $section ) {
		$known[] = $section['section'];
	}
	foreach ( $optional as $section ) {
		$known[] = $section['section'];
	}
	foreach ( $root as $key => $unused ) {
		if ( ! in_array( (string) $key, $known, true ) ) {
			$errors[] = array(
				'code' => 'field.unknown',
				'path' => pointer( '', $key ),
			);
		}
	}

	validate_theme( $root, $map, $errors, $output );

	$definitions = array();
	foreach ( $map['sections'] as $section ) {
		$definitions[] = array( $section, true );
	}
	foreach ( $optional as $section ) {
		// An optional section mirrors the tokens of another one and may be left out.
		$mirror = null;
		foreach ( $map['sections'] as $candidate ) {
			if ( $candidate['section'] === $section['mirrors'] ) {
				$mirror = $candidate;
			}
		}
		$definitions[] = array(
			array(
				'section' => $section['section'],
				'kind'    => $section['kind'],
				'tokens'  => $mirror['tokens'],
			),
			false,
		);
	}

	foreach ( $definitions as list( $section, $required ) ) {
		$name = $section['section'];
		if ( ! property_exists( $root, $name ) ) {
			if ( $required ) {
				$errors[] = array(
					'code' => 'field.required',
					'path' => '/' . $name,
				);
			}
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
					'path' => pointer( '/' . $name, $key ),
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
			$grammar = field_grammar( $map, $section, $key );
			if ( ! value_fits( $grammars, $grammar, $value, $legacy ) ) {
				$errors[]      = array(
					'code' => $map['errorCodes'][ $grammar ],
					'path' => $path,
				);
				$grammar_error = true;
				continue;
			}
			if ( 'color' === $section['kind'] ) {
				$value = normalize_color( $value );
			} elseif ( 'shadow' === $section['kind'] ) {
				$value = strtolower( $value );
			}
			$clean[ $key ] = $value;
		}
		if ( 'breakpoint' === $section['kind'] && $shape_ok && ! $grammar_error ) {
			validate_breakpoints( $raw, $map, $errors );
		}
		$output[ $name ] = $clean;
	}

	if ( $errors ) {
		usort(
			$errors,
			static fn( array $a, array $b ): int => 0 !== strcmp( $a['path'], $b['path'] ) ? strcmp( $a['path'], $b['path'] ) : strcmp( $a['code'], $b['code'] )
		);
		return array(
			'ok'     => false,
			'errors' => $errors,
		);
	}
	return array(
		'ok'     => true,
		'errors' => array(),
		'config' => migrate_config( $output ),
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
function validate_theme( object $root, array $map, array &$errors, array &$output ): void {
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
			$add( 'field.unknown', pointer( '/theme', $key ) );
		}
	}
	if ( ! property_exists( $theme, 'slug' ) ) {
		$add( 'field.required', '/theme/slug' );
	} elseif ( ! is_string( $theme->slug ) ) {
		$add( 'field.wrong_type', '/theme/slug' );
	} elseif ( ! grammar_matches( $map['grammars']['slug'], $theme->slug ) ) {
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
function validate_breakpoints( object $raw, array $map, array &$errors ): void {
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
