<?php
/**
 * Theme setup wizard (task 03-03).
 *
 * Appearance → Blixis setup. A server-rendered, multi-step form: choose or create a
 * child theme, then set colours, typography, and layout tokens, review, and save.
 * Every step is validated on the server with the contract validator; invalid input
 * stays on screen with field errors. The draft is kept per user, so a reload, a
 * failed save, or a new session resumes where the user stopped.
 *
 * Saving stores the configuration only. Previewing and applying it to the site,
 * and rollback, belong to task 03-05.
 *
 * @package Blixis\Blocks
 */

declare(strict_types=1);

namespace Blixis\Blocks\Setup;

use function Blixis\Blocks\ChildTheme\create as create_child_theme;
use function Blixis\Blocks\Fonts\installed_families;
use function Blixis\Blocks\Fonts\usable_names;
use function Blixis\Blocks\Tokens\canonical_json;
use function Blixis\Blocks\Tokens\color_valid;
use function Blixis\Blocks\Tokens\scheme_get;
use function Blixis\Blocks\Tokens\scheme_save;
use function Blixis\Blocks\Tokens\store_read;
use function Blixis\Blocks\Tokens\store_rollback;
use function Blixis\Blocks\Tokens\store_write;
use function Blixis\Blocks\Tokens\token_map;
use function Blixis\Blocks\Tokens\validate_bytes;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const PAGE       = 'blixis-setup';
const ACTION     = 'blixis_setup';
const DRAFT_META = 'blixis_setup_draft';
const FLASH_META = 'blixis_setup_flash';
const NEW_THEME  = '__new';

/**
 * Wizard steps in order.
 *
 * @return array<string, string>
 */
function steps(): array {
	return array(
		'theme'      => __( 'Child theme', 'blixis-blocks' ),
		'colors'     => __( 'Colours', 'blixis-blocks' ),
		'typography' => __( 'Typography', 'blixis-blocks' ),
		'layout'     => __( 'Spacing and layout', 'blixis-blocks' ),
		'review'     => __( 'Review and save', 'blixis-blocks' ),
	);
}

/**
 * Token sections edited on each step.
 *
 * @return array<string, list<string>>
 */
function step_sections(): array {
	return array(
		'theme'      => array( 'theme' ),
		'colors'     => array( 'colors' ),
		'typography' => array( 'fonts', 'typeScale' ),
		'layout'     => array( 'spacing', 'radius', 'layout', 'shadows', 'motion' ),
		'review'     => array(),
	);
}

/**
 * Section headings.
 *
 * @return array<string, string>
 */
function section_labels(): array {
	return array(
		'colors'    => __( 'Colours', 'blixis-blocks' ),
		'fonts'     => __( 'Font families', 'blixis-blocks' ),
		'typeScale' => __( 'Type scale', 'blixis-blocks' ),
		'spacing'   => __( 'Spacing', 'blixis-blocks' ),
		'radius'    => __( 'Corner radius', 'blixis-blocks' ),
		'layout'    => __( 'Layout widths', 'blixis-blocks' ),
		'shadows'   => __( 'Shadows', 'blixis-blocks' ),
		'motion'    => __( 'Motion', 'blixis-blocks' ),
	);
}

/**
 * Hint shown under each field of a token kind.
 *
 * @param string $kind Token kind from the token map.
 * @param string $key  Token key; motion mixes durations and an easing.
 */
function hint( string $kind, string $key ): string {
	if ( 'motion' === $kind ) {
		$kind = 'easing' === $key ? 'easing' : 'duration';
	}
	return match ( $kind ) {
		'color'    => __( 'A colour as hex, rgb(), hsl(), or oklch(), such as #155dfc or oklch(0.55 0.2 260).', 'blixis-blocks' ),
		'font'     => __( 'A font family name, or a generic family such as system-ui.', 'blixis-blocks' ),
		'length'   => __( 'A length, such as 1rem.', 'blixis-blocks' ),
		'shadow'   => __( 'none, or a shadow such as 0 1px 2px 0 #0000001a.', 'blixis-blocks' ),
		'duration' => __( 'A duration in milliseconds, such as 200ms.', 'blixis-blocks' ),
		'easing'   => __( 'linear, ease, ease-in, ease-out, ease-in-out, or cubic-bezier().', 'blixis-blocks' ),
		default    => '',
	};
}

/**
 * Message for a validator error code.
 *
 * @param string $code Error code.
 */
function error_message( string $code ): string {
	return match ( $code ) {
		'field.required'        => __( 'This field is required.', 'blixis-blocks' ),
		'token.color.invalid'   => __( 'Enter a colour as hex, rgb(), hsl(), or oklch(), such as #155dfc or oklch(0.55 0.2 260).', 'blixis-blocks' ),
		'token.font.invalid'    => __( 'Use letters, digits, spaces, and hyphens, or a generic family such as system-ui.', 'blixis-blocks' ),
		'token.length.invalid'  => __( 'Enter a length such as 1rem, with a unit this field allows.', 'blixis-blocks' ),
		'token.shadow.invalid'  => __( 'Enter none, or a shadow such as 0 1px 2px 0 #0000001a.', 'blixis-blocks' ),
		'token.duration.invalid' => __( 'Enter a duration in milliseconds, such as 200ms.', 'blixis-blocks' ),
		'token.easing.invalid'  => __( 'Enter linear, ease, ease-in, ease-out, ease-in-out, or a cubic-bezier() value.', 'blixis-blocks' ),
		'invalid_slug', 'reserved_slug', 'blixis_child_exists' => __( 'Choose another slug: lowercase letters, digits, and single hyphens, not already used.', 'blixis-blocks' ),
		'required'              => __( 'This field is required.', 'blixis-blocks' ),
		'too_long'              => __( 'This value is too long.', 'blixis-blocks' ),
		'invalid_characters'    => __( 'Remove line breaks and the characters <, >, and */.', 'blixis-blocks' ),
		'font.not_installed'    => __( 'Choose a generic family or a font installed under Appearance → Fonts that passed the checks below.', 'blixis-blocks' ),
		default                 => __( 'This value is not allowed.', 'blixis-blocks' ),
	};
}

/**
 * Label for a token key: contentWidth → Content width, 2xl → 2XL.
 *
 * @param string $key Token key.
 */
function key_label( string $key ): string {
	if ( preg_match( '/^[0-9]?x[sl]$|^sm$|^md$|^lg$/', $key ) ) {
		return strtoupper( $key );
	}
	return ucfirst( strtolower( (string) preg_replace( '/(?<=[a-z])([A-Z])/', ' $1', $key ) ) );
}

/**
 * Starting configuration: the contract defaults with system fonts and no theme yet.
 *
 * @return array<string, mixed>
 */
function defaults(): array {
	// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local plugin file.
	$config                  = json_decode( (string) file_get_contents( __DIR__ . '/defaults.json' ), true, 16, JSON_THROW_ON_ERROR );
	$config['theme']['slug'] = '';
	return $config;
}

/**
 * The user's draft: config, the stored revision it started from, and completed steps.
 *
 * @param int $user User ID.
 * @return array{config: array<string, mixed>, base_revision: int, done: list<string>}
 */
function draft( int $user ): array {
	$raw   = get_user_meta( $user, DRAFT_META, true );
	$draft = is_string( $raw ) ? json_decode( $raw, true, 32 ) : null;
	if ( is_array( $draft ) && is_array( $draft['config'] ?? null ) && is_int( $draft['base_revision'] ?? null ) ) {
		$draft['done'] = array_values( array_intersect( (array) ( $draft['done'] ?? array() ), array_keys( steps() ) ) );
		return $draft;
	}
	$stored = store_read();
	return array(
		'config'        => $stored ? $stored['config'] : defaults(),
		'base_revision' => $stored ? $stored['revision'] : 0,
		'done'          => $stored ? array_keys( steps() ) : array(),
	);
}

/**
 * Persist the user's draft.
 *
 * @param int   $user  User ID.
 * @param array $draft Draft.
 */
function save_draft( int $user, array $draft ): void {
	update_user_meta( $user, DRAFT_META, wp_slash( (string) wp_json_encode( $draft ) ) );
}

/**
 * Child themes of Blixis Base installed on this site.
 *
 * @return array<string, string> Slug => name.
 */
function child_themes(): array {
	$out = array();
	foreach ( wp_get_themes() as $slug => $theme ) {
		if ( 'blixis-base' === $theme->get_template() && 'blixis-base' !== $slug ) {
			$out[ (string) $slug ] = (string) $theme->get( 'Name' );
		}
	}
	ksort( $out );
	return $out;
}

/**
 * Field id for a contract path such as /colors/primary.
 *
 * @param string $path Contract path.
 */
function field_id( string $path ): string {
	return 'blixis' . str_replace( '/', '-', strtolower( $path ) );
}

/**
 * URL of a wizard step.
 *
 * @param string $step Step key.
 */
function step_url( string $step ): string {
	return add_query_arg(
		array(
			'page' => PAGE,
			'step' => $step,
		),
		admin_url( 'themes.php' )
	);
}

