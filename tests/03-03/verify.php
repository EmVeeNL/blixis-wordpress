<?php
// Task 03-03, after the browser stage: what the wizard left behind. Prints PASS/FAIL lines.

use function Blixis\Blocks\Tokens\store_read;

$label = '[' . get_bloginfo('version') . ' php' . PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION . ' after browser] ';
$check = static function (string $name, bool $ok, string $detail = '') use ($label): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . $label . $name . (!$ok && $detail !== '' ? ' -- ' . $detail : '') . "\n";
};

$stored = store_read();
$check('a valid configuration is stored', $stored !== null);
$check('the stored configuration belongs to the created child theme', ($stored['config']['theme']['slug'] ?? '') === 'acme-site');
$check('the second administrator\'s save won the conflict (revision 2)', ($stored['revision'] ?? 0) === 2, (string) ($stored['revision'] ?? ''));
$check('the winning save kept its colour', ($stored['config']['colors']['primary'] ?? '') === '#0a7a3f', (string) ($stored['config']['colors']['primary'] ?? ''));
$theme = wp_get_theme('acme-site');
$check('the wizard created the child theme with Blixis Base as parent', $theme->exists() && $theme->get_template() === 'blixis-base');
$check('the wizard starter choice generated its front page and patterns', is_file(get_theme_root() . '/acme-site/templates/front-page.html') && is_file(get_theme_root() . '/acme-site/patterns/intro.php') && is_file(get_theme_root() . '/acme-site/patterns/features.php'));
$check('the wizard did not activate any theme', get_stylesheet() === 'blixis-base', get_stylesheet());
$check('no theme was created by refused requests', !wp_get_theme('evil-site')->exists());

$hash = static function (string $dir): string {
    $out = [];
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)) as $f) {
        if ($f->isFile()) {
            $out[substr($f->getPathname(), strlen($dir))] = hash_file('sha256', $f->getPathname());
        }
    }
    ksort($out);
    return hash('sha256', serialize($out));
};
$check('Blixis Base files are unchanged', $hash(get_theme_root() . '/blixis-base') === $hash('/tmp/t/blixis-base'));
$log = is_readable('/tmp/debug.log') ? (string) file_get_contents('/tmp/debug.log') : '';
$ours = array_filter(explode("\n", $log), static fn ($line) => preg_match('/PHP (Fatal|Warning|Notice|Deprecated)/', $line) && preg_match('/blixis/i', $line));
$check('no PHP errors, warnings, notices, or deprecations from Blixis code were logged', !$ours, substr(implode(' | ', $ours), 0, 400));
$other = preg_match_all('/PHP (Fatal|Warning|Notice|Deprecated)/', $log);
if ($other) {
    preg_match('/PHP (Fatal|Warning|Notice|Deprecated):\s+([^\n]{0,160})/', $log, $first);
    echo 'NOTE ' . $label . "other PHP messages in the log (WordPress core or network): $other; first: " . ($first[2] ?? '') . "\n";
}
