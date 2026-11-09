<?php
// Task 03-04, after the browser stage. Prints PASS/FAIL lines.

$label = '[' . get_bloginfo('version') . ' php' . PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION . ' after browser] ';
$check = static function (string $name, bool $ok, string $detail = '') use ($label): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . $label . $name . (!$ok && $detail !== '' ? ' -- ' . $detail : '') . "\n";
};
$dir = wp_get_font_dir();
$names = array_map('basename', glob($dir['path'] . '/*') ?: []);
$check('the rejected upload left no file in the fonts directory', !array_filter($names, static fn ($n) => str_contains($n, 'upload-evil')), implode(',', $names));
$check('no executable file was written to the fonts directory', !array_filter($names, static fn ($n) => preg_match('/\.(php|phtml|phar)$/i', $n)), implode(',', $names));
$uploaded = get_posts(['post_type' => 'wp_font_family', 'name' => 'upload-sans', 'post_status' => 'publish']);
$check('the valid upload created a Font Library family', count($uploaded) === 1);
$log = is_readable('/tmp/debug.log') ? (string) file_get_contents('/tmp/debug.log') : '';
$ours = array_filter(explode("\n", $log), static fn ($line) => preg_match('/PHP (Fatal|Warning|Notice|Deprecated)/', $line) && preg_match('/blixis/i', $line));
$check('no PHP errors, warnings, notices, or deprecations from Blixis code were logged', !$ours, substr(implode(' | ', $ours), 0, 400));