add_action(
	'admin_menu',
	static function (): void {
		$hook = add_theme_page( __( 'Blixis setup', 'blixis-blocks' ), __( 'Blixis setup', 'blixis-blocks' ), 'edit_theme_options', PAGE, __NAMESPACE__ . '\\render' );
		if ( $hook ) {
			add_action(
				'admin_print_styles-' . $hook,
				static function (): void {
					wp_enqueue_style( 'blixis-setup', plugins_url( 'assets/setup.css', dirname( __DIR__ ) ), array(), (string) filemtime( dirname( __DIR__, 2 ) . '/assets/setup.css' ) );
					wp_enqueue_style( 'blixis-setup-controls', plugins_url( 'assets/setup-controls.css', dirname( __DIR__ ) ), array( 'blixis-setup' ), (string) filemtime( dirname( __DIR__, 2 ) . '/assets/setup-controls.css' ) );
					wp_add_inline_style( 'blixis-setup', admin_accent_fallback_css() );
				}
			);
			// The controls script enhances the plain fields; the wizard works without it (task 03-06).
			add_action(
				'admin_enqueue_scripts',
				static function ( string $suffix ) use ( $hook ): void {
					if ( $suffix === $hook ) {
						wp_enqueue_script(
							'blixis-setup',
							plugins_url( 'assets/setup.js', dirname( __DIR__ ) ),
							array(),
							(string) filemtime( dirname( __DIR__, 2 ) . '/assets/setup.js' ),
							array(
								'in_footer' => true,
								'strategy'  => 'defer',
							)
						);
					}
				}
			);
		}
	}
);

add_action( 'admin_post_' . ACTION, __NAMESPACE__ . '\\handle' );

/** Registered scheme fallback for core admin accent variables in non-standard admin pages. */
function admin_accent_fallback_css(): string {
	global $_wp_admin_css_colors;
	$scheme_name = get_user_option( 'admin_color' );
	$schemes     = is_array( $_wp_admin_css_colors ?? null ) ? $_wp_admin_css_colors : array();
	if ( empty( $scheme_name ) || ! isset( $schemes[ $scheme_name ] ) ) {
		$scheme_name = isset( $schemes['modern'] ) ? 'modern' : (string) array_key_first( $schemes );
	}
	$scheme = $schemes[ $scheme_name ] ?? null;
	$accent = is_object( $scheme ) && isset( $scheme->colors[1] ) ? sanitize_hex_color( (string) $scheme->colors[1] ) : '#3858e9';
	if ( ! $accent ) {
		$accent = '#3858e9';
	}
	$rgb    = sscanf( $accent, '#%02x%02x%02x' );
	$darker = is_array( $rgb ) && 3 === count( $rgb ) ? sprintf( '#%02x%02x%02x', (int) round( $rgb[0] * 0.9 ), (int) round( $rgb[1] * 0.9 ), (int) round( $rgb[2] * 0.9 ) ) : '#183ad6';

	return ':root{--blixis-admin-theme-color-fallback:' . esc_attr( $accent ) . ';--blixis-admin-theme-color-darker-fallback:' . esc_attr( $darker ) . '}';
}

/**
 * Render the current step.
 */
function render(): void {
	if ( ! current_user_can( 'edit_theme_options' ) ) {
		wp_die( esc_html__( 'Sorry, you are not allowed to set up this site.', 'blixis-blocks' ), '', array( 'response' => 403 ) );
	}
	$user  = get_current_user_id();
	$draft = draft( $user );
	$steps = steps();
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only navigation.
	$step = isset( $_GET['step'] ) ? sanitize_key( wp_unslash( $_GET['step'] ) ) : 'theme';
	if ( ! isset( $steps[ $step ] ) || ( 'theme' !== $step && '' === ( $draft['config']['theme']['slug'] ?? '' ) ) ) {
		$step = 'theme';
	}

	$flash = get_user_meta( $user, FLASH_META, true );
	delete_user_meta( $user, FLASH_META );
	$flash  = is_string( $flash ) ? json_decode( $flash, true ) : null;
	$flash  = is_array( $flash ) && ( $flash['step'] ?? '' ) === $step ? $flash : array();
	$errors = array();
	foreach ( (array) ( $flash['errors'] ?? array() ) as $error ) {
		$errors[ (string) $error['path'] ] = (string) $error['code'];
	}
	$values = (array) ( $flash['values'] ?? array() );

	$keys     = array_keys( $steps );
	$position = (int) array_search( $step, $keys, true );

	echo '<div class="wrap blixis-setup">';
	echo '<h1>' . esc_html__( 'Blixis setup', 'blixis-blocks' ) . '</h1>';
	echo '<p class="blixis-setup-intro">' . esc_html__( 'Choose a child theme of Blixis Base and set its design tokens. Saving applies them to the site while that child theme is active; you can preview before saving and roll back afterwards.', 'blixis-blocks' ) . '</p>';

	echo '<nav class="blixis-setup-progress" aria-label="' . esc_attr__( 'Setup progress', 'blixis-blocks' ) . '"><ol>';
	foreach ( $keys as $index => $key ) {
		$done      = in_array( $key, $draft['done'], true );
		$reachable = 'theme' === $key || '' !== ( $draft['config']['theme']['slug'] ?? '' );
		$number    = $index + 1;
		$state     = $done ? ' <span class="blixis-setup-state screen-reader-text">' . esc_html__( '(completed)', 'blixis-blocks' ) . '</span>' : '';
		/* translators: %d: current step number. */
		$number_label = sprintf( __( 'Step %d', 'blixis-blocks' ), $number );
		/* translators: %d: total number of steps. */
		$count_label = sprintf( __( 'of %d', 'blixis-blocks' ), count( $keys ) );
		/* translators: 1: step number, 2: total number of steps, 3: step name. */
		$accessible_label = sprintf( __( 'Step %1$d of %2$d: %3$s', 'blixis-blocks' ), $number, count( $keys ), $steps[ $key ] );
		echo '<li class="' . ( $key === $step ? 'is-current' : '' ) . ( $done ? ' is-done' : '' ) . '">';
		if ( $reachable ) {
			echo '<a href="' . esc_url( step_url( $key ) ) . '"' . ( $key === $step ? ' aria-current="step"' : '' ) . '><span class="blixis-setup-progress-dot" aria-hidden="true">' . ( $done ? '✓' : esc_html( (string) $number ) ) . '</span><span class="blixis-setup-progress-label"><span class="blixis-setup-progress-number">' . esc_html( $number_label ) . '<span class="blixis-setup-mobile-count"> ' . esc_html( $count_label ) . '</span></span><span class="blixis-setup-progress-name">' . esc_html( $steps[ $key ] ) . $state . '</span></span><span class="screen-reader-text">' . esc_html( $accessible_label ) . '</span></a>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $state is built from escaped parts.
		} else {
			echo '<span class="blixis-setup-progress-unavailable"><span class="blixis-setup-progress-dot" aria-hidden="true">' . esc_html( (string) $number ) . '</span><span class="blixis-setup-progress-label"><span class="blixis-setup-progress-number">' . esc_html( $number_label ) . '</span><span class="blixis-setup-progress-name">' . esc_html( $steps[ $key ] ) . '</span></span></span>';
		}
		echo '</li>';
	}
	echo '</ol></nav>';

	if ( ! empty( $flash['notice'] ) ) {
		echo '<div class="notice notice-success blixis-setup-notice" role="status"><p>' . esc_html( (string) $flash['notice'] ) . '</p></div>';
	}
	if ( ! empty( $flash['failure'] ) ) {
		echo '<div class="notice notice-error blixis-setup-notice" role="alert"><p>' . esc_html( (string) $flash['failure'] ) . '</p></div>';
	}
	if ( $errors ) {
		echo '<div id="blixis-setup-errors" class="blixis-setup-summary" role="alert" tabindex="-1">';
		echo '<h2>' . esc_html__( 'Correct the highlighted fields', 'blixis-blocks' ) . '</h2><ul>';
		foreach ( $errors as $path => $code ) {
			echo '<li><a href="#' . esc_attr( field_id( $path ) ) . '">' . esc_html( field_name( $path ) . ': ' . error_message( $code ) ) . '</a></li>';
		}
		echo '</ul></div>';
	}

	echo '<div class="blixis-setup-layout"><div class="blixis-setup-layout__form">';
	echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" class="blixis-setup-form">';
	echo '<input type="hidden" name="action" value="' . esc_attr( ACTION ) . '">';
	echo '<input type="hidden" name="step" value="' . esc_attr( $step ) . '">';
	wp_nonce_field( ACTION . '_' . $step );
	echo '<h2>' . esc_html( $steps[ $step ] ) . '</h2>';

	if ( 'theme' === $step ) {
		render_theme_step( $draft, $errors, $values );
	} elseif ( 'review' === $step ) {
		render_review( $draft );
	} else {
		render_step_sections( $step, $draft, $errors, $values );
	}
	render_enhancement_data( $draft, $step );

	echo '<div class="blixis-setup-actions">';
	if ( $position > 0 ) {
		echo '<a class="button blixis-btn blixis-btn--secondary" href="' . esc_url( step_url( $keys[ $position - 1 ] ) ) . '">' . esc_html__( 'Back', 'blixis-blocks' ) . '</a> ';
	}
	if ( 'review' === $step ) {
		$labels    = array(
			'continue' => __( 'Continue', 'blixis-blocks' ),
			'save'     => __( 'Save and continue', 'blixis-blocks' ),
			'create'   => __( 'Create theme and continue', 'blixis-blocks' ),
		);
		$label_key = submit_label_key( $step, $draft, $values );
		echo '<button type="submit" name="intent" value="save" class="button button-primary blixis-btn blixis-btn--primary" data-label-continue="' . esc_attr( $labels['continue'] ) . '" data-label-save="' . esc_attr( $labels['save'] ) . '" data-label-create="' . esc_attr( $labels['create'] ) . '">';
		foreach ( $labels as $key => $label ) {
			echo '<span class="blixis-setup-button-label' . ( $key === $label_key ? ' is-current-label' : '' ) . '" data-label-value="' . esc_attr( $key ) . '">' . esc_html( $label ) . '</span>';
		}
		echo '</button> ';
		echo '<button type="submit" name="intent" value="reset" class="button blixis-btn blixis-btn--secondary">' . esc_html__( 'Discard draft and load saved values', 'blixis-blocks' ) . '</button>';
		$stored = store_read();
		if ( $stored && is_array( $stored['previous'] ) ) {
			echo ' <button type="submit" name="intent" value="rollback" class="button blixis-btn blixis-btn--secondary">' . esc_html__( 'Roll back to the previous saved configuration', 'blixis-blocks' ) . '</button>';
		}
	} else {
		$labels    = array(
			'continue' => __( 'Continue', 'blixis-blocks' ),
			'save'     => __( 'Save and continue', 'blixis-blocks' ),
			'create'   => __( 'Create theme and continue', 'blixis-blocks' ),
		);
		$label_key = submit_label_key( $step, $draft, $values );
		echo '<button type="submit" name="intent" value="next" class="button button-primary blixis-btn blixis-btn--primary" data-label-continue="' . esc_attr( $labels['continue'] ) . '" data-label-save="' . esc_attr( $labels['save'] ) . '" data-label-create="' . esc_attr( $labels['create'] ) . '">';
		foreach ( $labels as $key => $label ) {
			echo '<span class="blixis-setup-button-label' . ( $key === $label_key ? ' is-current-label' : '' ) . '" data-label-value="' . esc_attr( $key ) . '">' . esc_html( $label ) . '</span>';
		}
		echo '</button>';
	}
	echo '</div></form>';
	if ( in_array( $step, array( 'colors', 'typography', 'layout', 'review' ), true ) ) {
		echo '</div><aside class="blixis-setup-layout__preview" aria-label="' . esc_attr__( 'Preview', 'blixis-blocks' ) . '">';
		render_preview( $draft );
		echo '</aside></div>';
	} else {
		echo '</div></div>';
	}

	if ( $errors ) {
		// Move focus to the error summary so keyboard and screen reader users land on it.
		echo '<script>document.getElementById("blixis-setup-errors").focus();</script>';
	}
}

