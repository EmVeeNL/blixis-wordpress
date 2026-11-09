<?php
/**
 * Local fonts from the WordPress Font Library (task 03-04, Q13).
 *
 * Lists the font families installed under Appearance → Fonts, checks every face
 * file (local, inside the fonts directory, an allowed format whose bytes match its
 * extension, within the size limit), reads licence metadata from the font's name
 * table where the format allows, and builds @font-face data for chosen families.
 * Nothing is fetched from another host.
 *
 * @package Blixis\Blocks
 */

declare(strict_types=1);

namespace Blixis\Blocks\Fonts;

use function Blixis\Blocks\Tokens\token_map;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Largest accepted face file. */
const MAX_FACE_BYTES = 2 * 1024 * 1024;

/** Allowed formats, by file extension, with their CSS format() names. */
const FORMATS = array(
	'woff2' => 'woff2',
	'woff'  => 'woff',
	'ttf'   => 'truetype',
	'otf'   => 'opentype',
);

/**
 * Format of font bytes from their signature, or null.
 *
 * @param string $head First bytes of the file.
 */
function sniff( string $head ): ?string {
	$tag = substr( $head, 0, 4 );
	return match ( true ) {
		'wOF2' === $tag                  => 'woff2',
		'wOFF' === $tag                  => 'woff',
		"\x00\x01\x00\x00" === $tag, 'true' === $tag => 'ttf',
		'OTTO' === $tag                  => 'otf',
		default                          => null,
	};
}

/**
 * Read name-table strings (copyright 0, licence 13, licence URL 14) from SFNT bytes.
 *
 * @param string $name Raw name table.
 * @return array<int, string>
 */
function parse_name_table( string $name ): array {
	$out = array();
	if ( strlen( $name ) < 6 ) {
		return $out;
	}
	$header = unpack( 'nformat/ncount/noffset', $name );
	for ( $i = 0; $i < $header['count']; $i++ ) {
		$record = substr( $name, 6 + $i * 12, 12 );
		if ( strlen( $record ) < 12 ) {
			break;
		}
		$r = unpack( 'nplatform/nencoding/nlanguage/nid/nlength/noffset', $record );
		if ( ! in_array( $r['id'], array( 0, 13, 14 ), true ) || isset( $out[ $r['id'] ] ) ) {
			continue;
		}
		$raw = substr( $name, $header['offset'] + $r['offset'], $r['length'] );
		// Windows and Unicode platforms store UTF-16BE; Macintosh Roman is close enough to ASCII here.
		$text = in_array( $r['platform'], array( 0, 3 ), true ) ? mb_convert_encoding( $raw, 'UTF-8', 'UTF-16BE' ) : $raw;
		$text = trim( (string) preg_replace( '/\s+/u', ' ', (string) $text ) );
		if ( '' !== $text && preg_match( '//u', $text ) ) {
			$out[ $r['id'] ] = $text;
		}
	}
	return $out;
}

/**
 * Find the name table in TrueType, OpenType, or WOFF bytes. WOFF2 needs Brotli and is not read.
 *
 * @param string $bytes  File bytes.
 * @param string $format Sniffed format.
 * @return string|null Raw name table.
 */
function name_table( string $bytes, string $format ): ?string {
	if ( 'ttf' === $format || 'otf' === $format ) {
		$count = unpack( 'n', substr( $bytes, 4, 2 ) )[1] ?? 0;
		for ( $i = 0; $i < $count; $i++ ) {
			$entry = substr( $bytes, 12 + $i * 16, 16 );
			if ( strlen( $entry ) < 16 ) {
				return null;
			}
			$e = unpack( 'a4tag/Nsum/Noffset/Nlength', $entry );
			if ( 'name' === $e['tag'] ) {
				return substr( $bytes, $e['offset'], $e['length'] );
			}
		}
		return null;
	}
	if ( 'woff' === $format ) {
		$count = unpack( 'n', substr( $bytes, 12, 2 ) )[1] ?? 0;
		for ( $i = 0; $i < $count; $i++ ) {
			$entry = substr( $bytes, 44 + $i * 20, 20 );
			if ( strlen( $entry ) < 20 ) {
				return null;
			}
			$e = unpack( 'a4tag/Noffset/NcompLength/NorigLength/Nsum', $entry );
			if ( 'name' === $e['tag'] ) {
				$data = substr( $bytes, $e['offset'], $e['compLength'] );
				if ( $e['compLength'] === $e['origLength'] ) {
					return $data;
				}
				// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- Corrupt data must not warn.
				$inflated = @gzuncompress( $data );
				return is_string( $inflated ) ? $inflated : null;
			}
		}
	}
	return null;
}

