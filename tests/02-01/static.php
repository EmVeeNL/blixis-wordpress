<?php
// Host-side static checks for task 02-01. No WordPress, Docker, or network needed.
// Usage: php static.php <repo-root>. Exit 0 if all pass, 1 otherwise.
// Checks contract-level facts (headers, presets, template content), not implementation internals.

declare(strict_types=1);

$repo = rtrim($argv[1] ?? dirname(__DIR__, 2), '/');
$fails = 0;
$check = static function (string $name, bool $ok, string $detail = '') use (&$fails): void {
    if (!$ok) {
        ++$fails;
    }
    echo ($ok ? 'PASS ' : 'FAIL ') . '[static] ' . $name . (!$ok && $detail !== '' ? ' -- ' . $detail : '') . "\n";
};
$header = static function (string $file, string $key): string {
    $head = (string) file_get_contents($file, false, null, 0, 8192);
    return preg_match('/^[ \t\/*#@]*' . preg_quote($key, '/') . ':(.*)$/mi', $head, $m) ? trim($m[1]) : '';
};
$files = static function (string $dir, string $ext): array {
    $out = [];
    if (!is_dir($dir)) {
        return $out;
    }
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)) as $f) {
        if ($f->isFile() && str_ends_with($f->getFilename(), $ext) && !str_contains($f->getPathname(), '/node_modules/')) {
            $out[] = $f->getPathname();
        }
    }
    sort($out);
    return $out;
};

$theme = "$repo/themes/blixis-base";
$plugin = "$repo/plugins/blixis-blocks/blixis-blocks.php";

// Support floors: WordPress 7.0, PHP 8.3 (docs/development/SUPPORT_MATRIX.md).
$check('theme style.css exists', is_file("$theme/style.css"));
$check('theme Requires at least is 7.0', $header("$theme/style.css", 'Requires at least') === '7.0', $header("$theme/style.css", 'Requires at least'));
$check('theme Requires PHP is 8.3', $header("$theme/style.css", 'Requires PHP') === '8.3', $header("$theme/style.css", 'Requires PHP'));
$check('theme has no Template header (parent theme)', $header("$theme/style.css", 'Template') === '');
$check('theme has Text Domain blixis-base', $header("$theme/style.css", 'Text Domain') === 'blixis-base');
$check('plugin Requires at least is 7.0', $header($plugin, 'Requires at least') === '7.0', $header($plugin, 'Requires at least'));
$check('plugin Requires PHP is 8.3', $header($plugin, 'Requires PHP') === '8.3', $header($plugin, 'Requires PHP'));
$check('plugin keeps ABSPATH guard', str_contains((string) file_get_contents($plugin), "defined('ABSPATH')"));

// PHP syntax across theme and plugin.
$php = array_merge($files($theme, '.php'), $files("$repo/plugins/blixis-blocks", '.php'));
foreach ($php as $file) {
    exec('php -l ' . escapeshellarg($file) . ' 2>&1', $o, $rc);
    $check('php -l ' . substr($file, strlen($repo) + 1), $rc === 0, implode(' ', $o));
    $o = [];
}
// No file may print output on load (headers already sent breaks REST and admin).
foreach ($php as $file) {
    $check('no output before <?php: ' . substr($file, strlen($repo) + 1), str_starts_with((string) file_get_contents($file), '<?php'));
}

