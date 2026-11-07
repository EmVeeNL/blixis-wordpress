<?php
/**
 * Pure projection of a validated BlixisThemeConfig v1 to theme.json data.
 *
 * Contract: docs/contracts/tokens (generator version 1). This module performs no
 * option reads, no filtering and no output. Validation and persistence arrive with
 * task 03-02; until then the shape is checked defensively and the function fails
 * closed by returning an empty array.
 *
 * @package Blixis\Blocks
 */

declare(strict_types=1);

namespace Blixis\Blocks\Tokens;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Closed token names and value grammars for contract v1.
 *
 * Mirrors docs/contracts/tokens/v1/token-map.json; kept inline so the plugin
 * deploys without the docs directory.
 *
 * @return array<string, mixed>
 */
function theme_json_contract(): array {
    $length   = '(?:0|(?:[1-9][0-9]{0,3}|0)(?:\.[0-9]{1,4})?(?:rem|px))';
    $s_length = '(?:0|(?:[1-9][0-9]{0,2}|0)(?:\.[0-9]{1,3})?(?:rem|px))';
    $color    = '#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})';
    $layer    = '(?:inset )?-?' . $s_length . ' -?' . $s_length . ' ' . $s_length . ' -?' . $s_length . ' ' . $color;

    return array(
        'sections'    => array(
            'colors'    => array( 'primary', 'surface', 'foreground', 'muted', 'accent' ),
            'fonts'     => array( 'body', 'heading', 'mono' ),
            'typeScale' => array( 'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl' ),
            'spacing'   => array( 'xs', 'sm', 'md', 'lg', 'xl' ),
            'radius'    => array( 'sm', 'md', 'lg' ),
            'layout'    => array( 'contentWidth', 'wideWidth', 'gutter' ),
            'shadows'   => array( 'sm', 'md', 'lg' ),
            'motion'    => array( 'durationFast', 'durationBase', 'durationSlow', 'easing' ),
        ),
        'patterns'    => array(
            'color'    => '/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/D',
            'font'     => '/^(?=.{1,64}$)[A-Za-z][A-Za-z0-9]*(?:[ -][A-Za-z0-9]+){0,7}$/D',
            'length'   => '/^' . $length . '$/D',
            'shadow'   => '/^(?:none|' . $layer . '(?:, ' . $layer . '){0,3})$/D',
            'duration' => '/^(?:0|[1-9][0-9]{0,3})ms$/D',
            'easing'   => '/^(?:linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\((?:0(?:\.[0-9]{1,3})?|1(?:\.0{1,3})?), -?[0-9](?:\.[0-9]{1,3})?, (?:0(?:\.[0-9]{1,3})?|1(?:\.0{1,3})?), -?[0-9](?:\.[0-9]{1,3})?\))$/D',
        ),
        'generics'    => array( 'serif', 'sans-serif', 'monospace', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace' ),
        'fallbacks'   => array(
            'body'    => 'system-ui, sans-serif',
            'heading' => 'system-ui, sans-serif',
            'mono'    => 'ui-monospace, monospace',
        ),
        'parent'      => 'blixis-base',
        'slug'        => '/^[a-z][a-z0-9-]{0,62}$/D',
        'breakpoints' => array(
			'sm' => '40rem',
			'md' => '48rem',
			'lg' => '64rem',
			'xl' => '80rem',
		),
    );
}

/**
 * Whether a section value matches the grammar for its section and key.
 *
 * @param string $section Section name.
 * @param string $key     Token key.
 * @param mixed  $value   Candidate value.
 * @param array  $contract Contract data.
 */
function theme_json_value_ok( string $section, string $key, mixed $value, array $contract ): bool {
    if (!is_string($value)) {
        return false;
    }
    $patterns = $contract['patterns'];
    $kind     = match ($section) {
        'colors'  => 'color',
        'fonts'   => 'font',
        'shadows' => 'shadow',
        'motion'  => 'easing' === $key ? 'easing' : 'duration',
        default   => 'length',
    };
    if ('font' === $kind && in_array($value, $contract['generics'], true)) {
        return true;
    }
    return 1 === preg_match($patterns[ $kind ], $value);
}

/**
 * Check that the config has exactly the v1 shape and valid, normalized values.
 *
 * @param array $config Candidate config.
 */
function theme_json_shape_ok( array $config ): bool {
    $contract = theme_json_contract();
    $expected = array_merge(array( 'schemaVersion', 'theme', 'breakpoints' ), array_keys($contract['sections']));
    $keys     = array_keys($config);
    sort($expected);
    sort($keys);
    if ($keys !== $expected || 1 !== $config['schemaVersion']) {
        return false;
    }

    $theme = $config['theme'];
    if (
        !is_array($theme) || array_keys($theme) !== array( 'slug', 'parent' )
        || !is_string($theme['slug']) || 1 !== preg_match($contract['slug'], $theme['slug'])
        || $contract['parent'] !== $theme['parent']
    ) {
        return false;
    }
    if ($config['breakpoints'] !== $contract['breakpoints']) {
        return false;
    }

    foreach ($contract['sections'] as $section => $names) {
        $values = $config[ $section ];
        if (!is_array($values)) {
            return false;
        }
        $have = array_keys($values);
        $want = $names;
        sort($have);
        sort($want);
        if ($have !== $want) {
            return false;
        }
        foreach ($names as $name) {
            if (!theme_json_value_ok($section, $name, $values[ $name ], $contract)) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Build a stack for a font token: generic keywords stay bare, names are quoted.
 *
 * @param string $key    Font token key.
 * @param string $family Validated family.
 */
function theme_json_font_stack( string $key, string $family ): string {
    $contract = theme_json_contract();
    if (in_array($family, $contract['generics'], true)) {
        return $family;
    }
    return '"' . $family . '", ' . ( $contract['fallbacks'][ $key ] ?? 'sans-serif' );
}

/**
 * Build preset entries for one section in contract order.
 *
 * @param array<string, string> $values Section values keyed by slug.
 * @param callable              $build  Receives slug and value; returns extra fields.
 * @return list<array<string, mixed>>
 */
function theme_json_presets( array $values, callable $build ): array {
    $out = array();
    foreach ($values as $slug => $value) {
        $slug  = (string) $slug;
        $out[] = array(
			'slug' => $slug,
			'name' => ucfirst($slug),
		) + $build($slug, $value);
    }
    return $out;
}

/**
 * Project a normalized, validated BlixisThemeConfig v1 to theme.json data.
 *
 * Returns an empty array when the shape is malformed or unvalidated, so a caller
 * that merges the result applies nothing.
 *
 * @param array $config Validated config as an associative array.
 * @return array<string, mixed>
 */
function theme_json_from_validated_config( array $config ): array {
    if (!theme_json_shape_ok($config)) {
        return array();
    }

    $layout = $config['layout'];
    $motion = $config['motion'];

    return array(
        'version'  => 3,
        'settings' => array(
            'color'      => array(
                'defaultPalette' => false,
                'palette'        => theme_json_presets(
                    $config['colors'],
                    static fn( string $slug, string $value ): array => array( 'color' => $value )
                ),
            ),
            'typography' => array(
                'defaultFontSizes' => false,
                'fontFamilies'     => theme_json_presets(
                    $config['fonts'],
                    static fn( string $slug, string $value ): array => array( 'fontFamily' => theme_json_font_stack($slug, $value) )
                ),
                'fontSizes'        => theme_json_presets(
                    $config['typeScale'],
                    static fn( string $slug, string $value ): array => array(
						'size'  => $value,
						'fluid' => false,
					)
                ),
            ),
            'spacing'    => array(
                'defaultSpacingSizes' => false,
                'spacingSizes'        => theme_json_presets(
                    $config['spacing'],
                    static fn( string $slug, string $value ): array => array( 'size' => $value )
                ),
            ),
            'border'     => array(
                'radiusSizes' => theme_json_presets(
                    $config['radius'],
                    static fn( string $slug, string $value ): array => array( 'size' => $value )
                ),
            ),
            'shadow'     => array(
                'defaultPresets' => false,
                'presets'        => theme_json_presets(
                    $config['shadows'],
                    static fn( string $slug, string $value ): array => array( 'shadow' => $value )
                ),
            ),
            'layout'     => array(
                'contentSize' => $layout['contentWidth'],
                'wideSize'    => $layout['wideWidth'],
            ),
            'custom'     => array(
                'blixis' => array(
                    'layout' => array( 'gutter' => $layout['gutter'] ),
                    'motion' => array(
                        'durationFast' => $motion['durationFast'],
                        'durationBase' => $motion['durationBase'],
                        'durationSlow' => $motion['durationSlow'],
                        'easing'       => $motion['easing'],
                    ),
                ),
            ),
        ),
        'styles'   => array(
            'color' => array(
                'background' => 'var:preset|color|surface',
                'text'       => 'var:preset|color|foreground',
            ),
        ),
    );
}
