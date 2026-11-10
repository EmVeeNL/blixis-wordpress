<?php
/**
 * BlixisLayoutConfig validator (task 03-07 Part A, contract v1).
 *
 * Contract: docs/contracts/layout. Validates raw bytes and returns a normalized config or a
 * sorted list of {code, path} errors. Pure PHP: no WordPress calls, no output, no storage.
 * The TypeScript validator in packages/tokens (layout.ts) must return the same result for
 * every input; packages/tokens/test/layout.test.ts compares them.
 *
 * Text is plain text and stays plain text: it is trimmed here and escaped when it is printed.
 * URLs are validated here, not only on output.
 *
 * @package Blixis\Blocks
 */

declare(strict_types=1);

namespace Blixis\Blocks\Layout;

use function Blixis\Blocks\Tokens\exceeds_depth;
use function Blixis\Blocks\Tokens\grammar_matches;
use function Blixis\Blocks\Tokens\pointer;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

require_once __DIR__ . '/../tokens/validate.php';

/**
 * The layout map: closed names, grammars, enums, limits, error codes, and the defaults.
 *
 * A copy of docs/contracts/layout/v1/layout-map.json, shipped with the plugin; a test keeps
 * the copies identical.
 *
 * @return array<mixed>
 */
function layout_map(): array {
	static $map = null;
	if ( null === $map ) {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local plugin file.
		$map = json_decode( (string) file_get_contents( __DIR__ . '/layout-map.json' ), true, 64, JSON_THROW_ON_ERROR );
	}
	return $map;
}

/**
 * The default configuration: blank layout, plain header, one-column footer with a copyright line.
 *
 * Pure. Defaults belong to the wizard, not to the validator: a stored config is never
 * completed with them.
 *
 * @param string $slug Child theme slug.
 * @return array<string, mixed>
 */
function defaults( string $slug = 'blixis-starter' ): array {
	return array(
		'schemaVersion' => (int) layout_map()['contractVersion'],
		'theme'         => array( 'slug' => $slug ),
	) + layout_map()['defaults'];
}

/**
 * Validates raw config bytes.
 *
 * @param string $bytes Raw request body.
 * @return array{ok: bool, errors: array<int, array{code: string, path: string}>, config?: array<string, mixed>}
 */
function validate_bytes( string $bytes ): array {
	$map  = layout_map();
	$fail = static fn( string $code ): array => array(
		'ok'     => false,
		'errors' => array(
			array(
				'code' => $code,
				'path' => '',
			),
		),
	);
	if ( strlen( $bytes ) > $map['limits']['maxBytes'] ) {
		return $fail( 'config.too_large' );
	}
	if ( exceeds_depth( $bytes, $map['limits']['maxDepth'] ) ) {
		return $fail( 'config.too_deep' );
	}
	// Object mode, not assoc: assoc cannot tell {} from [].
	$root = json_decode( $bytes, false, 64 );
	if ( JSON_ERROR_NONE !== json_last_error() ) {
		return $fail( 'config.invalid_json' );
	}
	if ( ! is_object( $root ) ) {
		return $fail( 'config.not_object' );
	}
	return validate_object( $root, $map );
}

/**
 * Brings a config that already passed validation at its own version up to the current one.
 *
 * Pure, one version at a time. Version 1 is the only version, so there is no step yet; the
 * function exists so that storage already reads through it.
 *
 * @param array<string, mixed> $config Normalized config.
 * @return array<string, mixed>
 */
function migrate_config( array $config ): array {
	return $config;
}

/**
 * Records an error.
 *
 * @param array<int, array{code: string, path: string}> $errors Error list.
 * @param string                                        $code   Error code.
 * @param string                                        $path   RFC 6901 pointer.
 * @return void
 */
function add_error( array &$errors, string $code, string $path ): void {
	$errors[] = array(
		'code' => $code,
		'path' => $path,
	);
}

/**
 * Reads a required child object with a closed key set.
 *
 * @param object                                        $holder      Holder object.
 * @param string                                        $key         Key.
 * @param string                                        $parent_path Parent pointer.
 * @param array<int, string>                            $allowed     Allowed keys.
 * @param array<int, array{code: string, path: string}> $errors      Error list.
 * @return object|null Null when absent or not an object.
 */
