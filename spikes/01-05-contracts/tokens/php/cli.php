<?php
/**
 * Plain PHP entry point for the node tests. Reads a JSON array of base64 inputs on stdin
 * and prints the validator and generator results. Throwaway proof for task 01-05.
 */

declare(strict_types=1);

$lib = dirname( __DIR__ ) . '/wp/plugins/blixis-tokens-lib/';
require $lib . 'validate.php';
require $lib . 'generate.php';
require $lib . 'render.php';

$command = $argv[1] ?? 'validate';
$input   = json_decode( (string) file_get_contents( 'php://stdin' ), true, 16, JSON_THROW_ON_ERROR );
$out     = array();

if ( 'validate' === $command ) {
	foreach ( $input as $encoded ) {
		$result = blixis_validate_bytes( (string) base64_decode( $encoded, true ) );
		$row    = array(
			'ok'     => $result['ok'],
			'errors' => $result['errors'],
		);
		if ( $result['ok'] ) {
			$row['canonical'] = blixis_canonical_json( $result['config'] );
			$row['hash']      = blixis_config_hash( $result['config'] );
			$row['css']       = blixis_generate_css( $result['config'] );
			$row['themeJson'] = blixis_canonical_json( blixis_generate_theme_json( $result['config'] ) );
			$row['cssKey']    = blixis_css_cache_key( $result['config'] );
		}
		$out[] = $row;
	}
} elseif ( 'resolve-responsive' === $command ) {
	foreach ( $input as $case ) {
		$resolved = blixis_resolve_responsive( $case['base'], $case['overrides'] );
		$out[]    = array(
			'resolved' => $resolved,
			'classes'  => implode( ' ', blixis_responsive_classes( $case['prop'], $resolved ) ),
		);
	}
} elseif ( 'cache-keys' === $command ) {
	foreach ( $input as $case ) {
		$out[] = array(
			'fragment' => blixis_fragment_cache_key( $case ),
			'page'     => blixis_page_cache_key( $case ),
		);
	}
}

// phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode, WordPress.Security.EscapeOutput.OutputNotEscaped -- CLI test output.
echo json_encode( $out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR );
