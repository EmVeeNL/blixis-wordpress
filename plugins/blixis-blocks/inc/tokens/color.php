<?php
/**
 * Colour parsing and contrast for token contract v2 (task 03-06).
 *
 * Pure PHP, no WordPress calls. Understands the four stored formats (hex, rgb(), hsl(),
 * oklch()) in the contract's modern space-separated syntax. The TypeScript twin is
 * packages/tokens/src/color.ts and must give the same results.
 *
 * @package Blixis\Blocks
 */

declare(strict_types=1);

namespace Blixis\Blocks\Tokens;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Parses a colour that already matched the contract grammar and checks component ranges.
 *
 * @param string $value Colour text.
 * @return array{space: string, c: array<int, float>, alpha: float}|null Null when malformed or out of range.
 */
function parse_color( string $value ): ?array {
	if ( 1 === preg_match( '/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/D', $value, $m ) ) {
		$hex = $m[1];
		if ( 3 === strlen( $hex ) ) {
			$hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
		}
		$alpha = 8 === strlen( $hex ) ? hexdec( substr( $hex, 6, 2 ) ) / 255 : 1.0;
		return array(
			'space' => 'rgb',
			'c'     => array( (float) hexdec( substr( $hex, 0, 2 ) ), (float) hexdec( substr( $hex, 2, 2 ) ), (float) hexdec( substr( $hex, 4, 2 ) ) ),
			'alpha' => (float) $alpha,
		);
	}
	if ( 1 !== preg_match( '/^(rgb|hsl|oklch)\((.*)\)$/D', $value, $m ) ) {
		return null;
	}
	$ranges = token_map()['colorRanges'];
	$space  = $m[1];
	$parts  = explode( ' / ', $m[2] );
	if ( count( $parts ) > 2 ) {
		return null;
	}
	$comps = explode( ' ', $parts[0] );
	if ( 3 !== count( $comps ) ) {
		return null;
	}
	$alpha = 1.0;
	if ( isset( $parts[1] ) ) {
		$alpha = color_component( $parts[1], $ranges['alphaNumber'], $ranges['percent'], 1.0 );
		if ( null === $alpha ) {
			return null;
		}
	}
	$out = array();
	if ( 'rgb' === $space ) {
		foreach ( $comps as $comp ) {
			$v = color_component( $comp, $ranges['rgbNumber'], $ranges['percent'], 255.0 );
			if ( null === $v ) {
				return null;
			}
			$out[] = $v;
		}
	} elseif ( 'hsl' === $space ) {
		$h = color_component( $comps[0], $ranges['hue'], null, 1.0 );
		$s = color_component( $comps[1], null, $ranges['percent'], 1.0 );
		$l = color_component( $comps[2], null, $ranges['percent'], 1.0 );
		if ( null === $h || null === $s || null === $l ) {
			return null;
		}
		$out = array( $h, $s, $l );
	} else {
		$lightness = color_component( $comps[0], $ranges['oklchLightness'], $ranges['percent'], 1.0 );
		$chroma    = color_component( $comps[1], $ranges['oklchChroma'], null, 1.0 );
		$hue       = color_component( $comps[2], $ranges['hue'], null, 1.0 );
		if ( null === $lightness || null === $chroma || null === $hue ) {
			return null;
		}
		$out = array( $lightness, $chroma, $hue );
	}
	return array(
		'space' => $space,
		'c'     => $out,
		'alpha' => $alpha,
	);
}

/**
 * Parses one number or percentage and checks its range.
 *
 * A percentage p becomes p / 100 * $full, so 100% is $full (255 for an rgb channel, 1 for
 * alpha, saturation, lightness). A plain number is returned as is.
 *
 * @param string                                     $text    Component text.
 * @param array{min: float|int, max: float|int}|null $number  Range for a plain number, or null when a number is not allowed.
 * @param array{min: float|int, max: float|int}|null $percent Range for a percentage, or null when a percentage is not allowed.
 * @param float                                      $full    Value of 100%.
 * @return float|null
 */
function color_component( string $text, ?array $number, ?array $percent, float $full ): ?float {
	if ( str_ends_with( $text, '%' ) ) {
		if ( null === $percent ) {
			return null;
		}
		$v = (float) substr( $text, 0, -1 );
		if ( $v < $percent['min'] || $v > $percent['max'] ) {
			return null;
		}
		return $v / 100.0 * $full;
	}
	if ( null === $number ) {
		return null;
	}
	$v = (float) $text;
	if ( $v < $number['min'] || $v > $number['max'] ) {
		return null;
	}
	return $v;
}

/**
 * Whether a string is a colour in one of the four formats with every component in range.
 *
 * @param string $value Candidate.
 * @return bool
 */
function color_valid( string $value ): bool {
	return grammar_matches( token_map()['grammars']['color'], $value ) && null !== parse_color( $value );
}

/**
 * Converts a parsed colour to gamma-encoded sRGB in [0, 1], clipping out-of-gamut oklch.
 *
 * @param string $value Valid colour.
 * @return array{0: float, 1: float, 2: float, 3: float}|null Red, green, blue, alpha.
 */
