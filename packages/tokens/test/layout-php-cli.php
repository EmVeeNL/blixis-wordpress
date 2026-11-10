<?php
/**
 * Plain PHP entry for the layout contract parity tests (task 03-07 Part A). Loads the Blixis
 * Blocks layout validator without WordPress. Reads a JSON array of base64 inputs on stdin and
 * prints one result per input: {ok, errors, config?, canonical?, hash?}. With the argument
 * "defaults" it prints the defaults for a slug read from stdin.
 */

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');
$lib = dirname(__DIR__, 3) . '/plugins/blixis-blocks/inc/';
require $lib . 'tokens/validate.php';
require $lib . 'tokens/css.php';
require $lib . 'layout/validate.php';

use function Blixis\Blocks\Layout\defaults;
use function Blixis\Blocks\Layout\validate_bytes;
use function Blixis\Blocks\Tokens\canonical_json;
use function Blixis\Blocks\Tokens\config_hash;

$input = json_decode((string) file_get_contents('php://stdin'), true, 16, JSON_THROW_ON_ERROR);
if (($argv[1] ?? '') === 'defaults') {
    echo canonical_json(defaults((string) $input));
    exit(0);
}
$out = [];
foreach ($input as $encoded) {
    $result = validate_bytes((string) base64_decode($encoded, true));
    $row = ['ok' => $result['ok'], 'errors' => $result['errors']];
    if ($result['ok']) {
        $row['canonical'] = canonical_json($result['config']);
        $row['hash'] = config_hash($result['config']);
    }
    $out[] = $row;
}
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
