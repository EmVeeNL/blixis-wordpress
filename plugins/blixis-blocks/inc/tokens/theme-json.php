<?php
/**
 * Pure projection of a validated BlixisThemeConfig (contract v2) to theme.json data.
 *
 * Contract: docs/contracts/tokens (generator version 2). This module performs no
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
 * Check that the config has exactly the current schema's shape and valid, normalized values.
 *
 * Uses the shipped token map and the validator's value rules, so there is one definition.
 *
 * @param array $config Candidate config.
 */
function theme_json_shape_ok( array $config ): bool {
    $map      = token_map();
    $grammars = $map['grammars'];
    $expected = array( 'schemaVersion', 'theme' );
    foreach ($map['sections'] as $section) {
        $expected[] = $section['section'];
    }
    $keys = array_keys($config);
    if (isset($config['colorsDark'])) {
        $expected[] = 'colorsDark';
    }
    sort($expected);
    sort($keys);
    if ($keys !== $expected || $map['contractVersion'] !== $config['schemaVersion']) {
        return false;
    }

    $theme = $config['theme'];
    if (
        !is_array($theme) || array_keys($theme) !== array( 'slug', 'parent' )
        || !is_string($theme['slug']) || !grammar_matches($grammars['slug'], $theme['slug'])
        || $map['theme']['parent'] !== $theme['parent']
    ) {
        return false;
    }

    foreach ($map['sections'] as $section) {
        $name   = $section['section'];
        $values = $config[ $name ];
        if (!is_array($values)) {
            return false;
        }
        $names = array_keys($section['tokens']);
        $have  = array_keys($values);
        sort($have);
        $want = $names;
        sort($want);
        if ($have !== $want) {
            return false;
        }
        if ('breakpoint' === $section['kind']) {
            if ($values !== $map['breakpointPreset']) {
                return false;
            }
            continue;
        }
        foreach ($names as $key) {
            if (!theme_json_value_ok($map, $section, (string) $key, $values[ $key ])) {
                return false;
            }
        }
    }
    if (isset($config['colorsDark'])) {
        $dark = $config['colorsDark'];
        if (!is_array($dark)) {
            return false;
        }
        $have = array_keys($dark);
        $want = array_keys($map['sections'][0]['tokens']);
        sort($have);
        sort($want);
        if ($have !== $want) {
            return false;
        }
        foreach ($dark as $value) {
            if (!is_string($value) || !color_valid($value) || !theme_json_normalized_color($value)) {
                return false;
            }
        }
    }
    return true;
}

/**
 * Whether a section value matches the grammar for its field, in normalized form.
 *
 * @param array  $map     Token map.
 * @param array  $section Section definition.
 * @param string $key     Token key.
 * @param mixed  $value   Candidate value.
 */
function theme_json_value_ok( array $map, array $section, string $key, mixed $value ): bool {
    if (!is_string($value)) {
        return false;
    }
    if ('font' === $section['kind']) {
        return in_array($value, $map['fontGenerics'], true) || grammar_matches($map['grammars']['font'], $value);
    }
    if ('color' === $section['kind']) {
        return color_valid($value) && theme_json_normalized_color($value);
    }
    if ('shadow' === $section['kind'] && strtolower($value) !== $value) {
        return false;
    }
    return value_fits($map['grammars'], field_grammar($map, $section, $key), $value, false);
}

/**
 * Hex colours must be in the validator's normalized form: lower case, six or eight digits.
 *
 * @param string $value Valid colour.
 */
function theme_json_normalized_color( string $value ): bool {
    return '#' !== $value[0] || 1 === preg_match('/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/D', $value);
}

/**
 * Build a stack for a font token: generic keywords stay bare, names are quoted.
 *
 * @param string $key    Font token key.
 * @param string $family Validated family.
 */
function theme_json_font_stack( string $key, string $family ): string {
    $map = token_map();
    if (in_array($family, $map['fontGenerics'], true)) {
        return $family;
    }
    return '"' . $family . '", ' . ( $map['fontFallbacks'][ $key ] ?? 'sans-serif' );
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
 * Project a normalized, validated BlixisThemeConfig to theme.json data.
 *
 * Requires the normalized validator result, including contract key order for theme
 * and breakpoints. This defensive guard is not the raw-input validator: parsing,
 * limits, error diagnostics and normalization belong to task 03-02. Returns an
 * empty array for a shape or value that fails the guard; merging it applies nothing.
 *
 * @param array $config Validated config as an associative array.
 * @return array<string, mixed>
 */
function theme_json_from_validated_config( array $config ): array {
    if (!theme_json_shape_ok($config)) {
        return array();
    }

    $layout      = $config['layout'];
    $motion      = $config['motion'];
    $color_names = token_map()['sections'][0]['tokens'];

    return array(
        'version'  => 3,
        'settings' => array(
            'color'      => array(
                'defaultPalette' => false,
                'palette'        => theme_json_presets(
                    $config['colors'],
                    // With a dark palette the presets point at the custom properties, which the token
                    // stylesheet switches under prefers-color-scheme, so blocks follow the scheme.
                    static fn( string $slug, string $value ): array => array( 'color' => isset($config['colorsDark']) ? 'var(' . ( $color_names[ $slug ] ?? '' ) . ')' : $value )
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
