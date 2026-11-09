<?php
/**
 * Plain PHP entry for the 03-06 colour parity tests. Reads a JSON array of
 * [foreground, background] pairs on stdin and prints, per pair, the contrast ratio and the
 * sRGB triple of the foreground (null when a colour is invalid).
 */

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');
$lib = dirname(__DIR__, 2) . '/plugins/blixis-blocks/inc/tokens/';
require $lib . 'validate.php';

use function Blixis\Blocks\Tokens\color_valid;
use function Blixis\Blocks\Tokens\contrast_ratio;
use function Blixis\Blocks\Tokens\to_srgb;

$pairs = json_decode((string) file_get_contents('php://stdin'), true, 8, JSON_THROW_ON_ERROR);
$out = [];
foreach ($pairs as [$fg, $bg]) {
    $out[] = [
        'valid' => color_valid($fg),
        'ratio' => contrast_ratio($fg, $bg),
        'srgb' => to_srgb($fg),
    ];
}
echo json_encode($out, JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR);