// theme.json: valid, version 3, presets align with the token contract, no orphan references.
$tj = json_decode((string) @file_get_contents("$theme/theme.json"), true);
$check('theme.json parses', is_array($tj), json_last_error_msg());
if (is_array($tj)) {
    $check('theme.json schema version is 3', ($tj['version'] ?? null) === 3);
    $palette = array_column($tj['settings']['color']['palette'] ?? [], 'slug');
    $check('palette slugs are unique', count($palette) === count(array_unique($palette)));
    $check('default palette disabled', ($tj['settings']['color']['defaultPalette'] ?? true) === false);
    $golden = json_decode((string) @file_get_contents("$repo/docs/contracts/tokens/v1/golden/default.theme.json"), true);
    $wanted = array_column($golden['settings']['color']['palette'] ?? [], 'slug');
    $check('token-contract golden palette readable', $wanted !== []);
    $check('palette contains every token-contract colour slug', !array_diff($wanted, $palette), 'missing: ' . implode(',', array_diff($wanted, $palette)));
    // Orphans: palette slugs that nothing references anywhere in the theme (theme.json, templates, parts, patterns, CSS).
    $corpus = (string) file_get_contents("$theme/theme.json");
    foreach (array_merge($files($theme, '.html'), $files($theme, '.css'), $files($theme, '.php')) as $f) {
        $corpus .= "\n" . file_get_contents($f);
    }
    $extra = array_diff($palette, $wanted);
    foreach ($extra as $slug) {
        $used = (bool) preg_match('/(preset\|color\|' . preg_quote($slug, '/') . '\b|--wp--preset--color--' . preg_quote($slug, '/') . '\b|"(?:background|text|gradient)Color":"' . preg_quote($slug, '/') . '")/', $corpus);
        $check("palette slug outside the token contract is used: $slug", $used, 'orphaned preset');
    }
    // Every var:preset|color|X reference resolves to a palette slug.
    preg_match_all('/var:preset\|color\|([a-z0-9-]+)/', (string) file_get_contents("$theme/theme.json"), $m);
    $missing = array_diff(array_unique($m[1]), $palette);
    $check('theme.json colour references resolve to palette slugs', !$missing, 'unresolved: ' . implode(',', $missing));
    $check('layout sizes defined', !empty($tj['settings']['layout']['contentSize']) && !empty($tj['settings']['layout']['wideSize']));
}

// Singular template prints post-content. Accept the standard hierarchy names without pinning one.
$singular = array_filter(
    array_merge(glob("$theme/templates/{singular,single,page}*.html", GLOB_BRACE) ?: [], glob("$theme/templates/index.html") ?: []),
    static fn ($f) => str_contains((string) file_get_contents($f), 'wp:post-content')
);
$names = array_map('basename', $singular);
$check('a singular-capable template (singular/single/page) prints wp:post-content', (bool) array_filter($names, static fn ($n) => $n !== 'index.html'), implode(',', $names) ?: 'none');
foreach (array_merge($files("$theme/templates", '.html'), $files("$theme/parts", '.html')) as $f) {
    $html = (string) file_get_contents($f);
    $rel = substr($f, strlen($repo) + 1);
    $check("block comments balanced: $rel", balanced($html));
    $check("no inline script/style in $rel", !preg_match('/<(script|style)\b/i', $html));
    $check("no hard-coded brand names in $rel", !preg_match('/wilde|groei/i', $html));
}

// Neutral parent: no site brand strings anywhere in the theme or plugin sources.
foreach (array_merge($files($theme, '.php'), $files($theme, '.json'), $files($theme, '.css'), $files($theme, '.html')) as $f) {
    $check('neutral (no Wilde Groei branding): ' . substr($f, strlen($repo) + 1), !preg_match('/wilde\s*groei/i', (string) file_get_contents($f)));
}

// Block markup must have the same number of openers as closers (self-closing excluded).
function balanced(string $html): bool
{
    preg_match_all('/<!--\s+wp:[a-z0-9\/-]+(?:\s+\{.*?\})?\s+(\/)?-->/s', $html, $open);
    $nonSelf = count(array_filter($open[1], static fn ($s) => $s === ''));
    return $nonSelf === preg_match_all('/<!--\s+\/wp:[a-z0-9\/-]+\s+-->/', $html);
}

echo $fails === 0 ? "STATIC OK\n" : "STATIC FAILED: $fails\n";
exit($fails === 0 ? 0 : 1);
