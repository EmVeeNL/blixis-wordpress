<?php
// Builds the COMBO_RESULT line from environment values and log files.

declare(strict_types=1);

$read = static fn (string $file): string => (string) @file_get_contents($file);
$db = new mysqli('db', 'root', (string) getenv('SPIKE_DB_ROOT_PASSWORD'));

$result = ['meta' => [
    'wp' => getenv('R_WP'),
    'php' => PHP_VERSION,
    'requested_php' => getenv('R_REQUESTED_PHP'),
    'db' => $db->server_info,
    'expect' => getenv('R_EXPECT'),
    'plugin_rc' => (int) getenv('R_PLUGIN_RC'),
    'plugin_out' => getenv('R_PLUGIN_OUT'),
    'theme_rc' => (int) getenv('R_THEME_RC'),
    'theme_out' => getenv('R_THEME_OUT'),
]];

if (getenv('R_EXPECT') !== 'reject') {
    $lines = array_values(array_filter(explode("\n", $read('/tmp/debug.log'))));
    $clean = array_map(static fn ($l) => substr((string) preg_replace('/^\[[^\]]*\] /', '', $l), 0, 160), $lines);
    $smoke = '';
    foreach (explode("\n", $read('/tmp/smoke.out')) as $line) {
        if (str_starts_with($line, 'SMOKE_RESULT ')) {
            $smoke = substr($line, 13);
        }
    }
    $result += [
        'base_home_status' => getenv('R_HOME'),
        'preview_theme' => getenv('R_THEME'),
        'smoke' => $smoke === '' ? null : json_decode($smoke, true),
        'smoke_stderr' => substr($read('/tmp/smoke.err'), 0, 600),
        'debug' => [
            'lines' => count($lines),
            'blixis_lines' => array_values(array_filter($clean, static fn ($l) => stripos($l, 'blixis') !== false)),
            'sample' => array_slice(array_values(array_unique($clean)), 0, 5),
        ],
    ];
}

echo 'COMBO_RESULT ' . json_encode($result) . "\n";