function to_srgb( string $value ): ?array {
	$p = parse_color( $value );
	if ( null === $p ) {
		return null;
	}
	$c = $p['c'];
	if ( 'rgb' === $p['space'] ) {
		return array( $c[0] / 255.0, $c[1] / 255.0, $c[2] / 255.0, $p['alpha'] );
	}
	if ( 'hsl' === $p['space'] ) {
		$l = $c[2];
		$k = $c[1] * min( $l, 1.0 - $l );
		$f = static function ( int $n ) use ( $c, $l, $k ): float {
			$x = fmod( $n + $c[0] / 30.0, 12.0 );
			return $l - $k * max( -1.0, min( $x - 3.0, 9.0 - $x, 1.0 ) );
		};
		return array( clamp01( $f( 0 ) ), clamp01( $f( 8 ) ), clamp01( $f( 4 ) ), $p['alpha'] );
	}
	// oklch to OKLab to linear sRGB, clipped to the gamut, then encoded.
	$rad = deg2rad( $c[2] );
	$a   = $c[1] * cos( $rad );
	$b   = $c[1] * sin( $rad );
	$l_  = $c[0] + 0.3963377774 * $a + 0.2158037573 * $b;
	$m_  = $c[0] - 0.1055613458 * $a - 0.0638541728 * $b;
	$s_  = $c[0] - 0.0894841775 * $a - 1.2914855480 * $b;
	$l   = $l_ ** 3;
	$m   = $m_ ** 3;
	$s   = $s_ ** 3;
	$lin = array(
		4.0767416621 * $l - 3.3077115913 * $m + 0.2309699292 * $s,
		-1.2684380046 * $l + 2.6097574011 * $m - 0.3413193965 * $s,
		-0.0041960863 * $l - 0.7034186147 * $m + 1.7076147010 * $s,
	);
	$enc = array();
	foreach ( $lin as $v ) {
		$v     = clamp01( $v );
		$enc[] = $v <= 0.0031308 ? 12.92 * $v : 1.055 * ( $v ** ( 1 / 2.4 ) ) - 0.055;
	}
	return array( $enc[0], $enc[1], $enc[2], $p['alpha'] );
}

/**
 * Clamps a number to [0, 1].
 *
 * @param float $v Number.
 * @return float
 */
function clamp01( float $v ): float {
	return max( 0.0, min( 1.0, $v ) );
}

/**
 * WCAG relative luminance of opaque gamma-encoded sRGB.
 *
 * @param array{0: float, 1: float, 2: float} $rgb Red, green, blue in [0, 1].
 * @return float
 */
function relative_luminance( array $rgb ): float {
	$lin = array();
	foreach ( array( $rgb[0], $rgb[1], $rgb[2] ) as $v ) {
		$lin[] = $v <= 0.04045 ? $v / 12.92 : ( ( $v + 0.055 ) / 1.055 ) ** 2.4;
	}
	return 0.2126 * $lin[0] + 0.7152 * $lin[1] + 0.0722 * $lin[2];
}

/**
 * WCAG contrast ratio of a foreground over a background.
 *
 * A translucent background is composited over white, then a translucent foreground over
 * that, in gamma-encoded sRGB as browsers do. oklch is clipped to sRGB.
 *
 * @param string $foreground Colour.
 * @param string $background Colour.
 * @return float|null Ratio from 1 to 21, or null when a colour is invalid.
 */
function contrast_ratio( string $foreground, string $background ): ?float {
	$fg = to_srgb( $foreground );
	$bg = to_srgb( $background );
	if ( null === $fg || null === $bg ) {
		return null;
	}
	$base = array();
	for ( $i = 0; $i < 3; $i++ ) {
		$base[ $i ] = $bg[3] * $bg[ $i ] + ( 1.0 - $bg[3] ) * 1.0;
	}
	$top = array();
	for ( $i = 0; $i < 3; $i++ ) {
		$top[ $i ] = $fg[3] * $fg[ $i ] + ( 1.0 - $fg[3] ) * $base[ $i ];
	}
	$l1 = relative_luminance( $top );
	$l2 = relative_luminance( $base );
	return ( max( $l1, $l2 ) + 0.05 ) / ( min( $l1, $l2 ) + 0.05 );
}

/**
 * Colours inside a validated shadow value.
 *
 * @param string $shadow Valid shadow, or none.
 * @return list<string>
 */
function shadow_colors( string $shadow ): array {
	if ( 'none' === $shadow ) {
		return array();
	}
	$out = array();
	foreach ( explode( ', ', $shadow ) as $layer ) {
		if ( str_starts_with( $layer, 'inset ' ) ) {
			$layer = substr( $layer, 6 );
		}
		$tokens = explode( ' ', $layer, 5 );
		if ( 5 === count( $tokens ) ) {
			$out[] = $tokens[4];
		}
	}
	return $out;
}
