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

/** The inline check icon of a USP item: decorative, no request, inherits the text colour. */
function check_icon(): string {
	return '<svg class="blixis-usp__icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
}

/** Render a core block from grammar with inner blocks, through core's own render functions. */
function core_block_tree( string $name, array $attributes, string $before, array $children, string $after ): string {
	$block = array(
		'blockName'    => $name,
		'attrs'        => $attributes,
		'innerBlocks'  => $children,
		'innerHTML'    => $before . $after,
		'innerContent' => array_merge( array( $before ), array_fill( 0, count( $children ), null ), array( $after ) ),
	);
	return do_blocks( serialize_block( $block ) );
}

/** A dynamic core block as a parsed block, for use as an inner block. */
function leaf( string $name, array $attributes = array() ): array {
	return array(
		'blockName'    => $name,
		'attrs'        => $attributes,
		'innerBlocks'  => array(),
		'innerHTML'    => '',
		'innerContent' => array(),
	);
}

/** The header row: brand, primary navigation, then search and the call-to-action button. */
function header_bar( array $config ): string {
	$header  = $config['header'];
	$nav     = core_block_tree(
		'core/navigation',
		array(
			'overlayMenu' => $header['mobileMenu'],
			'ariaLabel'   => __( 'Primary', 'blixis-blocks' ),
			'layout'      => array(
				'type'           => 'flex',
				'justifyContent' => 'left',
			),
		),
		'',
		array( leaf( 'core/page-list' ) ),
		''
	);
	$actions = '';
	if ( $header['search'] ) {
		$actions .= core_block(
			'search',
			array(
				'label'          => __( 'Search', 'blixis-blocks' ),
				'showLabel'      => false,
				'placeholder'    => __( 'Search', 'blixis-blocks' ),
				'buttonUseIcon'  => true,
				'buttonPosition' => 'button-inside',
				'width'          => 13,
				'widthUnit'      => 'rem',
			)
		);
	}
	if ( $header['cta']['enabled'] ) {
		$actions .= '<div class="blixis-header__cta-wrap">' . render_button( $header['cta']['text'], $header['cta']['url'] ) . '</div>';
	}
	return '<div class="blixis-header__bar"><div class="blixis-header__brand">' . core_block( 'site-title', array( 'level' => 0 ) ) . '</div>' . $nav
		. ( '' !== $actions ? '<div class="blixis-header__actions">' . $actions . '</div>' : '' ) . '</div>';
}

/** Core social links for the configured services: icons and names come from core, no requests. */
function social_links( array $links ): string {
	$children = array();
	foreach ( $links as $link ) {
		$service = 'other' === $link['service'] ? 'chain' : $link['service'];
		$attrs   = array(
			'url'     => $link['url'],
			'service' => $service,
		);
		if ( 'other' === $link['service'] ) {
			$attrs['label'] = __( 'Other', 'blixis-blocks' );
		}
		$children[] = leaf( 'core/social-link', $attrs );
	}
	return core_block_tree(
		'core/social-links',
		array( 'className' => 'is-style-logos-only' ),
		'<ul class="wp-block-social-links is-style-logos-only">',
		$children,
		'</ul>'
	);
}

