<?php
/** Render validated layout settings into Base template parts. */

declare(strict_types=1);

namespace Blixis\Blocks\Layout;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Add a CSS class to the first rendered element. */
function add_class( string $html, string $class_name ): string {
	return preg_replace_callback(
		'/^\s*<([a-z][a-z0-9:-]*)(\s[^>]*)?>/i',
		static function ( array $matches ) use ( $class_name ): string {
			$tag        = $matches[1];
			$attributes = $matches[2] ?? '';
			if ( preg_match( '/\bclass=(["\'])(.*?)\1/i', $attributes, $found ) ) {
				$attributes = preg_replace( '/\bclass=(["\'])(.*?)\1/i', 'class=' . $found[1] . esc_attr( trim( $found[2] . ' ' . $class_name ) ) . $found[1], $attributes, 1 );
			} else {
				$attributes .= ' class="' . esc_attr( $class_name ) . '"';
			}
			return '<' . $tag . $attributes . '>';
		},
		$html,
		1
	) ?? $html;
}

/** Render a core block from a trusted block name and validated attributes. */
function core_block( string $name, array $attributes ): string {
	$encoded = wp_json_encode( $attributes, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT );
	$block   = parse_blocks( '<!-- wp:' . $name . ' ' . $encoded . ' /-->' )[0] ?? null;
	return is_array( $block ) ? render_block( $block ) : '';
}

/** Serialize and render a core Button with its static inner markup. */
function render_button( string $text, string $url ): string {
	$link   = '<a class="wp-block-button__link blixis-header__cta wp-element-button" href="' . esc_url( $url ) . '">' . esc_html( $text ) . '</a>';
	$button = array(
		'blockName'    => 'core/button',
		'attrs'        => array(),
		'innerBlocks'  => array(),
		'innerHTML'    => '<div class="wp-block-button">' . $link . '</div>',
		'innerContent' => array( '<div class="wp-block-button">' . $link . '</div>' ),
	);
	return do_blocks( serialize_block( $button ) );
}

/** Output config text and links with the appropriate WordPress escaping. */
function footer_html( array $config ): string {
	$footer  = $config['footer'];
	$columns = (int) $footer['columns'];
	$parts   = array();
	$parts[] = '<div class="blixis-footer__info">' . core_block( 'site-title', array( 'level' => 0 ) ) . core_block( 'site-tagline', array() ) . '</div>';
	$parts[] = '<nav class="blixis-footer__menu" aria-label="' . esc_attr__( 'Footer', 'blixis-blocks' ) . '">' . core_block( 'page-list', array() ) . '</nav>';
	if ( '' !== $footer['contact'] ) {
		$parts[] = '<div class="blixis-footer__contact"><p>' . nl2br( esc_html( $footer['contact'] ) ) . '</p></div>';
	} else {
		$parts[] = '<div class="blixis-footer__contact"></div>';
	}
	$social = '';
	foreach ( $footer['social'] as $link ) {
		$social .= '<li><a href="' . esc_url( $link['url'] ) . '">' . esc_html( ucfirst( $link['service'] ) ) . '</a></li>';
	}
	$parts[] = '<div class="blixis-footer__social">' . ( '' !== $social ? '<ul>' . $social . '</ul>' : '' ) . '</div>';
	$html    = '<div class="blixis-footer__columns">' . implode( '', array_slice( $parts, 0, $columns ) ) . '</div>';
	if ( $footer['copyright']['enabled'] ) {
		$text  = str_replace( array( '{year}', '{site}' ), array( gmdate( 'Y' ), get_bloginfo( 'name' ) ), $footer['copyright']['text'] );
		$html .= '<p class="blixis-footer__copyright">' . esc_html( $text ) . '</p>';
	}
	if ( $footer['backToTop'] ) {
		$html .= '<p><a class="blixis-footer__top" href="#top">' . esc_html__( 'Back to top', 'blixis-blocks' ) . '</a></p>';
	}
	return $html;
}

