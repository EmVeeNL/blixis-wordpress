<?php
// Task 03-04, in process: font file checks, Font Library enumeration, and @font-face output.
// Installs fixture families directly in the Font Library. Prints PASS/FAIL lines.

use function Blixis\Blocks\Fonts\font_faces_for;
use function Blixis\Blocks\Fonts\inspect_file;
use function Blixis\Blocks\Fonts\installed_families;
use function Blixis\Blocks\Fonts\print_font_faces_for;
use function Blixis\Blocks\Fonts\usable_names;

$label = '[' . get_bloginfo('version') . ' php' . PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION . ' in-process] ';
$check = static function (string $name, bool $ok, string $detail = '') use ($label): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . $label . $name . (!$ok && $detail !== '' ? ' -- ' . $detail : '') . "\n";
};

$dir = wp_get_font_dir();
wp_mkdir_p($dir['path']);
$ttf = (string) file_get_contents('/tmp/t/fonts/LiberationSans-Regular.ttf');
$check('fixture font is present', strlen($ttf) > 1000);

// A WOFF 1.0 file built from the TTF, with zlib-compressed tables.
$woff = (static function (string $sfnt): string {
    $count = unpack('n', substr($sfnt, 4, 2))[1];
    $dirs = [];
    $data = '';
    $offset = 44 + 20 * $count;
    for ($i = 0; $i < $count; $i++) {
        $e = unpack('a4tag/Nsum/Noffset/Nlength', substr($sfnt, 12 + $i * 16, 16));
        $raw = substr($sfnt, $e['offset'], $e['length']);
        $packed = gzcompress($raw);
        $use = strlen($packed) < strlen($raw) ? $packed : $raw;
        $dirs[] = pack('a4NNNN', $e['tag'], $offset + strlen($data), strlen($use), strlen($raw), $e['sum']);
        $data .= $use . str_repeat("\0", (4 - strlen($use) % 4) % 4);
    }
    $length = 44 + 20 * $count + strlen($data);
    return 'wOFF' . substr($sfnt, 0, 4) . pack('Nnn', $length, $count, 0) . pack('N', strlen($sfnt)) . pack('nn', 1, 0) . pack('NNNNN', 0, 0, 0, 0, 0) . implode('', $dirs) . $data;
})($ttf);

$files = [
    'liberation-regular.ttf' => $ttf,
    'liberation-bold.ttf' => (string) file_get_contents('/tmp/t/fonts/LiberationSans-Bold.ttf'),
    'liberation.woff' => $woff,
    'evil.woff2' => "<?php echo 'not a font';",
    'renamed.woff2' => $ttf,
    'huge.ttf' => "\x00\x01\x00\x00" . str_repeat("\0", 2 * 1024 * 1024),
    'vector.svg' => '<svg xmlns="http://www.w3.org/2000/svg"/>',
];
foreach ($files as $name => $bytes) {
    file_put_contents($dir['path'] . '/' . $name, $bytes);
}
$i = static fn (string $name): array => inspect_file($dir['path'] . '/' . $name);

$r = $i('liberation-regular.ttf');
$check('TrueType face is recognised', $r['format'] === 'ttf' && $r['errors'] === [], json_encode($r['errors']));
$check('licence text is read from the name table', str_contains((string) $r['license'], 'Open Font License'), (string) $r['license']);
$check('licence URL is read from the name table', str_contains((string) $r['license_url'], 'scripts.sil.org/OFL'), (string) $r['license_url']);
$check('copyright is read from the name table', str_contains((string) $r['copyright'], 'Red Hat'), (string) $r['copyright']);
$w = $i('liberation.woff');
$check('WOFF face is recognised and its licence read', $w['format'] === 'woff' && $w['errors'] === [] && $w['license'] === $r['license'], json_encode($w['errors']));
$check('a PHP file named .woff2 is not a font', in_array('not_a_font', $i('evil.woff2')['errors'], true));
$check('a TrueType file named .woff2 is a type mismatch', in_array('type_mismatch', $i('renamed.woff2')['errors'], true));
$check('a face over 2 MiB is refused', in_array('too_large', $i('huge.ttf')['errors'], true));
$check('an SVG font is refused by extension', in_array('extension', $i('vector.svg')['errors'], true));
$check('a missing file is reported', in_array('missing', $i('nope.ttf')['errors'], true));