function object_field( object $holder, string $key, string $parent_path, array $allowed, array &$errors ): ?object {
	$path = pointer( $parent_path, $key );
	if ( ! property_exists( $holder, $key ) ) {
		add_error( $errors, 'field.required', $path );
		return null;
	}
	$value = $holder->{$key};
	if ( ! is_object( $value ) ) {
		add_error( $errors, 'field.wrong_type', $path );
		return null;
	}
	check_keys( $value, $path, $allowed, $errors );
	return $value;
}

/**
 * Flags keys outside the closed set.
 *
 * @param object                                        $value   Object.
 * @param string                                        $path    Its pointer.
 * @param array<int, string>                            $allowed Allowed keys.
 * @param array<int, array{code: string, path: string}> $errors  Error list.
 * @return void
 */
function check_keys( object $value, string $path, array $allowed, array &$errors ): void {
	foreach ( $value as $name => $unused ) {
		if ( ! in_array( (string) $name, $allowed, true ) ) {
			add_error( $errors, 'field.unknown', pointer( $path, $name ) );
		}
	}
}

/**
 * Reads a required boolean.
 *
 * @param object                                        $holder      Holder object.
 * @param string                                        $key         Key.
 * @param string                                        $parent_path Parent pointer.
 * @param array<int, array{code: string, path: string}> $errors      Error list.
 * @return bool|null
 */
function bool_field( object $holder, string $key, string $parent_path, array &$errors ): ?bool {
	$path = pointer( $parent_path, $key );
	if ( ! property_exists( $holder, $key ) ) {
		add_error( $errors, 'field.required', $path );
		return null;
	}
	if ( ! is_bool( $holder->{$key} ) ) {
		add_error( $errors, 'field.wrong_type', $path );
		return null;
	}
	return $holder->{$key};
}

/**
 * Reads a required string.
 *
 * @param object                                        $holder      Holder object.
 * @param string                                        $key         Key.
 * @param string                                        $parent_path Parent pointer.
 * @param array<int, array{code: string, path: string}> $errors      Error list.
 * @return string|null
 */
function string_field( object $holder, string $key, string $parent_path, array &$errors ): ?string {
	$path = pointer( $parent_path, $key );
	if ( ! property_exists( $holder, $key ) ) {
		add_error( $errors, 'field.required', $path );
		return null;
	}
	if ( ! is_string( $holder->{$key} ) ) {
		add_error( $errors, 'field.wrong_type', $path );
		return null;
	}
	return $holder->{$key};
}

/**
 * Reads a required string from a closed list.
 *
 * @param object                                        $holder      Holder object.
 * @param string                                        $key         Key.
 * @param string                                        $parent_path Parent pointer.
 * @param array<int, string>                            $allowed     Allowed values.
 * @param string                                        $code        Error code for a value outside the list.
 * @param array<int, array{code: string, path: string}> $errors      Error list.
 * @return string|null
 */
function enum_field( object $holder, string $key, string $parent_path, array $allowed, string $code, array &$errors ): ?string {
	$value = string_field( $holder, $key, $parent_path, $errors );
	if ( null === $value ) {
		return null;
	}
	if ( ! in_array( $value, $allowed, true ) ) {
		add_error( $errors, $code, pointer( $parent_path, $key ) );
		return null;
	}
	return $value;
}

/**
 * Checks and normalizes one plain-text value, returning the first failing rule.
 *
 * Trim removes spaces and line feeds at both ends, and nothing else. Length counts code
 * points. A control character, a bidirectional override or isolate, U+2028, U+2029 and U+FEFF
 * are refused; so are the angle brackets that start markup. A line feed is a control character
 * unless the field is multi-line.
 *
 * @param string $raw          Entered text.
 * @param bool   $multiline    Whether line feeds are allowed.
 * @param int    $min          Minimum length after trim (0 or 1).
 * @param int    $max          Maximum length after trim.
 * @param bool   $placeholders Whether {year} and {site} are the only braces allowed.
 * @param array<int, string> $placeholder_names Placeholder names.
 * @return array{0: string|null, 1: string} Error code or null, and the trimmed text.
 */