/**
 * Check one face file.
 *
 * @param string $path Absolute path.
 * @return array{format: ?string, bytes: int, copyright: ?string, license: ?string, license_url: ?string, errors: list<string>}
 */
function inspect_file( string $path ): array {
	$result = array(
		'format'      => null,
		'bytes'       => 0,
		'copyright'   => null,
		'license'     => null,
		'license_url' => null,
		'errors'      => array(),
	);
	if ( ! is_file( $path ) || ! is_readable( $path ) ) {
		$result['errors'][] = 'missing';
		return $result;
	}
	$result['bytes'] = (int) filesize( $path );
	$extension       = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
	if ( ! isset( FORMATS[ $extension ] ) ) {
		$result['errors'][] = 'extension';
	}
	if ( $result['bytes'] > MAX_FACE_BYTES ) {
		$result['errors'][] = 'too_large';
		return $result;
	}
	// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local file inside the fonts directory.
	$bytes            = (string) file_get_contents( $path );
	$result['format'] = sniff( $bytes );
	if ( null === $result['format'] ) {
		$result['errors'][] = 'not_a_font';
		return $result;
	}
	if ( isset( FORMATS[ $extension ] ) && $result['format'] !== $extension ) {
		$result['errors'][] = 'type_mismatch';
	}
	$table = name_table( $bytes, $result['format'] );
	if ( null !== $table ) {
		$names                 = parse_name_table( $table );
		$result['copyright']   = $names[0] ?? null;
		$result['license']     = $names[13] ?? null;
		$result['license_url'] = $names[14] ?? null;
	}
	return $result;
}

/**
 * Path of a face URL inside the WordPress fonts directory, or null.
 *
 * @param string $url Face src URL.
 */
function local_path( string $url ): ?string {
	$dir  = wp_get_font_dir();
	$base = trailingslashit( (string) $dir['baseurl'] );
	if ( ! str_starts_with( set_url_scheme( $url, 'http' ), set_url_scheme( $base, 'http' ) ) ) {
		return null;
	}
	$relative = rawurldecode( substr( set_url_scheme( $url, 'http' ), strlen( set_url_scheme( $base, 'http' ) ) ) );
	$root     = realpath( (string) $dir['basedir'] );
	$path     = realpath( (string) $dir['basedir'] . '/' . $relative );
	if ( false === $root || false === $path || ! str_starts_with( $path, $root . DIRECTORY_SEPARATOR ) ) {
		return null;
	}
	return $path;
}

/**
 * Whether a family name is allowed as a token value (contract font grammar, not generic).
 *
 * @param string $name Family name.
 */
function token_name_ok( string $name ): bool {
	$map = token_map();
	if ( in_array( $name, $map['fontGenerics'], true ) ) {
		return false;
	}
	return 1 === preg_match( '~' . str_replace( '~', '\~', (string) $map['grammars']['font'] ) . '~D', $name );
}

/**
 * Font families installed in the WordPress Font Library, each checked.
 *
 * @return list<array{name: string, slug: string, usable: bool, license: string, license_url: string, copyright: string, faces: list<array<string, mixed>>, problems: list<string>}>
 */