// Font Library posts, as Appearance → Fonts would store them.
$family = static function (string $name, string $slug, array $faces): int {
    $id = wp_insert_post(['post_type' => 'wp_font_family', 'post_status' => 'publish', 'post_title' => $name, 'post_name' => $slug, 'post_content' => wp_json_encode(['name' => $name, 'slug' => $slug, 'fontFamily' => '"' . $name . '", sans-serif'])]);
    foreach ($faces as [$weight, $src]) {
        wp_insert_post(['post_type' => 'wp_font_face', 'post_status' => 'publish', 'post_parent' => $id, 'post_title' => "$name $weight", 'post_content' => wp_json_encode(['fontFamily' => $name, 'fontWeight' => $weight, 'fontStyle' => 'normal', 'src' => $src])]);
    }
    return (int) $id;
};
$url = trailingslashit($dir['url']);
$family('Liberation Sans', 'liberation-sans', [['400', $url . 'liberation-regular.ttf'], ['700', $url . 'liberation-bold.ttf']]);
$family('Broken Font', 'broken-font', [['400', $url . 'evil.woff2']]);
$family('Remote Font', 'remote-font', [['400', 'https://fonts.example.test/remote.woff2']]);
$family('Traversal Font', 'traversal-font', [['400', $url . '../../../wp-config.php']]);
$family('Bad;Name', 'bad-name', [['400', $url . 'liberation.woff']]);
$family('Empty Font', 'empty-font', []);

$families = [];
foreach (installed_families() as $f) {
    $families[$f['name']] = $f;
}
$check('Liberation Sans is usable with two faces', ($families['Liberation Sans']['usable'] ?? false) && count($families['Liberation Sans']['faces']) === 2);
$check('a family whose file is not a font is not usable', ($families['Broken Font']['problems'] ?? []) === ['face']);
$check('a remote font is not usable', !($families['Remote Font']['usable'] ?? true) && ($families['Remote Font']['faces'][0]['errors'] ?? []) === ['not_local']);
$check('a path outside the fonts directory is not usable', ($families['Traversal Font']['faces'][0]['errors'] ?? []) === ['not_local']);
$check('a family name that a token cannot hold is not usable', in_array('name', $families['Bad;Name']['problems'] ?? [], true));
$check('a family without files is not usable', in_array('no_faces', $families['Empty Font']['problems'] ?? [], true));
$check('only Liberation Sans is offered', usable_names() === ['Liberation Sans'], implode(',', usable_names()));

$config = ['fonts' => ['body' => 'Liberation Sans', 'heading' => 'system-ui', 'mono' => 'Broken Font']];
$faces = font_faces_for($config);
$check('@font-face data covers only chosen, usable families', array_keys($faces) === ['Liberation Sans'] && count($faces['Liberation Sans']) === 2);
$check('every face is local with font-display swap', !array_filter($faces['Liberation Sans'], static fn ($f) => !str_starts_with($f['src'][0], $url) || $f['font-display'] !== 'swap'));
ob_start();
print_font_faces_for($config);
$css = (string) ob_get_clean();
$check('printed @font-face rules use local files and swap', substr_count($css, '@font-face') === 2 && str_contains($css, 'font-display:swap') && !str_contains($css, 'example.test') && !str_contains($css, 'evil.woff2'), substr($css, 0, 300));
ob_start();
print_font_faces_for(['fonts' => ['body' => 'system-ui', 'heading' => 'system-ui', 'mono' => 'ui-monospace']]);
$check('generic fonts print no @font-face rules', ob_get_clean() === '');