function check_text( string $raw, bool $multiline, int $min, int $max, bool $placeholders, array $placeholder_names ): array {
	$value = trim( $raw, " \n" );
	$probe = $multiline ? str_replace( "\n", '', $value ) : $value;
	if ( 1 === preg_match( '/[\p{Cc}\x{2028}\x{2029}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]/u', $probe ) ) {
		return array( 'text.control_char', $value );
	}
	if ( false !== strpbrk( $value, '<>' ) ) {
		return array( 'text.markup', $value );
	}
	$length = (int) preg_match_all( '/./su', $value );
	if ( $length < $min ) {
		return array( 'text.empty', $value );
	}
	if ( $length > $max ) {
		return array( 'text.too_long', $value );
	}
	if ( $placeholders ) {
		$search = array_map( static fn( string $name ): string => '{' . $name . '}', $placeholder_names );
		if ( false !== strpbrk( str_replace( $search, '', $value ), '{}' ) ) {
			return array( 'text.placeholder_unknown', $value );
		}
	}
	return array( null, $value );
}

/**
 * Reads a required plain-text string.
 *
 * @param object                                        $holder      Holder object.
 * @param string                                        $key         Key.
 * @param string                                        $parent_path Parent pointer.
 * @param array<string, mixed>                          $rules       multiline, min, max, placeholders.
 * @param array<int, array{code: string, path: string}> $errors      Error list.
 * @return string|null Trimmed text, null on error.
 */
function text_field( object $holder, string $key, string $parent_path, array $rules, array &$errors ): ?string {
	$raw = string_field( $holder, $key, $parent_path, $errors );
	if ( null === $raw ) {
		return null;
	}
	return text_value( $raw, pointer( $parent_path, $key ), $rules, $errors );
}

/**
 * Checks one plain-text value at a path.
 *
 * @param string                                        $raw    Entered text.
 * @param string                                        $path   Pointer.
 * @param array<string, mixed>                          $rules  multiline, min, max, placeholders.
 * @param array<int, array{code: string, path: string}> $errors Error list.
 * @return string|null Trimmed text, null on error.
 */
function text_value( string $raw, string $path, array $rules, array &$errors ): ?string {
	list( $code, $value ) = check_text(
		$raw,
		$rules['multiline'] ?? false,
		$rules['min'],
		$rules['max'],
		$rules['placeholders'] ?? false,
		layout_map()['placeholders']
	);
	if ( null !== $code ) {
		add_error( $errors, $code, $path );
		return null;
	}
	return $value;
}

/**
 * Reads a required URL. URLs are not trimmed: whitespace makes them invalid.
 *
 * @param object                                        $holder      Holder object.
 * @param string                                        $key         Key.
 * @param string                                        $parent_path Parent pointer.
 * @param string                                        $grammar     Grammar name in the map.
 * @param bool                                          $required    Whether an empty string is refused.
 * @param array<int, array{code: string, path: string}> $errors      Error list.
 * @return string|null
 */
function url_field( object $holder, string $key, string $parent_path, string $grammar, bool $required, array &$errors ): ?string {
	$value = string_field( $holder, $key, $parent_path, $errors );
	if ( null === $value ) {
		return null;
	}
	$path = pointer( $parent_path, $key );
	$map  = layout_map();
	if ( '' === $value ) {
		if ( $required ) {
			add_error( $errors, 'url.empty', $path );
			return null;
		}
		return '';
	}
	if ( strlen( $value ) > $map['limits']['urlLength'] || ! grammar_matches( $map['grammars'][ $grammar ], $value ) ) {
		add_error( $errors, 'url.invalid', $path );
		return null;
	}
	return $value;
}

/**
 * Validates the decoded object.
 *
 * @param object       $root Decoded root.
 * @param array<mixed> $map  Layout map.
 * @return array{ok: bool, errors: array<int, array{code: string, path: string}>, config?: array<string, mixed>}
 */