/** Modify Base's header/footer template part output only when a config applies. */
function render_template_part( string $content, array $block ): string {
	$config = effective_config();
	if ( null === $config || 'core/template-part' !== ( $block['blockName'] ?? '' ) ) {
		return $content;
	}
	$slug = $block['attrs']['slug'] ?? '';
	if ( 'header' === $slug ) {
		$header  = $config['header'];
		$classes = array( 'blixis-header' );
		if ( $header['sticky'] ) {
			$classes[] = 'is-sticky';
		}
		if ( $header['usp']['enabled'] ) {
			$classes[] = 'has-usp';
		}
		if ( 'center' === $header['logo'] ) {
			$classes[] = 'logo-center';
		}
		$content = add_class( $content, implode( ' ', $classes ) );
		$content = preg_replace( '/^(\s*<header\b)(?![^>]*\bid=)/i', '$1 id="top"', $content, 1 ) ?? $content;
		if ( $header['usp']['enabled'] ) {
			$items = '';
			foreach ( $header['usp']['items'] as $item ) {
				$items .= '<li class="blixis-usp__item"><span aria-hidden="true">✓</span> ' . esc_html( $item ) . '</li>';
			}
			$content = '<div class="blixis-usp"><ul class="blixis-usp__list">' . $items . '</ul></div>' . $content;
		}
		if ( $header['cta']['enabled'] ) {
			$cta     = render_button( $header['cta']['text'], $header['cta']['url'] );
			$content = preg_replace( '/<\/header>\s*$/', $cta . '</header>', $content ) ?? $content;
		}
		if ( $header['search'] ) {
			$content = preg_replace( '/<\/header>\s*$/', core_block( 'search', array(
				'label'      => __( 'Search', 'blixis-blocks' ),
				'showLabel'  => true,
				'buttonText' => __( 'Search', 'blixis-blocks' ),
			) ) . '</header>', $content ) ?? $content;
		}
		return $content;
	}
	if ( 'footer' === $slug ) {
		$classes = 'blixis-footer cols-' . (int) $config['footer']['columns'];
		$content = add_class( $content, $classes );
		$inner   = footer_html( $config );
		$content = preg_replace( '/(<footer\b[^>]*>).*?(<\/footer>\s*)$/s', '$1' . str_replace( '$', '\\$', $inner ) . '$2', $content ) ?? $content;
		return $content;
	}
	return $content;
}

/** Adjust core Navigation attributes and add the settings stylesheet. */
function navigation_attributes( array $block ): array {
	$config = effective_config();
	if ( null !== $config && 'core/navigation' === ( $block['blockName'] ?? '' ) ) {
		$block['attrs']['overlayMenu'] = $config['header']['mobileMenu'];
	}
	return $block;
}

function enqueue_layout_styles(): void {
	if ( null === effective_config() ) {
		return;
	}
	wp_enqueue_style( 'blixis-layout', plugins_url( '../../assets/layout.css', __FILE__ ), array(), '1.0.0' );
	if ( effective_config()['header']['sticky'] ) {
		wp_add_inline_style( 'blixis-layout', 'html{scroll-padding-top:calc(var(--wp-admin--admin-bar--height,0px) + var(--blixis-header-height,6rem))}' );
	}
	if ( effective_config()['footer']['stickToBottom'] ) {
		wp_add_inline_style( 'blixis-layout', 'body{min-height:100vh}.wp-site-blocks{min-height:100vh;display:flex;flex-direction:column}.wp-site-blocks>main{flex:1}' );
	}
}

/** Add the explicit layout class to the document body when the footer is flexed. */
function body_classes( array $classes ): array {
	$config = effective_config();
	if ( null !== $config && $config['footer']['stickToBottom'] ) {
		$classes[] = 'blixis-footer-bottom';
	}
	return $classes;
}

add_filter( 'render_block', __NAMESPACE__ . '\\render_template_part', 20, 2 );
add_filter( 'render_block_data', __NAMESPACE__ . '\\navigation_attributes', 20, 2 );
add_filter( 'body_class', __NAMESPACE__ . '\\body_classes' );
add_action( 'wp_enqueue_scripts', __NAMESPACE__ . '\\enqueue_layout_styles', 30 );
