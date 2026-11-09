<?php
// Task 03-05, after the browser stage. Prints PASS/FAIL lines.

use function Blixis\Blocks\Tokens\store_read;

$label = '[' . get_bloginfo('version') . ' php' . PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION . ' after browser] ';
$check = static function (string $name, bool $ok, string $detail = '') use ($label): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . $label . $name . (!$ok && $detail !== '' ? ' -- ' . $detail : '') . "\n";
};
$stored = store_read();
$check('the browser save and rollback left green as the stored colour', ($stored['config']['colors']['primary'] ?? '') === '#0a7a3f', (string) ($stored['config']['colors']['primary'] ?? ''));
$check('the browser save and rollback added two revisions (7)', ($stored['revision'] ?? 0) === 7, (string) ($stored['revision'] ?? ''));
$check('the rollback can be undone: the previous config is the browser draft colour', ($stored['previous']['colors']['primary'] ?? '') === '#b42318', (string) ($stored['previous']['colors']['primary'] ?? ''));
$check('the active theme is still the child theme', get_stylesheet() === 'acme-site');
$log = is_readable('/tmp/debug.log') ? (string) file_get_contents('/tmp/debug.log') : '';
$ours = array_filter(explode("\n", $log), static fn ($line) => preg_match('/PHP (Fatal|Warning|Notice|Deprecated)/', $line) && preg_match('/blixis/i', $line));
$check('no PHP errors, warnings, notices, or deprecations from Blixis code were logged', !$ours, substr(implode(' | ', $ours), 0, 400));