/**
 * Pick the no-JavaScript submit label from the currently selected theme and draft state.
 *
 * @param string $step   Current step.
 * @param array  $draft  Draft.
 * @param array  $values Rejected values from the current request.
 * @return 'continue'|'save'|'create'
 */
function submit_label_key( string $step, array $draft, array $values = array() ): string {
	if ( 'theme' === $step ) {
		$choice = (string) ( $values['choice'] ?? $draft['config']['theme']['slug'] ?? '' );
		return NEW_THEME === $choice ? 'create' : 'continue';
	}
	$stored   = store_read();
	$baseline = $stored['config'] ?? defaults();
	$sections = 'review' === $step ? array_keys( (array) $draft['config'] ) : ( step_sections()[ $step ] ?? array() );
	foreach ( $sections as $section ) {
		if ( ( $draft['config'][ $section ] ?? null ) !== ( $baseline[ $section ] ?? null ) ) {
			return 'save';
		}
	}
	if ( in_array( $step, array( 'colors', 'review' ), true ) && ( $draft['config']['colorsDark'] ?? null ) !== ( $baseline['colorsDark'] ?? null ) ) {
		return 'save';
	}
	return 'continue';
}

/**
 * Human name of a contract path for the error summary.
 *
 * @param string $path Contract path such as /colors/primary.
 */
function field_name( string $path ): string {
	$parts  = explode( '/', trim( $path, '/' ) );
	$labels = section_labels() + array(
		'colorsDark' => __( 'Dark colours', 'blixis-blocks' ),
		'theme'      => __( 'Child theme', 'blixis-blocks' ),
		'name'       => __( 'Theme name', 'blixis-blocks' ),
	);
	if ( 'theme' === ( $parts[0] ?? '' ) ) {
		return match ( $parts[1] ?? '' ) {
			'name'   => __( 'Theme name', 'blixis-blocks' ),
			'choice' => __( 'Child theme', 'blixis-blocks' ),
			default  => __( 'Theme slug', 'blixis-blocks' ),
		};
	}
	return ( $labels[ $parts[0] ] ?? $parts[0] ) . ' — ' . key_label( $parts[1] ?? '' );
}

/**
 * Inline SVG icons for card headers. Keys are fixed; the markup is static and decorative.
 *
 * @param string $icon Icon key.
 */
function card_icon( string $icon ): string {
	$paths = array(
		'palette' => '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4a4.6 4.6 0 0 0 4.6-4.6C22 6.1 17.5 2 12 2z"/>',
		'moon'    => '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
		'type'    => '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>',
		'text'    => '<path d="M3 6h18M3 12h12M3 18h16"/>',
		'ruler'   => '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
		'corner'  => '<path d="M5 21V11a6 6 0 0 1 6-6h10"/>',
		'layout'  => '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
		'layers'  => '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
		'motion'  => '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
		'eye'     => '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
		'font'    => '<path d="M5 20 11 4h2l6 16M7.5 14h9"/>',
	);
	$body  = $paths[ $icon ] ?? $paths['layers'];
	return '<svg class="blixis-card__icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' . $body . '</svg>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Static markup from the map above.
}

/**
 * Open a card: tinted header with icon, title, an optional side control, and the wave.
 *
 * @param string $icon      Key into the icon map.
 * @param string $title     Heading text (escaped here).
 * @param string $side_html Trusted markup for the header's side slot.
 * @param string $extra_class Extra class names.
 * @param string $id        Optional element id.
 */