function installed_families(): array {
	$out   = array();
	$posts = get_posts(
		array(
			'post_type'      => 'wp_font_family',
			'post_status'    => 'publish',
			'posts_per_page' => 100,
			'orderby'        => 'title',
			'order'          => 'ASC',
		)
	);
	foreach ( $posts as $post ) {
		$settings = json_decode( (string) $post->post_content, true );
		$name     = trim( (string) ( $post->post_title ? $post->post_title : ( $settings['name'] ?? '' ) ) );
		$family   = array(
			'name'        => $name,
			'slug'        => (string) $post->post_name,
			'usable'      => false,
			'license'     => '',
			'license_url' => '',
			'copyright'   => '',
			'faces'       => array(),
			'problems'    => array(),
		);
		if ( ! token_name_ok( $name ) ) {
			$family['problems'][] = 'name';
		}
		$faces = get_posts(
			array(
				'post_type'      => 'wp_font_face',
				'post_parent'    => $post->ID,
				'post_status'    => 'publish',
				'posts_per_page' => 50,
				'orderby'        => 'ID',
				'order'          => 'ASC',
			)
		);
		if ( ! $faces ) {
			$family['problems'][] = 'no_faces';
		}
		foreach ( $faces as $face ) {
			$data = json_decode( (string) $face->post_content, true );
			$srcs = (array) ( $data['src'] ?? array() );
			$info = array(
				'weight' => (string) ( $data['fontWeight'] ?? '400' ),
				'style'  => (string) ( $data['fontStyle'] ?? 'normal' ),
				'url'    => '',
				'errors' => array(),
			);
			$src  = is_string( $srcs[0] ?? null ) ? $srcs[0] : '';
			$path = '' === $src ? null : local_path( $src );
			if ( null === $path ) {
				$info['errors'][] = 'not_local';
			} else {
				$file           = inspect_file( $path );
				$info['url']    = $src;
				$info['format'] = $file['format'];
				$info['bytes']  = $file['bytes'];
				$info['errors'] = $file['errors'];
				foreach ( array( 'license', 'license_url', 'copyright' ) as $key ) {
					if ( '' === $family[ $key ] && null !== $file[ $key ] ) {
						$family[ $key ] = $file[ $key ];
					}
				}
			}
			if ( $info['errors'] ) {
				$family['problems'][] = 'face';
			}
			$family['faces'][] = $info;
		}
		$family['problems'] = array_values( array_unique( $family['problems'] ) );
		$family['usable']   = ! $family['problems'];
		$out[]              = $family;
	}
	return $out;
}

/**
 * Names of usable installed families.
 *
 * @return list<string>
 */
function usable_names(): array {
	$names = array();
	foreach ( installed_families() as $family ) {
		if ( $family['usable'] ) {
			$names[] = $family['name'];
		}
	}
	return $names;
}

/**
 * @font-face data for the installed families a config uses, in the shape of wp_print_font_faces().
 *
 * @param array<string, mixed> $config Validated config.
 * @return array<string, list<array<string, mixed>>>
 */
function font_faces_for( array $config ): array {
	$wanted = array_values( array_unique( array_map( 'strval', (array) ( $config['fonts'] ?? array() ) ) ) );
	$out    = array();
	foreach ( installed_families() as $family ) {
		if ( ! $family['usable'] || ! in_array( $family['name'], $wanted, true ) ) {
			continue;
		}
		foreach ( $family['faces'] as $face ) {
			$out[ $family['name'] ][] = array(
				'font-family'  => $family['name'],
				'src'          => array( $face['url'] ),
				'font-weight'  => $face['weight'],
				'font-style'   => $face['style'],
				'font-display' => 'swap',
			);
		}
	}
	return $out;
}

/**
 * Print @font-face rules for the installed families a config uses. Task 03-05 hooks this
 * when it applies a stored configuration.
 *
 * @param array<string, mixed> $config Validated config.
 */
function print_font_faces_for( array $config ): void {
	$faces = font_faces_for( $config );
	if ( $faces ) {
		wp_print_font_faces( $faces );
	}
}
