<?php
/** Neutral starter token presets. */
declare(strict_types=1);

namespace Blixis\Blocks\Setup;

if (!defined('ABSPATH')) {
    exit;
}

/** Return the named preset configs, without a site-specific theme slug. */
function presets(): array {
    $meta   = array(
        'neutral' => array( __('Neutral', 'blixis-blocks'), __('A calm, balanced starting point.', 'blixis-blocks') ),
        'warm'    => array( __('Warm', 'blixis-blocks'), __('Earthy tones with a soft paper surface.', 'blixis-blocks') ),
        'fresh'   => array( __('Fresh', 'blixis-blocks'), __('A clear green palette with a light surface.', 'blixis-blocks') ),
        'bold'    => array( __('Bold', 'blixis-blocks'), __('Strong contrast with a focused accent.', 'blixis-blocks') ),
        'minimal' => array( __('Minimal', 'blixis-blocks'), __('Quiet neutrals and restrained accents.', 'blixis-blocks') ),
        'night'   => array( __('Night', 'blixis-blocks'), __('A dark surface with a bright readable palette.', 'blixis-blocks') ),
    );
    $result = array();

    foreach ($meta as $id => $labels) {
        $path = __DIR__ . '/presets/' . $id . '.json';
        // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- These are local, bundled preset files, not remote URLs.
        $bytes  = is_readable($path) ? file_get_contents($path) : false;
        $config = false !== $bytes ? json_decode($bytes, true) : null;
        if (is_array($config)) {
            $result[ $id ] = array(
                'id'          => $id,
                'name'        => $labels[0],
                'description' => $labels[1],
                'config'      => $config,
            );
        }
    }

    return $result;
}
