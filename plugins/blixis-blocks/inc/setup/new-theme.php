<?php
/**
 * Setup wizard, step 1 for a new child theme: layout cards and style preset cards (task 03-07 Part D).
 *
 * Both are native radio groups inside the form, so they work without JavaScript. The server
 * validates the posted values: the layout goes to the child theme generator, and the preset
 * fills the token draft of the new theme.
 *
 * @package Blixis\Blocks
 */

declare(strict_types=1);

namespace Blixis\Blocks\Setup;

use function Blixis\Blocks\Tokens\canonical_json;
use function Blixis\Blocks\Tokens\color_valid;
use function Blixis\Blocks\Tokens\token_map;
use function Blixis\Blocks\Tokens\validate_bytes;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const DEFAULT_LAYOUT = 'blank';
const DEFAULT_PRESET = 'neutral';

/**
 * One translated line for each layout.
 *
 * @return array<string, string>
 */
function layout_lines(): array {
	return array(
		'blank'     => __( 'Header, content, and footer only.', 'blixis-blocks' ),
		'business'  => __( 'A hero, three features, and a call to action.', 'blixis-blocks' ),
		'portfolio' => __( 'An intro and a grid of projects.', 'blixis-blocks' ),
		'blog'      => __( 'A featured post and the latest posts.', 'blixis-blocks' ),
		'landing'   => __( 'One page with sections and anchor links.', 'blixis-blocks' ),
	);
}

/**
 * A font family safe to show in a sample: a generic family from the token map, else the system font.
 *
 * @param string $family Family from a preset.
 */
function sample_font( string $family ): string {
	return in_array( $family, token_map()['fontGenerics'], true ) ? $family : 'system-ui';
}

/**
 * The layout and style preset cards of the new-theme card.
 *
 * @param string                $layout Selected layout.
 * @param string                $preset Selected preset.
 * @param array<string, string> $errors Errors by path.
 */
function render_new_theme_choices( string $layout, string $preset, array $errors ): void {
	$names = layout_names();
	$lines = layout_lines();
	$error = isset( $errors['/theme/layout'] ) ? '<p class="blixis-setup-error" id="blixis-theme-layout-error">' . esc_html__( 'Choose one of the layouts.', 'blixis-blocks' ) . '</p>' : '';
	echo '<fieldset class="blixis-opt-group" id="blixis-theme-layout" tabindex="-1"><legend>' . esc_html__( 'Layout', 'blixis-blocks' ) . '</legend>';
	echo '<p class="blixis-setup-hint">' . esc_html__( 'The front page of the new theme. You edit it afterwards in the Site Editor.', 'blixis-blocks' ) . '</p>' . $error . '<div class="blixis-opt-cards">'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped above.
	foreach ( $names as $key => $name ) {
		$id  = 'blixis-new-layout-' . $key;
		$src = plugins_url( 'assets/layouts/' . $key . '.svg', dirname( __DIR__ ) );
		echo '<label class="blixis-opt-card" for="' . esc_attr( $id ) . '"><input type="radio" name="new_layout" id="' . esc_attr( $id ) . '" value="' . esc_attr( $key ) . '"' . checked( $layout, $key, false ) . '>';
		echo '<img class="blixis-opt-card__thumb" src="' . esc_url( $src ) . '" alt="" width="160" height="100" loading="lazy">';
		echo '<span class="blixis-opt-card__title">' . esc_html( $name ) . '</span><span class="blixis-opt-card__line">' . esc_html( $lines[ $key ] ) . '</span></label>';
	}
	echo '</div></fieldset>';

	echo '<fieldset class="blixis-opt-group" id="blixis-theme-preset" tabindex="-1"><legend>' . esc_html__( 'Style', 'blixis-blocks' ) . '</legend>';
	echo isset( $errors['/theme/preset'] ) ? '<p class="blixis-setup-error" id="blixis-theme-preset-error">' . esc_html__( 'Choose one of the styles.', 'blixis-blocks' ) . '</p>' : '';
	echo '<p class="blixis-setup-hint">' . esc_html__( 'The starting colours, fonts, and sizes. You can change every value in the next steps.', 'blixis-blocks' ) . '</p><div class="blixis-opt-cards blixis-opt-cards--presets">';
	foreach ( presets() as $key => $item ) {
		$id     = 'blixis-new-preset-' . $key;
		$colors = (array) ( $item['config']['colors'] ?? array() );
		$color  = static fn( string $name ): string => isset( $colors[ $name ] ) && color_valid( (string) $colors[ $name ] ) ? (string) $colors[ $name ] : 'transparent';
		$fonts  = (array) ( $item['config']['fonts'] ?? array() );
		echo '<label class="blixis-opt-card" for="' . esc_attr( $id ) . '"><input type="radio" name="new_preset" id="' . esc_attr( $id ) . '" value="' . esc_attr( $key ) . '"' . checked( $preset, $key, false ) . '>';
		echo '<span class="blixis-opt-card__sample" aria-hidden="true" style="background-color:' . esc_attr( $color( 'surface' ) ) . ';color:' . esc_attr( $color( 'foreground' ) ) . '">';
		echo '<span class="blixis-opt-card__aa" style="font-family:' . esc_attr( sample_font( (string) ( $fonts['heading'] ?? '' ) ) ) . '">Aa</span>';
		echo '<span class="blixis-opt-card__swatches">';
		foreach ( array( 'primary', 'accent', 'muted', 'foreground' ) as $name ) {
			echo '<span class="blixis-opt-card__swatch" style="background-color:' . esc_attr( $color( $name ) ) . '"></span>';
		}
		echo '</span></span>';
		echo '<span class="blixis-opt-card__title">' . esc_html( $item['name'] ) . '</span><span class="blixis-opt-card__line">' . esc_html( $item['description'] ) . '</span></label>';
	}
	echo '</div></fieldset>';
}

/**
 * Token config of a preset for a theme, validated, or null when the preset is unknown or invalid.
 *
 * @param string $preset Preset id.
 * @param string $slug   Child theme slug.
 * @return array<string, mixed>|null
 */
function preset_config( string $preset, string $slug ): ?array {
	$all = presets();
	if ( ! isset( $all[ $preset ] ) ) {
		return null;
	}
	$config          = $all[ $preset ]['config'];
	$config['theme'] = array(
		'slug'   => $slug,
		'parent' => 'blixis-base',
	);
	$checked         = validate_bytes( canonical_json( $config ) );
	return $checked['ok'] ? $checked['config'] : null;
}
