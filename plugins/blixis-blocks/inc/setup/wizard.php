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
		'color'    => __( 'A hex colour, such as #155dfc.', 'blixis-blocks' ),
		'font'     => __( 'A font family name, or a generic family such as system-ui.', 'blixis-blocks' ),
		'length'   => __( 'A length in rem or px, such as 1rem.', 'blixis-blocks' ),
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
		'token.color.invalid'   => __( 'Enter a hex colour such as #155dfc.', 'blixis-blocks' ),
		'token.font.invalid'    => __( 'Use letters, digits, spaces, and hyphens, or a generic family such as system-ui.', 'blixis-blocks' ),
		'token.length.invalid'  => __( 'Enter a length in rem or px, such as 1rem.', 'blixis-blocks' ),
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
				}
			);
		}
	}
);

add_action( 'admin_post_' . ACTION, __NAMESPACE__ . '\\handle' );

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
		/* translators: 1: step number, 2: number of steps, 3: step name. */
		$label = sprintf( __( 'Step %1$d of %2$d: %3$s', 'blixis-blocks' ), $index + 1, count( $keys ), $steps[ $key ] );
		$state = $done ? ' <span class="blixis-setup-state">' . esc_html__( '(completed)', 'blixis-blocks' ) . '</span>' : '';
		echo '<li class="' . ( $key === $step ? 'is-current' : '' ) . ( $done ? ' is-done' : '' ) . '">';
		if ( $key === $step ) {
			echo '<span aria-current="step">' . esc_html( $label ) . $state . '</span>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $state is built from escaped parts.
		} elseif ( $reachable ) {
			echo '<a href="' . esc_url( step_url( $key ) ) . '">' . esc_html( $label ) . $state . '</a>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- $state is built from escaped parts.
		} else {
			echo '<span>' . esc_html( $label ) . '</span>';
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
		foreach ( step_sections()[ $step ] as $section ) {
			render_section( $section, $draft['config'][ $section ] ?? array(), $errors, (array) ( $values[ $section ] ?? array() ) );
		}
	}

	echo '<div class="blixis-setup-actions">';
	if ( $position > 0 ) {
		echo '<a class="button" href="' . esc_url( step_url( $keys[ $position - 1 ] ) ) . '">' . esc_html__( 'Back', 'blixis-blocks' ) . '</a> ';
	}
	if ( 'review' === $step ) {
		echo '<button type="submit" name="intent" value="save" class="button button-primary">' . esc_html__( 'Save configuration', 'blixis-blocks' ) . '</button> ';
		echo '<button type="submit" name="intent" value="reset" class="button">' . esc_html__( 'Discard draft and load saved values', 'blixis-blocks' ) . '</button>';
		$stored = store_read();
		if ( $stored && is_array( $stored['previous'] ) ) {
			echo ' <button type="submit" name="intent" value="rollback" class="button">' . esc_html__( 'Roll back to the previous saved configuration', 'blixis-blocks' ) . '</button>';
		}
	} else {
		echo '<button type="submit" name="intent" value="next" class="button button-primary">' . esc_html__( 'Save and continue', 'blixis-blocks' ) . '</button>';
	}
	echo '</div></form></div>';

	if ( $errors ) {
		// Move focus to the error summary so keyboard and screen reader users land on it.
		echo '<script>document.getElementById("blixis-setup-errors").focus();</script>';
	}
}

/**
 * Human name of a contract path for the error summary.
 *
 * @param string $path Contract path such as /colors/primary.
 */
