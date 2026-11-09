<?php
// Task 03-03, in process: the configuration store and wizard helpers. Prints PASS/FAIL lines.
// Leaves nothing stored, so the browser stage starts from a fresh site.

use function Blixis\Blocks\Setup\defaults;
use function Blixis\Blocks\Setup\field_id;
use function Blixis\Blocks\Setup\key_label;
use function Blixis\Blocks\Setup\step_errors;
use function Blixis\Blocks\Tokens\canonical_json;
use function Blixis\Blocks\Tokens\store_read;
use function Blixis\Blocks\Tokens\store_write;
use function Blixis\Blocks\Tokens\validate_bytes;

$label = '[' . get_bloginfo('version') . ' php' . PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION . ' in-process] ';
$check = static function (string $name, bool $ok, string $detail = '') use ($label): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . $label . $name . (!$ok && $detail !== '' ? ' -- ' . $detail : '') . "\n";
};

$config = defaults();
$config['theme']['slug'] = 'acme-site';
$check('wizard defaults are a valid config once a theme is chosen', validate_bytes(canonical_json($config))['ok']);
$check('wizard defaults use system fonts (Q13 open)', $config['fonts']['body'] === 'system-ui' && $config['fonts']['mono'] === 'ui-monospace');
$check('defaults start without a theme', defaults()['theme']['slug'] === '');

$check('nothing is stored on a fresh site', store_read() === null);
$bad = $config;
$bad['colors']['primary'] = 'red;}body{display:none}';
$r = store_write(canonical_json($bad), 0);
$check('an invalid config is refused with field errors', is_wp_error($r) && $r->get_error_code() === 'blixis_config_invalid' && ($r->get_error_data()['errors'][0]['path'] ?? '') === '/colors/primary');
$check('a refused config stores nothing', store_read() === null);

$r1 = store_write(canonical_json($config), 0);
$check('first save creates revision 1', !is_wp_error($r1) && $r1['revision'] === 1, is_wp_error($r1) ? $r1->get_error_message() : '');
$r = store_write(canonical_json($config), 0);
$check('a save from a stale revision is a conflict', is_wp_error($r) && $r->get_error_code() === 'blixis_config_conflict');
$second = $config;
$second['colors']['primary'] = '#ABC';
$r2 = store_write(canonical_json($second), 1);
$stored = store_read();
$check('second save creates revision 2 and keeps the previous config', !is_wp_error($r2) && $r2['revision'] === 2 && $stored && $stored['previous']['colors']['primary'] === '#155dfc');
$check('stored colours are normalized', $stored && $stored['config']['colors']['primary'] === '#aabbcc');

// Two writers from the same revision: exactly one wins.
$a = store_write(canonical_json($config), 2);
$b = store_write(canonical_json($second), 2);
$check('two writers from one revision: one wins, one conflicts', !is_wp_error($a) && is_wp_error($b) && $b->get_error_code() === 'blixis_config_conflict');

global $wpdb;
$autoload = $wpdb->get_var($wpdb->prepare("SELECT autoload FROM {$wpdb->options} WHERE option_name = %s", 'blixis_theme_config'));
$check('the stored option is autoloaded', in_array($autoload, ['yes', 'on', 'auto-on'], true), (string) $autoload);

// A tampered row is not trusted.
$raw = $wpdb->get_var($wpdb->prepare("SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", 'blixis_theme_config'));
$tampered = json_decode($raw, true);
$tampered['config']['colors']['primary'] = '#000000';
$wpdb->update($wpdb->options, ['option_value' => wp_json_encode($tampered)], ['option_name' => 'blixis_theme_config']);
$check('a row whose hash does not match is not trusted', store_read() === null);
$tampered['config']['colors']['primary'] = 'red;}';
$wpdb->update($wpdb->options, ['option_value' => wp_json_encode($tampered)], ['option_name' => 'blixis_theme_config']);
$check('a row with an invalid config is not trusted', store_read() === null);
$wpdb->update($wpdb->options, ['option_value' => $raw], ['option_name' => 'blixis_theme_config']);
$check('restoring the bytes restores trust', store_read() !== null);

$wrong = $config;
$wrong['colors']['primary'] = 'nope';
$wrong['spacing']['md'] = 'nope';
$codes = array_column(step_errors($wrong, 'colors'), 'path');
$check('a step reports only its own sections', $codes === ['/colors/primary'], implode(',', $codes));
$check('field ids follow contract paths', field_id('/typeScale/2xl') === 'blixis-typescale-2xl');
$check('labels are readable', key_label('contentWidth') === 'Content width' && key_label('2xl') === '2XL' && key_label('durationFast') === 'Duration fast');

delete_option('blixis_theme_config');
$check('cleanup leaves nothing stored', store_read() === null);