function render_card_start( string $icon, string $title, string $side_html = '', string $extra_class = '', string $id = '' ): void {
	$heading = 'blixis-card-title-' . sanitize_html_class( '' !== $id ? $id : strtolower( $title ) . '-' . wp_rand( 100, 999 ) );
	echo '<section class="blixis-card' . ( '' !== $extra_class ? ' ' . esc_attr( $extra_class ) : '' ) . '"' . ( '' !== $id ? ' id="' . esc_attr( $id ) . '"' : '' ) . ' aria-labelledby="' . esc_attr( $heading ) . '">';
	echo '<header class="blixis-card__head">';
	echo '<svg class="blixis-card__wave" aria-hidden="true" focusable="false" viewBox="0 0 400 60" preserveAspectRatio="none"><path d="M0 40C60 10 120 10 190 32s140 24 210-12V60H0z" fill="currentColor"/></svg>';
	echo card_icon( $icon ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Static markup.
	echo '<h3 class="blixis-card__title" id="' . esc_attr( $heading ) . '">' . esc_html( $title ) . '</h3>';
	echo '<div class="blixis-card__side">' . $side_html . '</div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Callers pass escaped markup.
	echo '</header><div class="blixis-card__body">';
}

/**
 * Close a card, with an optional footer.
 *
 * @param string $foot_html Trusted markup for the footer.
 */
function render_card_end( string $foot_html = '' ): void {
	echo '</div>';
	if ( '' !== $foot_html ) {
		echo '<footer class="blixis-card__foot">' . $foot_html . '</footer>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Callers pass escaped markup.
	}
	echo '</section>';
}

/**
 * One row: label on the left, control on the right, help text under the control.
 *
 * @param string $label_html Trusted label markup (usually escaped text).
 * @param string $control_html Trusted control markup.
 * @param string $help       Help text (escaped here).
 * @param string $label_for  Id of the control the label names; a plain div label when empty.
 * @param array  $args       Optional: class, help_id, error_html (trusted).
 */
function render_row( string $label_html, string $control_html, string $help = '', string $label_for = '', array $args = array() ): void {
	echo '<div class="blixis-row' . ( ! empty( $args['class'] ) ? ' ' . esc_attr( (string) $args['class'] ) : '' ) . '">';
	if ( '' !== $label_for ) {
		echo '<label class="blixis-row__label" for="' . esc_attr( $label_for ) . '">' . $label_html . '</label>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Callers pass escaped markup.
	} else {
		echo '<div class="blixis-row__label">' . $label_html . '</div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Callers pass escaped markup.
	}
	echo '<div class="blixis-row__control">';
	echo (string) ( $args['error_html'] ?? '' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Callers pass escaped markup.
	echo $control_html; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Callers pass escaped markup.
	echo '</div>';
	if ( '' !== $help ) {
		echo '<p class="blixis-row__help blixis-setup-hint"' . ( ! empty( $args['help_id'] ) ? ' id="' . esc_attr( (string) $args['help_id'] ) . '"' : '' ) . '>' . esc_html( $help ) . '</p>';
	}
	echo '</div>';
}

/**
 * One text field with label, hint, and error, as a row.
 *
 * @param string      $path  Contract path.
 * @param string      $label Label.
 * @param string      $value Value.
 * @param string      $hint  Hint.
 * @param string|null $code  Error code.
 * @param string      $extra Escaped extra markup after the input.
 * @param array       $data  Data attributes for the controls script (section, key, kind).
 */
function render_field( string $path, string $label, string $value, string $hint, ?string $code, string $extra = '', array $data = array() ): void {
	$id        = field_id( $path );
	$described = trim( ( '' !== $hint ? $id . '-hint' : '' ) . ( $code ? ' ' . $id . '-error' : '' ) );
	$parts     = explode( '/', trim( $path, '/' ) );
	$name      = 'config[' . $parts[0] . '][' . ( $parts[1] ?? '' ) . ']';
	if ( 'theme' === $parts[0] ) {
		$name = 'new_' . ( $parts[1] ?? '' );
	}
	$attributes = '';
	foreach ( $data as $attribute => $attribute_value ) {
		$attributes .= ' data-' . esc_attr( (string) $attribute ) . '="' . esc_attr( (string) $attribute_value ) . '"';
	}
	$control = '<div class="blixis-setup-control"><input type="text" id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '" value="' . esc_attr( $value ) . '" ' . ( '' !== $described ? ' aria-describedby="' . esc_attr( $described ) . '"' : '' ) . ( $code ? ' aria-invalid="true"' : '' ) . ' autocomplete="off" spellcheck="false"' . ( '/theme/name' === $path ? '' : ' dir="ltr"' ) . $attributes . '>' . $extra . '</div>';
	$error   = $code ? '<p class="blixis-setup-error" id="' . esc_attr( $id ) . '-error">' . esc_html( error_message( $code ) ) . '</p>' : '';
	echo '<div class="blixis-setup-field' . ( $code ? ' has-error' : '' ) . '">';
	render_row(
		esc_html( $label ),
		$control,
		$hint,
		$id,
		array(
			'help_id'    => $id . '-hint',
			'error_html' => $error,
		)
	);
	echo '</div>';
}

/**
 * Fields of one token section.
 *
 * @param string               $section   Section name; "colorsDark" is the optional dark palette.
 * @param array<string, mixed> $current   Current values.
 * @param array<string, string> $errors   Errors by path.
 * @param array<string, mixed> $submitted Rejected submitted values to show again.
 */
function render_section( string $section, array $current, array $errors, array $submitted ): void {
	$dark       = 'colorsDark' === $section;
	$definition = null;
	$lookup     = $dark ? 'colors' : $section;
	foreach ( token_map()['sections'] as $candidate ) {
		if ( $lookup === $candidate['section'] ) {
			$definition = $candidate;
		}
	}
	if ( ! $definition ) {
		return;
	}
	$legend = $dark ? __( 'Dark colours', 'blixis-blocks' ) : ( section_labels()[ $section ] ?? $section );
	$icons  = array(
		'colors'     => 'palette',
		'colorsDark' => 'moon',
		'fonts'      => 'type',
		'typeScale'  => 'text',
		'spacing'    => 'ruler',
		'radius'     => 'corner',
		'layout'     => 'layout',
		'shadows'    => 'layers',
		'motion'     => 'motion',
	);
	$side   = '';
	if ( $dark ) {
		$side = '<span data-blixis-slot="dark-switch"></span>';
	} elseif ( 'typeScale' === $section ) {
		$side = '<span data-blixis-slot="keep"></span>';
	}
	render_card_start( $icons[ $section ] ?? 'layers', $legend, $side, 'blixis-section-' . strtolower( $section ), 'blixis-section-' . strtolower( $section ) );
	$intros = array(
		'colors'    => __( 'A colour as hex, rgb(), hsl(), or oklch(), such as #155dfc or oklch(0.55 0.2 260). Use the menu to change the format.', 'blixis-blocks' ),
		'typeScale' => __( 'A length such as 1rem. Use the menu to change the unit.', 'blixis-blocks' ),
		'spacing'   => __( 'A length such as 1rem. Use the menu to change the unit.', 'blixis-blocks' ),
		'radius'    => __( 'A length such as 0.5rem. Use the menu to change the unit.', 'blixis-blocks' ),
		'layout'    => __( 'A width such as 42rem. Use the menu to change the unit.', 'blixis-blocks' ),
		'fonts'     => __( 'A generic family, or a font installed under Appearance → Fonts.', 'blixis-blocks' ),
		'shadows'   => __( 'None, or a shadow such as 0 1px 2px 0 #0000001a. Pick a card or adjust; the CSS stays available.', 'blixis-blocks' ),
		'motion'    => __( 'Durations in milliseconds, such as 200ms.', 'blixis-blocks' ),
	);
	if ( $dark ) {
		echo '<p class="blixis-card__intro blixis-setup-hint">' . esc_html__( 'Optional. Fill in all five to use a dark palette, or leave all five empty. Without one, dark mode uses the light colours. Same formats as the light colours.', 'blixis-blocks' ) . '</p><div class="blixis-dark-rows">';
	} elseif ( isset( $intros[ $section ] ) ) {
		echo '<p class="blixis-card__intro blixis-setup-hint">' . esc_html( $intros[ $section ] ) . '</p>';
	}
	$first_units = null;
	foreach ( array_keys( $definition['tokens'] ) as $key ) {
		$key   = (string) $key;
		$path  = '/' . $section . '/' . $key;
		$value = (string) ( $submitted[ $key ] ?? $current[ $key ] ?? '' );
		if ( 'font' === $definition['kind'] ) {
			render_font_select( $path, key_label( $key ), $value, $errors[ $path ] ?? null );
			continue;
		}
		$extra = '';
		if ( 'color' === $definition['kind'] && '' !== $value && color_valid( $value ) ) {
			$extra = '<span class="blixis-setup-swatch" aria-hidden="true" style="background-color:' . esc_attr( $value ) . '"></span>';
		}
		$kind = match ( $definition['kind'] ) {
			'color'  => 'color',
			'length' => 'length',
			'shadow' => 'shadow',
			'motion' => 'easing' === $key ? 'easing' : 'duration',
			default  => '',
		};
		$label = 'motion' === $section ? motion_label( $key ) : key_label( $key );
		if ( $dark ) {
			/* translators: %s: colour name such as Primary. */
			$label = sprintf( __( '%s (dark)', 'blixis-blocks' ), $label );
		}
		// The generic help is shown once per card (the intro above); a row keeps help only
		// when it says something its neighbours do not.
		$hint = '';
		if ( 'length' === $definition['kind'] ) {
			$units = (array) ( token_map()['fields'][ $section ][ $key ]['units'] ?? array() );
			if ( null === $first_units ) {
				$first_units = $units;
			} elseif ( $units !== $first_units ) {
				/* translators: %s: list of units such as px, rem. */
				$hint = sprintf( __( 'Units: %s.', 'blixis-blocks' ), implode( ', ', $units ) );
			}
		} elseif ( 'easing' === $kind ) {
			$hint = hint( 'motion', $key );
		}
		render_field(
			$path,
			$label,
			$value,
			$hint,
			$errors[ $path ] ?? null,
			$extra,
			array(
				'blixis-kind' => $kind,
				'section'     => $section,
				'key'         => $key,
			)
		);
	}
	if ( $dark ) {
		render_scheme_row( $errors, $submitted );
		echo '</div>';
	}
	$slot = array(
		'typeScale'  => 'typeScale',
		'spacing'    => 'spacing',
		'radius'     => 'radius',
		'layout'     => 'layout',
		'shadows'    => 'shadows',
		'motion'     => 'motion',
		'colors'     => 'colors-light',
		'colorsDark' => 'colors-dark',
	)[ $section ] ?? '';
	if ( '' !== $slot ) {
		echo '<div class="blixis-spec-slot" data-specimen="' . esc_attr( $slot ) . '"></div>';
	}
	render_card_end( $dark ? '<button type="button" class="blixis-btn blixis-btn--secondary blixis-btn--small" data-blixis-copy-light hidden>' . esc_html__( 'Start from the light colours', 'blixis-blocks' ) . '</button>' : '' );
	if ( 'fonts' === $section ) {
		render_installed_fonts();
	}
}

/**
 * Name of a motion token: the three speeds and the easing.
 *
 * @param string $key Token key.
 */
function motion_label( string $key ): string {
	return match ( $key ) {
		'durationFast' => __( 'Fast', 'blixis-blocks' ),
		'durationBase' => __( 'Normal', 'blixis-blocks' ),
		'durationSlow' => __( 'Slow', 'blixis-blocks' ),
		'easing'       => __( 'Easing', 'blixis-blocks' ),
		default        => key_label( $key ),
	};
}

/**
 * The sections of one step.
 *
 * @param string $step   Step key.
 * @param array  $draft  Draft.
 * @param array  $errors Errors by path.
 * @param array  $values Rejected submitted values.
 */
function render_step_sections( string $step, array $draft, array $errors, array $values ): void {
	if ( 'colors' === $step ) {
		render_colors_step( $draft, $errors, $values );
		return;
	}
	foreach ( step_sections()[ $step ] as $section ) {
		render_section( $section, $draft['config'][ $section ] ?? array(), $errors, (array) ( $values[ $section ] ?? array() ) );
	}
}

/**
 * Colours step: the light card, then the dark card with the site colour scheme.
 *
 * @param array $draft  Draft.
 * @param array $errors Errors by path.
 * @param array $values Rejected submitted values.
 */
function render_colors_step( array $draft, array $errors, array $values ): void {
	render_section( 'colors', $draft['config']['colors'] ?? array(), $errors, (array) ( $values['colors'] ?? array() ) );
	render_section( 'colorsDark', (array) ( $draft['config']['colorsDark'] ?? array() ), $errors, (array) ( $values['colorsDark'] ?? array() ) );
}

/**
 * The site colour scheme as a row inside the dark card.
 *
 * @param array $errors    Errors by path.
 * @param array $submitted Rejected submitted values.
 */
function render_scheme_row( array $errors, array $submitted ): void {
	$scheme = (string) ( $submitted['scheme'] ?? '' );
	if ( ! in_array( $scheme, token_map()['colorScheme']['values'], true ) ) {
		$scheme = scheme_get();
	}
	$options = array(
		'system' => __( 'Follow the visitor\'s system setting', 'blixis-blocks' ),
		'light'  => __( 'Always light', 'blixis-blocks' ),
		'dark'   => __( 'Always dark', 'blixis-blocks' ),
	);
	$control = '<fieldset class="blixis-choices" id="blixis-colors-scheme" tabindex="-1" aria-describedby="blixis-colors-scheme-hint"><legend class="screen-reader-text">' . esc_html__( 'Colour scheme of the site', 'blixis-blocks' ) . '</legend>';
	foreach ( $options as $value => $text ) {
		$id       = 'blixis-colors-scheme-' . $value;
		$control .= '<span class="blixis-choice"><input type="radio" name="scheme" id="' . esc_attr( $id ) . '" value="' . esc_attr( $value ) . '"' . checked( $scheme, $value, false ) . '> <label for="' . esc_attr( $id ) . '">' . esc_html( $text ) . '</label></span>';
	}
	$control .= '</fieldset>';
	$error    = isset( $errors['/colors/scheme'] ) ? '<p class="blixis-setup-error" id="blixis-colors-scheme-error">' . esc_html__( 'Choose one of the three options.', 'blixis-blocks' ) . '</p>' : '';
	render_row(
		esc_html__( 'Colour scheme', 'blixis-blocks' ),
		$control,
		__( 'Matters only when a dark palette is set. This is a site setting: it is saved when you continue, not with the draft.', 'blixis-blocks' ),
		'',
		array(
			'help_id'    => 'blixis-colors-scheme-hint',
			'error_html' => $error,
		)
	);
}

/**
 * Data for the controls script: the token map (ranges, units, grammars), the draft, and the
 * translated strings. The script is optional; the fields above work without it.
 *
 * @param array  $draft Draft.
 * @param string $step  Step key.
 */
function render_enhancement_data( array $draft, string $step ): void {
	$data = array(
		'tokenMap' => token_map(),
		'config'   => $draft['config'],
		'step'     => $step,
		'strings'  => script_strings(),
	);
	echo '<script type="application/json" id="blixis-setup-data">' . wp_json_encode( $data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT ) . '</script>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- JSON with HTML-significant characters escaped.
}

/**
 * Translated strings for the controls script.
 *
 * @return array<string, string>
 */
function script_strings(): array {
	return array(
		'format'              => __( 'Format', 'blixis-blocks' ),
		/* translators: %s: colour name. */
		'formatFor'           => __( 'Colour format for %s', 'blixis-blocks' ),
		/* translators: %s: colour name. */
		'pickFor'             => __( 'Pick colour for %s', 'blixis-blocks' ),
		'formatHex'           => __( 'Hex', 'blixis-blocks' ),
		'formatRgb'           => __( 'RGB', 'blixis-blocks' ),
		'formatHsl'           => __( 'HSL', 'blixis-blocks' ),
		'formatOklch'         => __( 'OKLCH', 'blixis-blocks' ),
		/* translators: %s: field name. */
		'unitFor'             => __( 'Unit for %s', 'blixis-blocks' ),
		'contrastSurface'     => __( 'The other colours are checked against this one.', 'blixis-blocks' ),
		'contrastKind_text'   => __( 'Text', 'blixis-blocks' ),
		'contrastKind_link'   => __( 'Link', 'blixis-blocks' ),
		'contrastKind_button' => __( 'Button label', 'blixis-blocks' ),
		'contrastKind_ui'     => __( 'Interface part', 'blixis-blocks' ),
		/* translators: %s: what is checked, such as "Text on surface". */
		'contrastInvalid'     => __( '%s: enter a valid colour.', 'blixis-blocks' ),
		/* translators: 1: what is checked, 2: contrast ratio such as 12.63. */
		'contrastPass'        => __( '%1$s %2$s:1. Passes.', 'blixis-blocks' ),
		/* translators: 1: what is checked, 2: contrast ratio, 3: required ratio. */
		'contrastWarn'        => __( 'Warning. %1$s %2$s:1, needs %3$s:1.', 'blixis-blocks' ),
		'passes'              => __( 'passes', 'blixis-blocks' ),
		'fails'               => __( 'below the required contrast', 'blixis-blocks' ),
		'useDark'             => __( 'Use dark colours', 'blixis-blocks' ),
		'noMatch'             => __( 'No font matches.', 'blixis-blocks' ),
		'fontOptions'         => __( 'Fonts', 'blixis-blocks' ),
		'fontInstalled'       => __( 'Installed', 'blixis-blocks' ),
		'fontGeneric'         => __( 'Generic', 'blixis-blocks' ),
		'fontCurrent'         => __( 'Current', 'blixis-blocks' ),
		'keepProportions'     => __( 'Keep proportions', 'blixis-blocks' ),
		'keepHint'            => __( 'When on, changing Base scales every other size by the same ratio.', 'blixis-blocks' ),
		'shadowPreset_none'   => __( 'None', 'blixis-blocks' ),
		'shadowPreset_subtle' => __( 'Subtle', 'blixis-blocks' ),
		'shadowPreset_soft'   => __( 'Soft', 'blixis-blocks' ),
		'shadowPreset_medium' => __( 'Medium', 'blixis-blocks' ),
		'shadowPreset_strong' => __( 'Strong', 'blixis-blocks' ),
		'shadowCustom'        => __( 'Custom shadow. Pick a card to replace it.', 'blixis-blocks' ),
		'adjust'              => __( 'Adjust', 'blixis-blocks' ),
		'editCss'             => __( 'Edit as CSS', 'blixis-blocks' ),
		'shadowX'             => __( 'Horizontal offset', 'blixis-blocks' ),
		'shadowY'             => __( 'Vertical offset', 'blixis-blocks' ),
		'shadowBlur'          => __( 'Blur', 'blixis-blocks' ),
		'shadowSpread'        => __( 'Spread', 'blixis-blocks' ),
		'shadowOpacity'       => __( 'Opacity', 'blixis-blocks' ),
		'shadowColor'         => __( 'Shadow colour', 'blixis-blocks' ),
		/* translators: %d: number of shadow layers. */
		'shadowLayers'        => __( 'This shadow has %d layers. Adjusting changes the first layer only; edit as CSS to change the others.', 'blixis-blocks' ),
		'easing_smooth'       => __( 'Smooth', 'blixis-blocks' ),
		'easing_gentle-start' => __( 'Gentle start', 'blixis-blocks' ),
		'easing_gentle-stop'  => __( 'Gentle stop', 'blixis-blocks' ),
		'easing_linear'       => __( 'Linear', 'blixis-blocks' ),
		'easing_springy'      => __( 'Springy', 'blixis-blocks' ),
		'easingCustom'        => __( 'Custom easing. Pick a card to replace it.', 'blixis-blocks' ),
		'speed_fast'          => __( 'Fast', 'blixis-blocks' ),
		'speed_normal'        => __( 'Normal', 'blixis-blocks' ),
		'speed_slow'          => __( 'Slow', 'blixis-blocks' ),
		'play'                => __( 'Play', 'blixis-blocks' ),
		/* translators: 1-3: durations such as 120ms for Fast, Normal, Slow; 4: easing name. */
		'motionStill'         => __( 'Your system asks for reduced motion, so the sample does not move. Fast takes %1$s, Normal %2$s, and Slow %3$s, with %4$s easing.', 'blixis-blocks' ),
		'specimenLight'       => __( 'Light colours sample', 'blixis-blocks' ),
		'specimenDark'        => __( 'Dark colours sample', 'blixis-blocks' ),
		'specimenType'        => __( 'Type specimen', 'blixis-blocks' ),
		'specimenSpacing'     => __( 'Spacing ruler', 'blixis-blocks' ),
		'specimenRadius'      => __( 'Corner radius samples', 'blixis-blocks' ),
		'specimenLayout'      => __( 'Layout widths sample', 'blixis-blocks' ),
		'specimenShadows'     => __( 'Shadow cards', 'blixis-blocks' ),
		'specimenMotion'      => __( 'Motion sample', 'blixis-blocks' ),
		'sampleText'          => __( 'Body text on the surface colour.', 'blixis-blocks' ),
		'sampleLink'          => __( 'A link', 'blixis-blocks' ),
		'sampleMuted'         => __( 'Muted text', 'blixis-blocks' ),
		'sampleButton'        => __( 'Button', 'blixis-blocks' ),
		'sampleAccent'        => __( 'Accent', 'blixis-blocks' ),
		'sampleH1'            => __( 'Heading one', 'blixis-blocks' ),
		'sampleH2'            => __( 'Heading two', 'blixis-blocks' ),
		'sampleH3'            => __( 'Heading three', 'blixis-blocks' ),
		'sampleH4'            => __( 'Heading four', 'blixis-blocks' ),
		'sampleBody'          => __( 'Body text sets the reading size for paragraphs and lists.', 'blixis-blocks' ),
		'sampleSmall'         => __( 'Small text for captions and notes.', 'blixis-blocks' ),
		'sampleXs'            => __( 'Extra small text for fine print.', 'blixis-blocks' ),
		'sampleWide'          => __( 'Wide width', 'blixis-blocks' ),
		'sampleContent'       => __( 'Content width', 'blixis-blocks' ),
		'noDark'              => __( 'No dark palette is set, so dark mode uses the light colours.', 'blixis-blocks' ),
		'previewColours'      => __( 'Preview colours', 'blixis-blocks' ),
		'light'               => __( 'Light', 'blixis-blocks' ),
		'dark'                => __( 'Dark', 'blixis-blocks' ),
		'describe'            => __( 'Describe the preview', 'blixis-blocks' ),
		/* translators: 1: Light or Dark, 2: text colour, 3: surface colour, 4: contrast ratio, 5: link colour, 6: heading font, 7: body font, 8: base size. */
		'describeText'        => __( 'Preview in %1$s colours. Text %2$s on surface %3$s, contrast %4$s to 1. Links %5$s. Headings in %6$s, body text in %7$s at %8$s.', 'blixis-blocks' ),
	);
}

/**
 * Font family choice: generic families plus usable fonts from the Font Library. A native
 * select; the controls script turns it into a searchable combobox.
 *
 * @param string      $path  Contract path.
 * @param string      $label Label.
 * @param string      $value Current value.
 * @param string|null $code  Error code.
 */
function render_font_select( string $path, string $label, string $value, ?string $code ): void {
	$id        = field_id( $path );
	$described = $code ? $id . '-error' : '';
	$installed = usable_names();
	$parts     = explode( '/', trim( $path, '/' ) );
	$control   = '<div class="blixis-setup-control"><select class="blixis-select" id="' . esc_attr( $id ) . '" name="' . esc_attr( 'config[' . $parts[0] . '][' . $parts[1] . ']' ) . '"' . ( '' !== $described ? ' aria-describedby="' . esc_attr( $described ) . '"' : '' ) . ( $code ? ' aria-invalid="true"' : '' ) . ' data-blixis-kind="font" data-section="' . esc_attr( $parts[0] ) . '" data-key="' . esc_attr( $parts[1] ) . '">';
	$groups    = array(
		__( 'Installed fonts', 'blixis-blocks' )  => $installed,
		__( 'Generic families', 'blixis-blocks' ) => token_map()['fontGenerics'],
	);
	$known     = array_merge( $installed, token_map()['fontGenerics'] );
	if ( '' !== $value && ! in_array( $value, $known, true ) ) {
		$groups[ __( 'Current value', 'blixis-blocks' ) ] = array( $value );
	}
	foreach ( $groups as $group => $names ) {
		if ( ! $names ) {
			continue;
		}
		$control .= '<optgroup label="' . esc_attr( $group ) . '">';
		foreach ( $names as $name ) {
			$control .= '<option value="' . esc_attr( $name ) . '"' . selected( $value, $name, false ) . '>' . esc_html( $name ) . '</option>';
		}
		$control .= '</optgroup>';
	}
	$control .= '</select></div>';
	$error    = $code ? '<p class="blixis-setup-error" id="' . esc_attr( $id ) . '-error">' . esc_html( error_message( $code ) ) . '</p>' : '';
	echo '<div class="blixis-setup-field' . ( $code ? ' has-error' : '' ) . '">';
	render_row(
		esc_html( $label ),
		$control,
		'',
		$id,
		array(
			'help_id'    => $id . '-hint',
			'error_html' => $error,
		)
	);
	echo '</div>';
}

/**
 * Installed Font Library families with their checks and licence metadata.
 */
function render_installed_fonts(): void {
	$families = installed_families();
	render_card_start( 'font', __( 'Installed fonts', 'blixis-blocks' ), '', 'blixis-setup-fonts', 'blixis-installed-fonts' );
	if ( ! $families ) {
		echo '<p class="blixis-card__intro">' . esc_html__( 'No fonts are installed. Add font files under Appearance → Fonts; Blixis never loads fonts from another site.', 'blixis-blocks' ) . '</p>';
		render_card_end();
		return;
	}
	$problems = array(
		'name'     => __( 'The family name uses characters a token cannot hold.', 'blixis-blocks' ),
		'no_faces' => __( 'The family has no font files.', 'blixis-blocks' ),
		'face'     => __( 'A font file is missing, not local, too large, or not the format its name says.', 'blixis-blocks' ),
	);
	echo '<table class="widefat striped"><caption class="screen-reader-text">' . esc_html__( 'Installed fonts and their checks', 'blixis-blocks' ) . '</caption><thead><tr>';
	foreach ( array( __( 'Family', 'blixis-blocks' ), __( 'Files', 'blixis-blocks' ), __( 'Licence', 'blixis-blocks' ), __( 'Status', 'blixis-blocks' ) ) as $heading ) {
		echo '<th scope="col">' . esc_html( $heading ) . '</th>';
	}
	echo '</tr></thead><tbody>';
	foreach ( $families as $family ) {
		$formats = array();
		foreach ( $family['faces'] as $face ) {
			$formats[] = $face['weight'] . ' ' . $face['style'] . ( isset( $face['format'] ) ? ' (' . $face['format'] . ')' : '' );
		}
		$license = '' !== $family['license'] ? $family['license'] : __( 'Not found in the font files. WOFF2 files cannot be read here; check the licence before you use the font.', 'blixis-blocks' );
		echo '<tr><th scope="row">' . esc_html( $family['name'] ) . '</th>';
		echo '<td>' . esc_html( implode( ', ', $formats ) ) . '</td>';
		echo '<td><span class="blixis-setup-license">' . esc_html( wp_html_excerpt( $license, 160, '…' ) ) . '</span>';
		if ( '' !== $family['license_url'] && wp_http_validate_url( $family['license_url'] ) ) {
			echo '<br><a class="blixis-setup-license-link" href="' . esc_url( $family['license_url'] ) . '" rel="noopener noreferrer">' . esc_html__( 'Licence text', 'blixis-blocks' ) . '</a>';
		}
		echo '</td><td>';
		if ( $family['usable'] ) {
			echo esc_html__( 'Can be used', 'blixis-blocks' );
		} else {
			$reasons = array_map( static fn ( $p ) => $problems[ $p ] ?? $p, $family['problems'] );
			echo esc_html( __( 'Cannot be used:', 'blixis-blocks' ) . ' ' . implode( ' ', $reasons ) );
		}
		echo '</td></tr>';
	}
	echo '</tbody></table>';
	render_card_end();
}

/**
 * Child theme step: pick an existing child or create one.
 *
 * @param array                 $draft  Draft.
 * @param array<string, string> $errors Errors by path.
 * @param array<string, mixed>  $values Rejected submitted values.
 */
function render_theme_step( array $draft, array $errors, array $values ): void {
	$current  = (string) ( $values['choice'] ?? $draft['config']['theme']['slug'] ?? '' );
	$children = child_themes();
	$can_new  = current_user_can( 'install_themes' );
	if ( '' === $current ) {
		$current = $children ? (string) array_key_first( $children ) : NEW_THEME;
	}
	echo '<section class="blixis-card blixis-setup-theme-card"><header class="blixis-card__head"><svg class="blixis-card__wave" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true"><path fill="currentColor" d="M0 60C80 60 120 10 220 18S340 50 400 0v60Z"/></svg><svg class="blixis-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 4h18v16H3zM3 9h18M8 4v5"/></svg><h3 class="blixis-card__title">' . esc_html__( 'Child theme', 'blixis-blocks' ) . '</h3></header><div class="blixis-card__body"><fieldset class="blixis-setup-section" id="blixis-theme-choice" tabindex="-1"><legend>' . esc_html__( 'Which child theme should these tokens belong to?', 'blixis-blocks' ) . '</legend>';
	foreach ( $children as $slug => $name ) {
		$id = 'blixis-theme-choice-' . $slug;
		echo '<p class="blixis-setup-choice"><input type="radio" name="choice" id="' . esc_attr( $id ) . '" value="' . esc_attr( $slug ) . '"' . checked( $current, $slug, false ) . '> ';
		echo '<label for="' . esc_attr( $id ) . '">' . esc_html( $name ) . ' <code>' . esc_html( $slug ) . '</code></label></p>';
	}
	if ( $can_new ) {
		echo '<p class="blixis-setup-choice"><input type="radio" name="choice" id="blixis-theme-choice-new" value="' . esc_attr( NEW_THEME ) . '"' . checked( $current, NEW_THEME, false ) . '> ';
		echo '<label for="blixis-theme-choice-new">' . esc_html__( 'Create a new child theme', 'blixis-blocks' ) . '</label></p>';
	} elseif ( ! $children ) {
		echo '<p>' . esc_html__( 'There is no child theme of Blixis Base yet, and you are not allowed to create one. Ask an administrator.', 'blixis-blocks' ) . '</p>';
	}
	echo '</fieldset></div></section>';
	if ( $can_new ) {
		$has_theme_errors = isset( $errors['/theme/name'] ) || isset( $errors['/theme/slug'] ) || isset( $errors['/theme/starter'] );
		echo '<section class="blixis-card blixis-setup-theme-card blixis-setup-new-theme' . ( $has_theme_errors ? ' has-errors' : '' ) . '"><header class="blixis-card__head"><svg class="blixis-card__wave" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true"><path fill="currentColor" d="M0 60C80 60 120 10 220 18S340 50 400 0v60Z"/></svg><svg class="blixis-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><h3 class="blixis-card__title">' . esc_html__( 'New child theme', 'blixis-blocks' ) . '</h3></header><div class="blixis-card__body"><div class="blixis-setup-section' . ( $has_theme_errors ? ' has-errors' : '' ) . '">';
		render_field( '/theme/name', __( 'Theme name', 'blixis-blocks' ), (string) ( $values['new_name'] ?? '' ), __( 'Shown under Appearance → Themes, for example Acme Site.', 'blixis-blocks' ), $errors['/theme/name'] ?? null );
		render_field( '/theme/slug', __( 'Theme slug', 'blixis-blocks' ), (string) ( $values['new_slug'] ?? '' ), __( 'Folder name: lowercase letters, digits, and single hyphens, for example acme-site.', 'blixis-blocks' ), $errors['/theme/slug'] ?? null );
		$starter = (string) ( $values['new_starter'] ?? 'none' );
		echo '<div class="blixis-row"><label class="blixis-row__label" for="blixis-new-starter">' . esc_html__( 'Starting content', 'blixis-blocks' ) . '</label><div class="blixis-row__control"><select id="blixis-new-starter" name="new_starter">';
		echo '<option value="none"' . selected( $starter, 'none', false ) . '>' . esc_html__( 'Blank theme', 'blixis-blocks' ) . '</option>';
		echo '<option value="neutral"' . selected( $starter, 'neutral', false ) . '>' . esc_html__( 'Neutral front page with editable sections', 'blixis-blocks' ) . '</option>';
		echo '</select></div></div>';
		if ( isset( $errors['/theme/starter'] ) ) {
			echo '<p class="blixis-setup-error" role="alert">' . esc_html__( 'Choose a valid starting option.', 'blixis-blocks' ) . '</p>';
		}
		echo '<p class="blixis-setup-hint">' . esc_html__( 'Fill these in only when you create a new child theme. The theme is not activated.', 'blixis-blocks' ) . '</p>';
		echo '</div></div></section>';
	}
}

/**
 * Review step: every value, and the save state.
 *
 * @param array $draft Draft.
 */
function render_review( array $draft ): void {
	$stored = store_read();
	echo '<p>';
	if ( $stored ) {
		/* translators: %d: revision number. */
		echo esc_html( sprintf( __( 'Saved revision: %d.', 'blixis-blocks' ), $stored['revision'] ) ) . ' ';
	} else {
		echo esc_html__( 'Nothing is saved yet.', 'blixis-blocks' ) . ' ';
	}
	echo esc_html__( 'Check the values below, then save.', 'blixis-blocks' ) . '</p>';
	echo '<dl class="blixis-setup-review">';
	echo '<dt>' . esc_html__( 'Child theme', 'blixis-blocks' ) . '</dt><dd><code>' . esc_html( (string) $draft['config']['theme']['slug'] ) . '</code></dd>';
	foreach ( section_labels() as $section => $label ) {
		$parts = array();
		foreach ( (array) ( $draft['config'][ $section ] ?? array() ) as $key => $value ) {
			$parts[] = key_label( (string) $key ) . ': ' . $value;
		}
		echo '<dt>' . esc_html( $label ) . '</dt><dd>' . esc_html( implode( '; ', $parts ) ) . '</dd>';
	}
	echo '</dl>';
}

/**
 * Preview of the draft on the site's front page, at fixed device widths.
 *
 * The widths are preview controls only; they never change stored values. They work
 * without JavaScript: the checked radio button sets the frame width through CSS.
 *
 * @param array $draft Draft.
 */
function render_preview( array $draft ): void {
	$url    = add_query_arg( \Blixis\Blocks\Tokens\PREVIEW_PARAM, wp_create_nonce( \Blixis\Blocks\Tokens\PREVIEW_ACTION ), home_url( '/' ) );
	$widths = array(
		'mobile'  => array( 390, __( 'Mobile, 390 px', 'blixis-blocks' ) ),
		'tablet'  => array( 820, __( 'Tablet, 820 px', 'blixis-blocks' ) ),
		'desktop' => array( 1280, __( 'Desktop, 1280 px', 'blixis-blocks' ) ),
	);
	render_card_start( 'eye', __( 'Preview', 'blixis-blocks' ), '<span data-blixis-slot="preview-scheme"></span>', 'blixis-setup-preview', 'blixis-preview' );
	echo '<p class="blixis-card__intro">' . esc_html__( 'The front page with these values. Only you see it; visitors see the saved configuration.', 'blixis-blocks' ) . '</p>';
	if ( ( $draft['config']['theme']['slug'] ?? '' ) !== get_stylesheet() ) {
		/* translators: %s: theme slug. */
		echo '<p class="blixis-card__intro blixis-setup-hint">' . esc_html( sprintf( __( 'The preview uses the active theme. Visitors see these tokens only after %s is activated.', 'blixis-blocks' ), (string) $draft['config']['theme']['slug'] ) ) . '</p>';
	}
	$short = array(
		'mobile'  => __( 'Mobile', 'blixis-blocks' ),
		'tablet'  => __( 'Tablet', 'blixis-blocks' ),
		'desktop' => __( 'Desktop', 'blixis-blocks' ),
	);
	echo '<fieldset class="blixis-seg blixis-seg--widths"><legend class="screen-reader-text">' . esc_html__( 'Preview width', 'blixis-blocks' ) . '</legend>';
	foreach ( $widths as $key => list( $px, $label ) ) {
		echo '<label class="blixis-seg__opt" for="blixis-preview-' . esc_attr( $key ) . '" title="' . esc_attr( $label ) . '"><input type="radio" name="blixis_preview_width" id="blixis-preview-' . esc_attr( $key ) . '" value="' . esc_attr( (string) $px ) . '"' . checked( 'mobile', $key, false ) . ' form="blixis-preview-controls"><span>' . esc_html( $short[ $key ] ) . '<span class="screen-reader-text">' . esc_html( ', ' . $px . ' px' ) . '</span></span></label>';
	}
	echo '</fieldset>';
	echo '<div class="blixis-setup-frame" role="region" tabindex="0" aria-label="' . esc_attr__( 'Preview frame; scroll sideways for wider widths', 'blixis-blocks' ) . '"><iframe title="' . esc_attr__( 'Preview of the front page with the draft tokens', 'blixis-blocks' ) . '" src="' . esc_url( $url ) . '" loading="lazy"></iframe></div>';
	render_card_end( '<span data-blixis-slot="preview-describe"></span>' );
}

/**
 * Store a one-time message for the next page view.
 *
 * @param int    $user User ID.
 * @param string $step Step the message belongs to.
 * @param array  $data Message data.
 */
function flash( int $user, string $step, array $data ): void {
	update_user_meta( $user, FLASH_META, wp_slash( (string) wp_json_encode( array( 'step' => $step ) + $data ) ) );
}

/**
 * Handle a step submission.
 */
function handle(): void {
	if ( ! current_user_can( 'edit_theme_options' ) ) {
		wp_die( esc_html__( 'Sorry, you are not allowed to set up this site.', 'blixis-blocks' ), '', array( 'response' => 403 ) );
	}
	$steps = steps();
	// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Verified right below, per step.
	$step = isset( $_POST['step'] ) ? sanitize_key( wp_unslash( $_POST['step'] ) ) : '';
	if ( ! isset( $steps[ $step ] ) ) {
		wp_die( esc_html__( 'Unknown setup step.', 'blixis-blocks' ), '', array( 'response' => 400 ) );
	}
	check_admin_referer( ACTION . '_' . $step );

	$user   = get_current_user_id();
	$draft  = draft( $user );
	$keys   = array_keys( $steps );
	$next   = $keys[ min( count( $keys ) - 1, (int) array_search( $step, $keys, true ) + 1 ) ];
	$intent = isset( $_POST['intent'] ) ? sanitize_key( wp_unslash( $_POST['intent'] ) ) : 'next';

	if ( 'theme' === $step ) {
		handle_theme( $user, $draft, $next );
		return;
	}
	if ( '' === ( $draft['config']['theme']['slug'] ?? '' ) ) {
		wp_safe_redirect( step_url( 'theme' ) );
		exit;
	}

	if ( 'review' === $step ) {
		if ( 'rollback' === $intent ) {
			$stored = store_read();
			$result = $stored ? store_rollback( $stored['revision'] ) : new \WP_Error( 'blixis_config_no_previous', __( 'There is no previous configuration to roll back to.', 'blixis-blocks' ) );
			if ( is_wp_error( $result ) ) {
				flash( $user, 'review', array( 'failure' => $result->get_error_message() ) );
			} else {
				delete_user_meta( $user, DRAFT_META );
				/* translators: %d: revision number. */
				flash( $user, 'review', array( 'notice' => sprintf( __( 'Rolled back to the previous configuration as revision %d.', 'blixis-blocks' ), $result['revision'] ) ) );
			}
			wp_safe_redirect( step_url( 'review' ) );
			exit;
		}
		if ( 'reset' === $intent ) {
			delete_user_meta( $user, DRAFT_META );
			flash( $user, 'review', array( 'notice' => __( 'The draft was discarded. These are the saved values.', 'blixis-blocks' ) ) );
			wp_safe_redirect( step_url( 'review' ) );
			exit;
		}
		$result = store_write( canonical_json( $draft['config'] ), $draft['base_revision'] );
		if ( is_wp_error( $result ) ) {
			// The draft stays, so nothing typed is lost.
			flash( $user, 'review', array( 'failure' => $result->get_error_message() ) );
		} else {
			delete_user_meta( $user, DRAFT_META );
			/* translators: %d: revision number. */
			flash( $user, 'review', array( 'notice' => sprintf( __( 'Configuration saved as revision %d.', 'blixis-blocks' ), $result['revision'] ) ) );
		}
		wp_safe_redirect( step_url( 'review' ) );
		exit;
	}

	$config    = $draft['config'];
	$submitted = array();
	// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Verified above.
	$posted = isset( $_POST['config'] ) && is_array( $_POST['config'] ) ? wp_unslash( $_POST['config'] ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Validated by the contract validator below.
	foreach ( token_map()['sections'] as $definition ) {
		$section = $definition['section'];
		if ( ! in_array( $section, step_sections()[ $step ], true ) ) {
			continue;
		}
		foreach ( array_keys( $definition['tokens'] ) as $key ) {
			$value                         = $posted[ $section ][ $key ] ?? '';
			$value                         = is_string( $value ) ? trim( $value ) : '';
			$config[ $section ][ $key ]    = $value;
			$submitted[ $section ][ $key ] = $value;
		}
	}

	// An optional dark palette (contract v2) is kept when submitted with the colours: all five
	// values together, or all empty to remove it. Validation below reports anything partial.
	if ( 'colors' === $step && isset( $posted['colorsDark'] ) && is_array( $posted['colorsDark'] ) ) {
		$dark = array();
		foreach ( array_keys( token_map()['sections'][0]['tokens'] ) as $key ) {
			$value                           = $posted['colorsDark'][ $key ] ?? '';
			$dark[ $key ]                    = is_string( $value ) ? trim( $value ) : '';
			$submitted['colorsDark'][ $key ] = $dark[ $key ];
		}
		if ( '' === implode( '', $dark ) ) {
			unset( $config['colorsDark'] );
		} else {
			$config['colorsDark'] = $dark;
		}
	}

	$errors = step_errors( $config, $step );
	// The site colour scheme (system, light, or dark) is a site setting, not part of the draft.
	// It is checked here and saved with scheme_save() once the step is valid.
	$scheme = null;
	if ( 'colors' === $step && isset( $_POST['scheme'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Verified above.
		$scheme = is_string( $_POST['scheme'] ) ? sanitize_key( wp_unslash( $_POST['scheme'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing
		if ( ! in_array( $scheme, token_map()['colorScheme']['values'], true ) ) {
			$errors[]            = array(
				'code' => 'scheme.invalid',
				'path' => '/colors/scheme',
			);
			$submitted['scheme'] = $scheme;
			$scheme              = null;
		}
	}
	if ( 'typography' === $step ) {
		$allowed = array_merge( usable_names(), token_map()['fontGenerics'] );
		foreach ( (array) $config['fonts'] as $key => $font ) {
			$path = '/fonts/' . $key;
			if ( ! in_array( $font, $allowed, true ) && ! in_array( $path, array_column( $errors, 'path' ), true ) ) {
				$errors[] = array(
					'code' => 'font.not_installed',
					'path' => $path,
				);
			}
		}
	}
	if ( $errors ) {
		flash(
			$user,
			$step,
			array(
				'errors' => $errors,
				'values' => $submitted,
			)
		);
		wp_safe_redirect( step_url( $step ) );
		exit;
	}
	if ( null !== $scheme ) {
		$saved = scheme_save( $scheme );
		if ( is_wp_error( $saved ) ) {
			flash(
				$user,
				$step,
				array(
					'failure' => $saved->get_error_message(),
					'values'  => $submitted,
				)
			);
			wp_safe_redirect( step_url( $step ) );
			exit;
		}
	}
	$checked         = validate_bytes( canonical_json( $config ) );
	$draft['config'] = $checked['ok'] ? $checked['config'] : $config;
	$draft['done']   = array_values( array_unique( array_merge( $draft['done'], array( $step ) ) ) );
	save_draft( $user, $draft );
	wp_safe_redirect( step_url( $next ) );
	exit;
}

/**
 * Validator errors that belong to a step's sections.
 *
 * @param array  $config Candidate config.
 * @param string $step   Step key.
 * @return list<array{code: string, path: string}>
 */
function step_errors( array $config, string $step ): array {
	$result = validate_bytes( canonical_json( $config ) );
	$out    = array();
	foreach ( $result['errors'] as $error ) {
		$section = explode( '/', trim( $error['path'], '/' ) )[0];
		// The optional dark palette belongs to the step that holds the colours.
		if ( 'colorsDark' === $section ) {
			$section = 'colors';
		}
		if ( in_array( $section, step_sections()[ $step ], true ) ) {
			$out[] = $error;
		}
	}
	return $out;
}

/**
 * Handle the child theme step.
 *
 * @param int    $user  User ID.
 * @param array  $draft Draft.
 * @param string $next  Next step.
 */
function handle_theme( int $user, array $draft, string $next ): void {
	// phpcs:disable WordPress.Security.NonceVerification.Missing -- Verified by the caller.
	$choice = isset( $_POST['choice'] ) ? sanitize_key( wp_unslash( $_POST['choice'] ) ) : '';
	// The generator validates both fields strictly, so they are passed on unchanged.
	$name    = isset( $_POST['new_name'] ) && is_string( $_POST['new_name'] ) ? wp_unslash( $_POST['new_name'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
	$slug    = isset( $_POST['new_slug'] ) && is_string( $_POST['new_slug'] ) ? wp_unslash( $_POST['new_slug'] ) : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
	$starter = isset( $_POST['new_starter'] ) && is_string( $_POST['new_starter'] ) ? sanitize_key( wp_unslash( $_POST['new_starter'] ) ) : 'none';
	// phpcs:enable

	if ( NEW_THEME === $choice ) {
		if ( ! current_user_can( 'install_themes' ) ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to create themes.', 'blixis-blocks' ), '', array( 'response' => 403 ) );
		}
		$created = create_child_theme(
			array(
				'name'    => $name,
				'slug'    => $slug,
				'starter' => $starter,
			)
		);
		if ( is_wp_error( $created ) ) {
			$errors = array();
			foreach ( (array) ( $created->get_error_data()['errors'] ?? array() ) as $error ) {
				if ( in_array( $error['field'], array( 'name', 'slug', 'starter' ), true ) ) {
					$errors[] = array(
						'code' => $error['code'],
						'path' => '/theme/' . $error['field'],
					);
				}
			}
			if ( ! $errors ) {
				$errors[] = array(
					'code' => 'blixis_child_exists' === $created->get_error_code() ? 'blixis_child_exists' : 'other',
					'path' => '/theme/slug',
				);
			}
			flash(
				$user,
				'theme',
				array(
					'errors' => $errors,
					'values' => array(
						'choice'      => NEW_THEME,
						'new_name'    => $name,
						'new_slug'    => $slug,
						'new_starter' => $starter,
					),
				)
			);
			wp_safe_redirect( step_url( 'theme' ) );
			exit;
		}
		$choice = $created['slug'];
	} elseif ( ! isset( child_themes()[ $choice ] ) ) {
		flash(
			$user,
			'theme',
			array(
				'errors' => array(
					array(
						'code' => 'required',
						'path' => '/theme/choice',
					),
				),
			)
		);
		wp_safe_redirect( step_url( 'theme' ) );
		exit;
	}

	$draft['config']['theme'] = array(
		'slug'   => $choice,
		'parent' => 'blixis-base',
	);
	$draft['done']            = array_values( array_unique( array_merge( $draft['done'], array( 'theme' ) ) ) );
	save_draft( $user, $draft );
	wp_safe_redirect( step_url( $next ) );
	exit;
}