function field_name( string $path ): string {
	$parts  = explode( '/', trim( $path, '/' ) );
	$labels = section_labels() + array(
		'theme' => __( 'Child theme', 'blixis-blocks' ),
		'name'  => __( 'Theme name', 'blixis-blocks' ),
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
 * One text field with label, hint, and error.
 *
 * @param string      $path  Contract path.
 * @param string      $label Label.
 * @param string      $value Value.
 * @param string      $hint  Hint.
 * @param string|null $code  Error code.
 * @param string      $extra Escaped extra markup after the input.
 */
function render_field( string $path, string $label, string $value, string $hint, ?string $code, string $extra = '' ): void {
	$id        = field_id( $path );
	$described = $id . '-hint' . ( $code ? ' ' . $id . '-error' : '' );
	echo '<div class="blixis-setup-field' . ( $code ? ' has-error' : '' ) . '">';
	echo '<label for="' . esc_attr( $id ) . '">' . esc_html( $label ) . '</label>';
	echo '<p class="blixis-setup-hint" id="' . esc_attr( $id ) . '-hint">' . esc_html( $hint ) . '</p>';
	if ( $code ) {
		echo '<p class="blixis-setup-error" id="' . esc_attr( $id ) . '-error">' . esc_html( error_message( $code ) ) . '</p>';
	}
	$parts = explode( '/', trim( $path, '/' ) );
	$name  = 'config[' . $parts[0] . '][' . ( $parts[1] ?? '' ) . ']';
	if ( 'theme' === $parts[0] ) {
		$name = 'new_' . ( $parts[1] ?? '' );
	}
	echo '<div class="blixis-setup-control"><input type="text" id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '" value="' . esc_attr( $value ) . '" aria-describedby="' . esc_attr( $described ) . '"' . ( $code ? ' aria-invalid="true"' : '' ) . ' autocomplete="off" spellcheck="false"' . ( '/theme/name' === $path ? '' : ' dir="ltr"' ) . '>';
	echo $extra; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Callers pass escaped markup.
	echo '</div></div>';
}

/**
 * Fields of one token section.
 *
 * @param string               $section Section name.
 * @param array<string, mixed> $current Current values.
 * @param array<string, string> $errors Errors by path.
 * @param array<string, mixed> $submitted Rejected submitted values to show again.
 */
function render_section( string $section, array $current, array $errors, array $submitted ): void {
	$definition = null;
	foreach ( token_map()['sections'] as $candidate ) {
		if ( $candidate['section'] === $section ) {
			$definition = $candidate;
		}
	}
	if ( ! $definition ) {
		return;
	}
	echo '<fieldset class="blixis-setup-section"><legend>' . esc_html( section_labels()[ $section ] ?? $section ) . '</legend>';
	foreach ( array_keys( $definition['tokens'] ) as $key ) {
		$key   = (string) $key;
		$path  = '/' . $section . '/' . $key;
		$value = (string) ( $submitted[ $key ] ?? $current[ $key ] ?? '' );
		if ( 'font' === $definition['kind'] ) {
			render_font_select( $path, key_label( $key ), $value, $errors[ $path ] ?? null );
			continue;
		}
		$extra = '';
		if ( 'color' === $definition['kind'] && preg_match( '/^#[0-9a-f]{6}([0-9a-f]{2})?$/D', $value ) ) {
			$extra = '<span class="blixis-setup-swatch" aria-hidden="true" style="background-color:' . esc_attr( $value ) . '"></span>';
		}
		render_field( $path, key_label( $key ), $value, hint( $definition['kind'], $key ), $errors[ $path ] ?? null, $extra );
	}
	echo '</fieldset>';
	if ( 'fonts' === $section ) {
		render_installed_fonts();
	}
}

/**
 * Font family choice: generic families plus usable fonts from the Font Library.
 *
 * @param string      $path  Contract path.
 * @param string      $label Label.
 * @param string      $value Current value.
 * @param string|null $code  Error code.
 */
function render_font_select( string $path, string $label, string $value, ?string $code ): void {
	$id        = field_id( $path );
	$described = $id . '-hint' . ( $code ? ' ' . $id . '-error' : '' );
	$installed = usable_names();
	echo '<div class="blixis-setup-field' . ( $code ? ' has-error' : '' ) . '">';
	echo '<label for="' . esc_attr( $id ) . '">' . esc_html( $label ) . '</label>';
	echo '<p class="blixis-setup-hint" id="' . esc_attr( $id ) . '-hint">' . esc_html__( 'A generic family, or a font installed under Appearance → Fonts.', 'blixis-blocks' ) . '</p>';
	if ( $code ) {
		echo '<p class="blixis-setup-error" id="' . esc_attr( $id ) . '-error">' . esc_html( error_message( $code ) ) . '</p>';
	}
	$parts = explode( '/', trim( $path, '/' ) );
	echo '<div class="blixis-setup-control"><select id="' . esc_attr( $id ) . '" name="' . esc_attr( 'config[' . $parts[0] . '][' . $parts[1] . ']' ) . '" aria-describedby="' . esc_attr( $described ) . '"' . ( $code ? ' aria-invalid="true"' : '' ) . '>';
	$groups = array(
		__( 'Installed fonts', 'blixis-blocks' )  => $installed,
		__( 'Generic families', 'blixis-blocks' ) => token_map()['fontGenerics'],
	);
	$known  = array_merge( $installed, token_map()['fontGenerics'] );
	if ( '' !== $value && ! in_array( $value, $known, true ) ) {
		/* translators: %s: font family name. */
		$groups[ __( 'Current value', 'blixis-blocks' ) ] = array( $value );
	}
	foreach ( $groups as $group => $names ) {
		if ( ! $names ) {
			continue;
		}
		echo '<optgroup label="' . esc_attr( $group ) . '">';
		foreach ( $names as $name ) {
			echo '<option value="' . esc_attr( $name ) . '"' . selected( $value, $name, false ) . '>' . esc_html( $name ) . '</option>';
		}
		echo '</optgroup>';
	}
	echo '</select></div></div>';
}

/**
 * Installed Font Library families with their checks and licence metadata.
 */
function render_installed_fonts(): void {
	$families = installed_families();
	echo '<section class="blixis-setup-section blixis-setup-fonts" aria-labelledby="blixis-installed-fonts"><h3 id="blixis-installed-fonts">' . esc_html__( 'Installed fonts', 'blixis-blocks' ) . '</h3>';
	if ( ! $families ) {
		echo '<p>' . esc_html__( 'No fonts are installed. Add font files under Appearance → Fonts; Blixis never loads fonts from another site.', 'blixis-blocks' ) . '</p></section>';
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
	echo '</tbody></table></section>';
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
	echo '<fieldset class="blixis-setup-section" id="blixis-theme-choice" tabindex="-1"><legend>' . esc_html__( 'Which child theme should these tokens belong to?', 'blixis-blocks' ) . '</legend>';
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
	echo '</fieldset>';
	if ( $can_new ) {
		echo '<fieldset class="blixis-setup-section"><legend>' . esc_html__( 'New child theme', 'blixis-blocks' ) . '</legend>';
		render_field( '/theme/name', __( 'Theme name', 'blixis-blocks' ), (string) ( $values['new_name'] ?? '' ), __( 'Shown under Appearance → Themes, for example Acme Site.', 'blixis-blocks' ), $errors['/theme/name'] ?? null );
		render_field( '/theme/slug', __( 'Theme slug', 'blixis-blocks' ), (string) ( $values['new_slug'] ?? '' ), __( 'Folder name: lowercase letters, digits, and single hyphens, for example acme-site.', 'blixis-blocks' ), $errors['/theme/slug'] ?? null );
		$starter = (string) ( $values['new_starter'] ?? 'none' );
		echo '<p><label for="blixis-new-starter">' . esc_html__( 'Starting content', 'blixis-blocks' ) . '</label><br>';
		echo '<select id="blixis-new-starter" name="new_starter">';
		echo '<option value="none"' . selected( $starter, 'none', false ) . '>' . esc_html__( 'Blank theme', 'blixis-blocks' ) . '</option>';
		echo '<option value="neutral"' . selected( $starter, 'neutral', false ) . '>' . esc_html__( 'Neutral front page with editable sections', 'blixis-blocks' ) . '</option>';
		echo '</select></p>';
		if ( isset( $errors['/theme/starter'] ) ) {
			echo '<p class="blixis-setup-error" role="alert">' . esc_html__( 'Choose a valid starting option.', 'blixis-blocks' ) . '</p>';
		}
		echo '<p class="blixis-setup-hint">' . esc_html__( 'Fill these in only when you create a new child theme. The theme is not activated.', 'blixis-blocks' ) . '</p>';
		echo '</fieldset>';
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
	render_preview( $draft );
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
	echo '<section class="blixis-setup-preview" aria-labelledby="blixis-preview-heading">';
	echo '<h3 id="blixis-preview-heading">' . esc_html__( 'Preview', 'blixis-blocks' ) . '</h3>';
	echo '<p>' . esc_html__( 'The front page with these values. Only you see it; visitors see the saved configuration.', 'blixis-blocks' ) . '</p>';
	if ( ( $draft['config']['theme']['slug'] ?? '' ) !== get_stylesheet() ) {
		/* translators: %s: theme slug. */
		echo '<p class="blixis-setup-hint">' . esc_html( sprintf( __( 'The preview uses the active theme. Visitors see these tokens only after %s is activated.', 'blixis-blocks' ), (string) $draft['config']['theme']['slug'] ) ) . '</p>';
	}
	echo '<fieldset class="blixis-setup-widths"><legend>' . esc_html__( 'Preview width', 'blixis-blocks' ) . '</legend>';
	foreach ( $widths as $key => list( $px, $label ) ) {
		echo '<input type="radio" name="blixis_preview_width" id="blixis-preview-' . esc_attr( $key ) . '" value="' . esc_attr( (string) $px ) . '"' . checked( 'mobile', $key, false ) . ' form="blixis-preview-controls">';
		echo '<label for="blixis-preview-' . esc_attr( $key ) . '">' . esc_html( $label ) . '</label> ';
	}
	echo '</fieldset>';
	echo '<div class="blixis-setup-frame" role="region" tabindex="0" aria-label="' . esc_attr__( 'Preview frame; scroll sideways for wider widths', 'blixis-blocks' ) . '"><iframe title="' . esc_attr__( 'Preview of the front page with the draft tokens', 'blixis-blocks' ) . '" src="' . esc_url( $url ) . '" loading="lazy"></iframe></div>';
	echo '</section>';
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

	$errors = step_errors( $config, $step );
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