/** Output config text and links with the appropriate WordPress escaping. */
function footer_html( array $config ): string {
	$footer  = $config['footer'];
	$columns = (int) $footer['columns'];
	$heading = static fn( string $text ): string => '<h2 class="blixis-footer__heading">' . esc_html( $text ) . '</h2>';
	$pages   = core_block( 'page-list', array() );
	if ( '' === trim( wp_strip_all_tags( $pages ) ) ) {
		$pages = '<ul class="wp-block-page-list"><li class="wp-block-pages-list__item"><a href="' . esc_url( home_url( '/' ) ) . '">' . esc_html__( 'Home', 'blixis-blocks' ) . '</a></li></ul>';
	}
	$parts   = array();
	$parts[] = '<section class="blixis-footer__info">' . $heading( __( 'Site', 'blixis-blocks' ) ) . core_block( 'site-title', array( 'level' => 0 ) ) . core_block( 'site-tagline', array() ) . '</section>';
	$parts[] = '<nav class="blixis-footer__menu" aria-label="' . esc_attr__( 'Footer', 'blixis-blocks' ) . '">' . $heading( __( 'Menu', 'blixis-blocks' ) ) . $pages . '</nav>';
	$parts[] = '<section class="blixis-footer__contact">' . $heading( __( 'Contact', 'blixis-blocks' ) ) . ( '' !== $footer['contact'] ? '<p>' . nl2br( esc_html( $footer['contact'] ) ) . '</p>' : '' ) . '</section>';
	$parts[] = '<section class="blixis-footer__social">' . $heading( __( 'Follow us', 'blixis-blocks' ) ) . ( $footer['social'] ? social_links( $footer['social'] ) : '' ) . '</section>';
	$html    = '<div class="blixis-footer__inner"><div class="blixis-footer__columns">' . implode( '', array_slice( $parts, 0, $columns ) ) . '</div>';
	$bottom  = '';
	if ( $footer['copyright']['enabled'] ) {
		$text    = str_replace( array( '{year}', '{site}' ), array( gmdate( 'Y' ), get_bloginfo( 'name' ) ), $footer['copyright']['text'] );
		$bottom .= '<p class="blixis-footer__copyright">' . esc_html( $text ) . '</p>';
	}
	if ( $footer['backToTop'] ) {
		$bottom .= '<p class="blixis-footer__totop"><a class="blixis-footer__top" href="#top">' . esc_html__( 'Back to top', 'blixis-blocks' ) . '</a></p>';
	}
	if ( '' !== $bottom ) {
		$html .= '<div class="blixis-footer__bottom">' . $bottom . '</div>';
	}
	return $html . '</div>';
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
		// The header row is rebuilt from core blocks; Base's template part stays as it is.
		$content = preg_replace( '/(<header\b[^>]*>).*?(<\/header>\s*)$/s', '$1' . str_replace( array( '\\', '$' ), array( '\\\\', '\\$' ), header_bar( $config ) ) . '$2', $content ) ?? $content;
		if ( $header['usp']['enabled'] ) {
			$items = '';
			foreach ( $header['usp']['items'] as $item ) {
				$items .= '<li class="blixis-usp__item">' . check_icon() . '<span>' . esc_html( $item ) . '</span></li>';
			}
			$content = '<div class="blixis-usp"><ul class="blixis-usp__list">' . $items . '</ul></div>' . $content;
		}
		return $content;
	}
	if ( 'footer' === $slug ) {
		$classes = 'blixis-footer cols-' . (int) $config['footer']['columns'];
		$content = add_class( $content, $classes );
		$inner   = footer_html( $config );
		$content = preg_replace( '/(<footer\b[^>]*>).*?(<\/footer>\s*)$/s', '$1' . str_replace( array( '\\', '$' ), array( '\\\\', '\\$' ), $inner ) . '$2', $content ) ?? $content;
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
	$config = effective_config();
	if ( null === $config ) {
		return;
	}
	wp_enqueue_style( 'blixis-layout', plugins_url( '../../assets/layout.css', __FILE__ ), array(), (string) filemtime( __DIR__ . '/../../assets/layout.css' ) );
	if ( $config['header']['sticky'] ) {
		// The header height follows its content, so anchors and focus stay below it.
		wp_register_script( 'blixis-layout', false, array(), '1.0.0', array( 'in_footer' => true ) );
		wp_enqueue_script( 'blixis-layout' );
		wp_add_inline_script( 'blixis-layout', '(function(){var h=document.querySelector(".blixis-header.is-sticky");if(!h){return;}var s=function(){document.documentElement.style.setProperty("--blixis-header-height",h.offsetHeight+"px");};s();if(window.ResizeObserver){new ResizeObserver(s).observe(h);}else{window.addEventListener("resize",s);}})();' );
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