function validate_object( object $root, array $map ): array {
	$errors = array();
	if ( ! property_exists( $root, 'schemaVersion' ) ) {
		add_error( $errors, 'field.required', '/schemaVersion' );
		return array(
			'ok'     => false,
			'errors' => $errors,
		);
	}
	$version = $root->schemaVersion; // phpcs:ignore WordPress.NamingConventions.ValidVariableName.UsedPropertyNotSnakeCase -- JSON key.
	if ( ! is_int( $version ) && ! is_float( $version ) ) {
		add_error( $errors, 'field.wrong_type', '/schemaVersion' );
		return array(
			'ok'     => false,
			'errors' => $errors,
		);
	}
	// JSON has one number type: 1.0 and 1e0 are 1 in JSON.parse and in JSON Schema's integer.
	if ( (float) $version !== (float) $map['contractVersion'] ) {
		add_error( $errors, 'schema.version_unsupported', '/schemaVersion' );
		return array(
			'ok'     => false,
			'errors' => $errors,
		);
	}

	check_keys( $root, '', array( 'schemaVersion', 'theme', 'layout', 'header', 'footer' ), $errors );
	$output = array( 'schemaVersion' => (int) $map['contractVersion'] );

	$theme = object_field( $root, 'theme', '', array( 'slug' ), $errors );
	if ( null !== $theme ) {
		$slug = string_field( $theme, 'slug', '/theme', $errors );
		if ( null !== $slug ) {
			if ( ! grammar_matches( $map['grammars']['slug'], $slug ) ) {
				add_error( $errors, 'theme.slug.invalid', '/theme/slug' );
			} else {
				$output['theme'] = array( 'slug' => $slug );
			}
		}
	}
	$output['layout'] = enum_field( $root, 'layout', '', $map['enums']['layout'], 'layout.invalid', $errors );
	$output['header'] = validate_header( $root, $map, $errors );
	$output['footer'] = validate_footer( $root, $map, $errors );

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
 * Validates the header section.
 *
 * @param object                                        $root   Decoded root.
 * @param array<mixed>                                  $map    Layout map.
 * @param array<int, array{code: string, path: string}> $errors Error list.
 * @return array<string, mixed>|null
 */
function validate_header( object $root, array $map, array &$errors ): ?array {
	$header = object_field( $root, 'header', '', array( 'sticky', 'usp', 'logo', 'cta', 'search', 'mobileMenu' ), $errors );
	if ( null === $header ) {
		return null;
	}
	$limits = $map['limits'];
	$out    = array(
		'sticky'     => bool_field( $header, 'sticky', '/header', $errors ),
		'usp'        => null,
		'logo'       => enum_field( $header, 'logo', '/header', $map['enums']['logo'], 'header.logo.invalid', $errors ),
		'cta'        => null,
		'search'     => bool_field( $header, 'search', '/header', $errors ),
		'mobileMenu' => enum_field( $header, 'mobileMenu', '/header', $map['enums']['mobileMenu'], 'header.mobile_menu.invalid', $errors ),
	);

	$usp = object_field( $header, 'usp', '/header', array( 'enabled', 'items' ), $errors );
	if ( null !== $usp ) {
		$enabled = bool_field( $usp, 'enabled', '/header/usp', $errors );
		$items   = null;
		if ( ! property_exists( $usp, 'items' ) ) {
			add_error( $errors, 'field.required', '/header/usp/items' );
		} elseif ( ! is_array( $usp->items ) ) {
			add_error( $errors, 'field.wrong_type', '/header/usp/items' );
		} else {
			$items = array();
			foreach ( $usp->items as $index => $item ) {
				$path = '/header/usp/items/' . $index;
				if ( ! is_string( $item ) ) {
					add_error( $errors, 'field.wrong_type', $path );
					$items[] = null;
					continue;
				}
				$items[] = text_value(
					$item,
					$path,
					array(
						'min' => 1,
						'max' => $limits['uspItemLength'],
					),
					$errors
				);
			}
			if ( count( $items ) > $limits['uspItems'] ) {
				add_error( $errors, 'header.usp.too_many', '/header/usp/items' );
			} elseif ( true === $enabled && array() === $items ) {
				add_error( $errors, 'header.usp.empty', '/header/usp/items' );
			}
		}
		$out['usp'] = array(
			'enabled' => $enabled,
			'items'   => $items,
		);
	}

	$cta = object_field( $header, 'cta', '/header', array( 'enabled', 'text', 'url' ), $errors );
	if ( null !== $cta ) {
		$enabled    = bool_field( $cta, 'enabled', '/header/cta', $errors );
		$out['cta'] = array(
			'enabled' => $enabled,
			'text'    => text_field(
				$cta,
				'text',
				'/header/cta',
				array(
					'min' => true === $enabled ? 1 : 0,
					'max' => $limits['ctaTextLength'],
				),
				$errors
			),
			'url'     => url_field( $cta, 'url', '/header/cta', 'url', true === $enabled, $errors ),
		);
	}
	return $out;
}

/**
 * Validates the footer section.
 *
 * @param object                                        $root   Decoded root.
 * @param array<mixed>                                  $map    Layout map.
 * @param array<int, array{code: string, path: string}> $errors Error list.
 * @return array<string, mixed>|null
 */
function validate_footer( object $root, array $map, array &$errors ): ?array {
	$footer = object_field( $root, 'footer', '', array( 'stickToBottom', 'columns', 'contact', 'social', 'copyright', 'backToTop' ), $errors );
	if ( null === $footer ) {
		return null;
	}
	$limits = $map['limits'];
	$out    = array(
		'stickToBottom' => bool_field( $footer, 'stickToBottom', '/footer', $errors ),
		'columns'       => null,
		'contact'       => text_field(
			$footer,
			'contact',
			'/footer',
			array(
				'multiline' => true,
				'min'       => 0,
				'max'       => $limits['contactLength'],
			),
			$errors
		),
		'social'        => null,
		'copyright'     => null,
		'backToTop'     => bool_field( $footer, 'backToTop', '/footer', $errors ),
	);

	if ( ! property_exists( $footer, 'columns' ) ) {
		add_error( $errors, 'field.required', '/footer/columns' );
	} elseif ( ! is_int( $footer->columns ) && ! is_float( $footer->columns ) ) {
		add_error( $errors, 'field.wrong_type', '/footer/columns' );
	} else {
		$number = (float) $footer->columns;
		if ( ! is_finite( $number ) || floor( $number ) !== $number || $number < $limits['columnsMin'] || $number > $limits['columnsMax'] ) {
			add_error( $errors, 'footer.columns.invalid', '/footer/columns' );
		} else {
			$out['columns'] = (int) $number;
		}
	}

	if ( ! property_exists( $footer, 'social' ) ) {
		add_error( $errors, 'field.required', '/footer/social' );
	} elseif ( ! is_array( $footer->social ) ) {
		add_error( $errors, 'field.wrong_type', '/footer/social' );
	} else {
		$links = array();
		foreach ( $footer->social as $index => $item ) {
			$path = '/footer/social/' . $index;
			if ( ! is_object( $item ) ) {
				add_error( $errors, 'field.wrong_type', $path );
				$links[] = null;
				continue;
			}
			check_keys( $item, $path, array( 'service', 'url' ), $errors );
			$links[] = array(
				'service' => enum_field( $item, 'service', $path, $map['enums']['service'], 'footer.social.service_invalid', $errors ),
				'url'     => url_field( $item, 'url', $path, 'urlHttps', true, $errors ),
			);
		}
		if ( count( $links ) > $limits['socialItems'] ) {
			add_error( $errors, 'footer.social.too_many', '/footer/social' );
		}
		$out['social'] = $links;
	}

	$copyright = object_field( $footer, 'copyright', '/footer', array( 'enabled', 'text' ), $errors );
	if ( null !== $copyright ) {
		$enabled          = bool_field( $copyright, 'enabled', '/footer/copyright', $errors );
		$out['copyright'] = array(
			'enabled' => $enabled,
			'text'    => text_field(
				$copyright,
				'text',
				'/footer/copyright',
				array(
					'min'          => true === $enabled ? 1 : 0,
					'max'          => $limits['copyrightLength'],
					'placeholders' => true,
				),
				$errors
			),
		);
	}
	return $out;
}
