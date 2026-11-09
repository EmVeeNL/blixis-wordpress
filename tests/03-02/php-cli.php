<?php
/**
 * Plain PHP entry for the 03-02 parity tests. Loads the Blixis Blocks validator and
 * generator without WordPress. Reads a JSON array of base64 inputs on stdin and prints
 * one result per input: {ok, errors, canonical?, hash?, css?, cssKey?, variables?}.
 */

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');
$lib = dirname(__DIR__, 2) . '/plugins/blixis-blocks/inc/tokens/';
require $lib . 'validate.php';
require $lib . 'css.php';
require $lib . 'theme-json.php';

use function Blixis\Blocks\Tokens\canonical_json;
use function Blixis\Blocks\Tokens\config_hash;
use function Blixis\Blocks\Tokens\css_cache_key;
use function Blixis\Blocks\Tokens\css_variables;
use function Blixis\Blocks\Tokens\generate_css;
use function Blixis\Blocks\Tokens\theme_json_from_validated_config;
use function Blixis\Blocks\Tokens\validate_bytes;

$input = json_decode((string) file_get_contents('php://stdin'), true, 16, JSON_THROW_ON_ERROR);
$out = [];
foreach ($input as $encoded) {
    $result = validate_bytes((string) base64_decode($encoded, true));
    $row = ['ok' => $result['ok'], 'errors' => $result['errors']];
    if ($result['ok']) {
        $row['canonical'] = canonical_json($result['config']);
        $row['hash'] = config_hash($result['config']);
        $row['css'] = generate_css($result['config']);
        $row['cssKey'] = css_cache_key($result['config']);
        $row['variables'] = css_variables($result['config']);
        $row['themeJson'] = theme_json_from_validated_config($result['config']);
        $row['variablesDark'] = css_variables($result['config'], true);
        $row['cssSchemes'] = [];
        foreach (['system', 'light', 'dark'] as $scheme) {
            $row['cssSchemes'][$scheme] = generate_css($result['config'], $scheme);
            $row['cssKeys'][$scheme] = css_cache_key($result['config'], $scheme);
        }
    }
    $out[] = $row;
}
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
