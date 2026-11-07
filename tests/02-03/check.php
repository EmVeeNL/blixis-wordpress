<?php
// Task 02-03 proof. Run with `wp eval-file` inside the disposable fixture. Prints
// PASS/FAIL/NOTE lines. Observable behaviour only: generator output, WordPress's own
// global settings/CSS, editor settings, and real HTTP responses.
//
// The generator is `Blixis\Blocks\Tokens\theme_json_from_validated_config()`, shipped by
// the plugin bootstrap. Until it exists every dependent check FAILs; none is skipped.

$label = '[' . getenv('T0203_WP') . ' php' . PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION . '] ';
$fails = 0;
$check = static function (string $name, bool $ok, string $detail = '') use (&$fails, $label): void {
    if (!$ok) {
        ++$fails;
    }
    echo ($ok ? 'PASS ' : 'FAIL ') . $label . $name . (!$ok && $detail !== '' ? ' -- ' . substr($detail, 0, 400) : '') . "\n";
};
$note = static function (string $name, string $value) use ($label): void {
    echo 'NOTE ' . $label . $name . ': ' . substr($value, 0, 300) . "\n";
};

const T0203_FN = 'Blixis\\Blocks\\Tokens\\theme_json_from_validated_config';
$contract = '/tmp/t/contract';
$raw = static fn (string $rel): string => (string) file_get_contents("$contract/$rel");
$json = static fn (string $rel): array => json_decode($raw($rel), true, 512, JSON_THROW_ON_ERROR);
$canon = static function ($v) use (&$canon) {
    if (!is_array($v)) {
        return $v;
    }
    $v = array_map($canon, $v);
    if (!array_is_list($v)) {
        ksort($v, SORT_STRING);
    }
    return $v;
};
$same = static fn ($a, $b): bool => json_encode($canon($a)) === json_encode($canon($b));
$gen = static fn (array $c): array => (T0203_FN)($c);
$css_vars = static function (string $css): array {
    $out = [];
    if (preg_match_all('~(--[a-z0-9-]+):\s*([^;]+);~i', $css, $m, PREG_SET_ORDER)) {
        foreach ($m as $hit) {
            $out[$hit[1]] = trim($hit[2]);
        }
    }
    ksort($out);
    return $out;
};
$fresh = static function (array $types = ['variables']): string {
    wp_clean_theme_json_cache();
    return wp_get_global_stylesheet($types);
};
$use_config = static function (?array $config): void {
    if ($config === null) {
        delete_option('t0203_config');
    } else {
        update_option('t0203_config', wp_json_encode($config), false);
    }
    wp_clean_theme_json_cache();
};
$get = static function (string $url): array {
    $ctx = stream_context_create(['http' => ['ignore_errors' => true, 'timeout' => 30]]);
    $body = (string) @file_get_contents($url, false, $ctx);
    $status = 0;
    foreach ($http_response_header ?? [] as $h) {
        if (preg_match('#^HTTP/\S+ (\d+)#', $h, $m)) {
            $status = (int) $m[1];
        }
    }
    return [$status, $body];
};
$tree_hash = static function (string $dir): string {
    $files = [];
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) {
        $files[substr($f->getPathname(), strlen($dir))] = md5_file($f->getPathname());
    }
    ksort($files);
    return md5(json_encode($files));
};
$decode = static fn (string $rel): array => json_decode($raw($rel), true);

$default = $decode('valid/default.json');
$generic = $decode('valid/generic-fonts.json');
$golden_default = $decode('golden/default.theme.json');
$golden_generic = $decode('golden/generic-fonts.theme.json');
$map = $json('token-map.json');

// ------------------------------------------------------------------ Preconditions.
$check('plugin blixis-blocks is active', in_array('blixis-blocks/blixis-blocks.php', (array) get_option('active_plugins'), true));
$check('test filter (mu-plugin) is loaded', has_filter('wp_theme_json_data_theme') !== false);
$exists = function_exists(T0203_FN);
$check('production generator exists: ' . T0203_FN, $exists, 'not defined by the plugin bootstrap');
if (!$exists) {
    echo 'DONE-CHECK ' . $fails . "\n";
    exit(1);
}

// ------------------------------------------------------------------ Pure output vs golden.
foreach ([['default', $default, $golden_default], ['generic-fonts', $generic, $golden_generic]] as [$name, $cfg, $golden]) {
    $before = $cfg;
    $out = $gen($cfg);
    $check("golden theme.json: $name", $same($out, $golden), 'differs from golden/' . $name . '.theme.json');
    $check("deterministic: $name", $same($out, $gen($cfg)));
    $check("input not mutated: $name", $cfg === $before);
    $check("no \$schema key in data merged by filter: $name", !array_key_exists('$schema', $out));
    // WordPress's own schema sanitizer must keep everything we emit (no unknown keys).
    $round = (new WP_Theme_JSON($out, 'theme'))->get_raw_data();
    // get_raw_data() nests preset lists under their origin; compare section/key presence instead.
    $lost = [];
    foreach ($out as $top => $branch) {
        if (!is_array($branch)) {
            continue;
        }
        foreach ($branch as $section => $inner) {
            foreach (is_array($inner) ? array_keys($inner) : [null] as $sub) {
                $has = $sub === null ? isset($round[$top][$section]) : isset($round[$top][$section][$sub]);
                if (!$has) {
                    $lost[] = "$top.$section" . ($sub === null ? '' : ".$sub");
                }
            }
        }
    }
    $check("WP_Theme_JSON keeps every emitted key: $name", $lost === [], json_encode($lost));
}
$strict = true;
foreach ($json('golden/default.theme.json')['settings']['typography']['fontSizes'] as $size) {
    $strict = $strict && ($size['fluid'] ?? null) === false;
}
$check('golden font sizes carry fluid:false (contract)', $strict);
foreach (glob("$contract/valid/*.json") ?: [] as $path) {
    try {
        $cfg = json_decode((string) file_get_contents($path), true);
        // The generator takes normalized configs (validator output): lower-case, expanded hex; integer version.
        $cfg['schemaVersion'] = (int) $cfg['schemaVersion'];
        array_walk_recursive($cfg, static function (&$v, $k): void {
            if (is_string($v) && preg_match('/^#[0-9A-Fa-f]{3}$/', $v)) {
                $v = '#' . $v[1] . $v[1] . $v[2] . $v[2] . $v[3] . $v[3];
            }
            if (is_string($v) && preg_match('/^#[0-9A-Fa-f]+$/', $v)) {
                $v = strtolower($v);
            }
        });
        $out = $gen($cfg);
        $check('accepts valid fixture ' . basename($path), is_array($out) && $out !== []);
    } catch (Throwable $e) {
        $check('accepts valid fixture ' . basename($path), false, get_class($e) . ': ' . $e->getMessage());
    }
}

// ------------------------------------------------------------------ Theme fixtures.
$themes_root = get_theme_root();
$child_dir = "$themes_root/blixis-starter";
wp_mkdir_p($child_dir);
file_put_contents("$child_dir/style.css", "/*\nTheme Name: Blixis Starter Proof\nTemplate: blixis-base\nVersion: 0.0.0\n*/\n");
file_put_contents(
    "$child_dir/theme.json",
    json_encode([
        'version' => 3,
        'settings' => [
            'color' => ['palette' => [
                ['slug' => 'primary', 'name' => 'Primary', 'color' => '#ff0000'],
                ['slug' => 'childonly', 'name' => 'Child only', 'color' => '#00ff00'],
            ]],
            'layout' => ['contentSize' => '30rem'],
            'custom' => ['child' => ['flag' => 'kept']],
        ],
        'styles' => ['typography' => ['lineHeight' => '1.7']],
    ])
);
$parent_hash = $tree_hash("$themes_root/blixis-base");

// ------------------------------------------------------------------ Parent alone (no child).
switch_theme('blixis-base');
$use_config(null);
$base_vars = $css_vars($fresh());
$check('parent theme active', get_stylesheet() === 'blixis-base');
$check('no config: Base presets only', ($base_vars['--wp--preset--color--accent'] ?? null) === '#06b6d4');

$generic_on_base = $generic;
$generic_on_base['theme'] = ['slug' => 'blixis-base', 'parent' => 'blixis-base'];
$use_config($generic_on_base);
$check('generic-fonts on Base is a no-op for presets (Base already equals it)', $css_vars($fresh()) === $base_vars);

$default_on_base = $default;
$default_on_base['theme'] = ['slug' => 'blixis-base', 'parent' => 'blixis-base'];
$use_config($default_on_base);
$vars = $css_vars($fresh());
$check('default config overrides Base font stack', ($vars['--wp--preset--font-family--body'] ?? null) === '"Local Sans", system-ui, sans-serif', (string) ($vars['--wp--preset--font-family--body'] ?? ''));
unset($vars['--wp--preset--font-family--body'], $vars['--wp--preset--font-family--heading'], $vars['--wp--preset--font-family--mono']);
$base_no_font = $base_vars;
unset($base_no_font['--wp--preset--font-family--body'], $base_no_font['--wp--preset--font-family--heading'], $base_no_font['--wp--preset--font-family--mono']);
$check('default config changes only font families relative to Base', $vars === $base_no_font);

$other = $default;
$other['theme'] = ['slug' => 'some-other-theme', 'parent' => 'blixis-base'];
$other['colors']['primary'] = '#123456';
$use_config($other);
$check('config for another theme slug is not applied (test policy)', $css_vars($fresh()) === $base_vars);

// ------------------------------------------------------------------ Child inheritance and precedence.
switch_theme('blixis-starter');
$check('child theme active with Base parent', get_stylesheet() === 'blixis-starter' && get_template() === 'blixis-base');
$use_config(null);
$child_only = $css_vars($fresh());
$check('control: without config the child file wins over parent (primary #ff0000)', ($child_only['--wp--preset--color--primary'] ?? null) === '#ff0000');
$check('control: child-only palette entry exists without config', ($child_only['--wp--preset--color--childonly'] ?? null) === '#00ff00');

$use_config($default);
$vars_default = $css_vars($fresh());
$styles_default = $fresh(['styles']);
$check('token wins over child theme.json: primary', ($vars_default['--wp--preset--color--primary'] ?? null) === '#155dfc', (string) ($vars_default['--wp--preset--color--primary'] ?? ''));
$check('token wins over child theme.json: content size', ($css_vars($styles_default)['--wp--style--global--content-size'] ?? null) === '42rem');
$note('child-only palette slug after token merge', isset($vars_default['--wp--preset--color--childonly']) ? 'kept (palette merged)' : 'dropped (palette replaced wholesale)');
$check('inherited from parent: spacing presets', ($vars_default['--wp--preset--spacing--xl'] ?? null) === '2.5rem');
$check('child non-token style survives token merge: lineHeight', str_contains($styles_default, 'line-height: 1.7') || str_contains($styles_default, 'line-height:1.7'));
$check('child non-token custom value survives token merge', ($vars_default['--wp--custom--child--flag'] ?? null) === 'kept', json_encode(array_filter($vars_default, static fn ($k) => str_contains($k, 'custom--child'), ARRAY_FILTER_USE_KEY)));
$check('child theme file itself is unchanged by the filter', $raw('valid/default.json') !== '' && json_decode((string) file_get_contents("$child_dir/theme.json"), true)['settings']['color']['palette'][0]['color'] === '#ff0000');

// Generic fonts through the same path.
$use_config($generic);
$vars_generic = $css_vars($fresh());
$check('generic-fonts via child: body font is generic', ($vars_generic['--wp--preset--font-family--body'] ?? null) === 'system-ui');

// ------------------------------------------------------------------ Token parity with golden CSS and WordPress output.
$use_config($default);
$golden_css = $css_vars(explode('@media', $raw('golden/default.tokens.css'))[0]); // reduced-motion block excluded
$wp_prefix = [
    'colors' => '--wp--preset--color--', 'fonts' => '--wp--preset--font-family--', 'typeScale' => '--wp--preset--font-size--',
    'spacing' => '--wp--preset--spacing--', 'radius' => '--wp--preset--border-radius--', 'shadows' => '--wp--preset--shadow--',
];
$vars = $css_vars($fresh());
$n = 0;
foreach ($map['sections'] as $section) {
    if (!isset($wp_prefix[$section['section']])) {
        continue;
    }
    foreach ($section['tokens'] as $key => $css_name) {
        $wp_name = $wp_prefix[$section['section']] . _wp_to_kebab_case((string) $key);
        $check("parity $css_name == $wp_name", ($vars[$wp_name] ?? null) === ($golden_css[$css_name] ?? 'missing'), (string) ($vars[$wp_name] ?? 'unset') . ' vs ' . ($golden_css[$css_name] ?? 'missing'));
        ++$n;
    }
}
foreach (['durationFast' => 'duration-fast', 'durationBase' => 'duration-base', 'durationSlow' => 'duration-slow', 'easing' => 'easing'] as $camel => $slug) {
    $check("parity motion $slug", ($vars['--wp--custom--blixis--motion--' . $slug] ?? null) === ($golden_css["--blixis-motion-$slug"] ?? 'missing'), (string) ($vars['--wp--custom--blixis--motion--' . $slug] ?? 'unset'));
}
$check('parity gutter', ($vars['--wp--custom--blixis--layout--gutter'] ?? null) === $golden_css['--blixis-layout-gutter']);
$rules = $css_vars($fresh(['styles']));
$check('parity content width', ($rules['--wp--style--global--content-size'] ?? null) === $golden_css['--blixis-layout-content-width']);
$check('parity wide width', ($rules['--wp--style--global--wide-size'] ?? null) === $golden_css['--blixis-layout-wide-width']);
$check('breakpoints are never emitted to theme.json or WP CSS', !str_contains(json_encode($gen($default)), 'breakpoint') && !str_contains($fresh(['variables', 'styles', 'presets']), 'breakpoint'));
$check('2xl slug becomes 2-xl', _wp_to_kebab_case('2xl') === '2-xl' && isset($vars['--wp--preset--font-size--2-xl']));
$check('font sizes are not fluid-rewritten', ($vars['--wp--preset--font-size--3-xl'] ?? null) === '2rem', (string) ($vars['--wp--preset--font-size--3-xl'] ?? ''));
$check('body uses surface/foreground presets', str_contains($fresh(['styles']), 'background-color: var(--wp--preset--color--surface)'));

// WordPress global settings API.
wp_clean_theme_json_cache();
$palette = wp_get_global_settings(['color', 'palette']);
$flat = [];
foreach ((array) ($palette['theme'] ?? []) as $p) {
    $flat[$p['slug']] = $p['color'];
}
$want = [];
foreach ($golden_default['settings']['color']['palette'] as $p) {
    $want[$p['slug']] = $p['color'];
}
$check('wp_get_global_settings palette == golden', $flat === $want, json_encode($flat));
$check('wp_get_global_settings layout == golden', wp_get_global_settings(['layout', 'contentSize']) === '42rem' && wp_get_global_settings(['layout', 'wideSize']) === '72rem');
$check('wp_get_global_settings custom gutter == golden', wp_get_global_settings(['custom', 'blixis', 'layout', 'gutter']) === '1.5rem');

// ------------------------------------------------------------------ Editor parity.
require_once ABSPATH . 'wp-admin/includes/screen.php';
wp_styles();
wp_scripts(); // get_block_editor_settings() expects both globals outside admin
$editor = get_block_editor_settings([], new WP_Block_Editor_Context(['name' => 'core/edit-post']));
$editor_css = '';
foreach ((array) ($editor['styles'] ?? []) as $style) {
    if (!empty($style['isGlobalStyles']) && isset($style['css'])) {
        $editor_css .= $style['css'] . "\n";
    }
}
$check('editor settings carry global styles', $editor_css !== '');
$editor_vars = $css_vars($editor_css);
$front_vars = $css_vars($fresh(['variables', 'presets']));
$wp_only = static fn (array $v): array => array_filter($v, static fn ($k) => str_starts_with($k, '--wp--preset--') || str_starts_with($k, '--wp--custom--'), ARRAY_FILTER_USE_KEY);
$check('editor global-style variables == frontend variables', $wp_only($editor_vars) === $wp_only($front_vars), 'diff keys: ' . json_encode(array_keys(array_diff_assoc($wp_only($editor_vars), $wp_only($front_vars)))));
$check('editor has token primary', ($editor_vars['--wp--preset--color--primary'] ?? null) === '#155dfc');
$ef = $editor['__experimentalFeatures'] ?? [];
$editor_palette = [];
foreach ((array) ($ef['color']['palette']['theme'] ?? []) as $p) {
    $editor_palette[$p['slug']] = $p['color'];
}
$check('editor __experimentalFeatures palette == golden', $editor_palette === $want, json_encode($editor_palette));
$check('editor __experimentalFeatures sizes == golden', ($ef['layout']['contentSize'] ?? null) === '42rem');
$tailwind_in_editor = false;
foreach ((array) ($editor['styles'] ?? []) as $style) {
    if (isset($style['css']) && str_contains((string) $style['css'], 'bg-surface')) {
        $tailwind_in_editor = true;
    }
}
$note('Tailwind build present in editor styles', $tailwind_in_editor ? 'yes' : 'no');

// Real HTTP frontend vs editor.
[$status, $html] = $get('http://127.0.0.1:8080/');
$check('frontend responds 200', $status === 200, (string) $status);
preg_match('~<style id=[\'"]global-styles-inline-css[\'"][^>]*>(.*?)</style>~s', $html, $mm);
$front_http = $css_vars($mm[1] ?? '');
$check('frontend HTML embeds global styles', $mm !== []);
$check('frontend HTTP variables == editor variables', $wp_only($front_http) === $wp_only($editor_vars), 'diff keys: ' . json_encode(array_keys(array_diff_assoc($wp_only($front_http), $wp_only($editor_vars)))));
$check('frontend HTTP has token primary', ($front_http['--wp--preset--color--primary'] ?? null) === '#155dfc');

// ------------------------------------------------------------------ Site Editor (user origin) finding.
$user_override = static fn ($data) => $data->update_with(['version' => 3, 'settings' => ['color' => ['palette' => [['slug' => 'primary', 'name' => 'Primary', 'color' => '#000000']]]]]);
add_filter('wp_theme_json_data_user', $user_override);
$user_vars = $css_vars($fresh());
remove_filter('wp_theme_json_data_user', $user_override);
$note('user-origin override of primary (known gap for 03-05)', ($user_vars['--wp--preset--color--primary'] ?? 'unset') . ' vs token #155dfc');
wp_clean_theme_json_cache();

// ------------------------------------------------------------------ Malformed input refusal and CSS-injection negatives.
$expected = $json('invalid/expected.json');
$use_config(null);
$nocfg_full = $css_vars($fresh(['variables', 'styles', 'presets']));
$dangerous = ['</style', '<script', '<', '>', 'url(', '@import', 'expression(', 'javascript:', "\n", "\0", '\\', '/*'];
$leaf_strings = static function ($v) use (&$leaf_strings): array {
    $out = [];
    foreach ((array) $v as $k => $item) {
        $out[] = (string) $k;
        if (is_array($item) || is_object($item)) {
            $out = array_merge($out, $leaf_strings($item));
        } elseif (is_string($item)) {
            $out[] = $item;
        }
    }
    return $out;
};
$refusal_exempt = static function (array $errors): bool {
    // Fields the generator never emits: an extra or unknown key, the theme block, breakpoints.
    foreach ($errors as $e) {
        if (!str_starts_with($e['code'], 'token.breakpoint.') && $e['code'] !== 'field.unknown') {
            return false;
        }
    }
    return true;
};
set_error_handler(static function (int $no, string $msg): bool {
    throw new ErrorException($msg, 0, $no);
});
foreach (glob("$contract/invalid/*.json") ?: [] as $path) {
    $name = basename($path);
    if ($name === 'expected.json') {
        continue;
    }
    $input = json_decode((string) file_get_contents($path), true);
    $outcome = 'accepted';
    $out = null;
    try {
        $out = (T0203_FN)($input);
        if ($out === [] || $out === null) {
            $outcome = 'refused';
        }
    } catch (ErrorException $e) {
        $outcome = 'php-diagnostic: ' . $e->getMessage();
    } catch (Throwable $e) {
        $outcome = 'refused';
    }
    $must_refuse = !$refusal_exempt($expected[$name]['errors'] ?? []);
    $check("refuses invalid $name", $outcome === 'refused' || !$must_refuse && !str_starts_with($outcome, 'php-diagnostic'), $outcome);
    if (is_array($out)) {
        $leak = [];
        foreach ($leaf_strings($out) as $s) {
            foreach ($dangerous as $bad) {
                if (str_contains($s, $bad)) {
                    $leak[] = $bad;
                }
            }
        }
        $check("no dangerous bytes from invalid $name in output", $leak === [], json_encode(array_unique($leak)));
    }
}
restore_error_handler();

// Hostile values pushed through the full WordPress pipeline never reach CSS.
$hostile = [
    ['colors', 'primary', '#fff;}body{display:none}/*'],
    ['colors', 'accent', 'red</style><script>alert(1)</script>'],
    ['fonts', 'body', 'x";}body{background:url(//evil.test/a)}'],
    ['typeScale', 'base', '1rem;}@import url(//evil.test/x.css);a{'],
    ['spacing', 'md', 'calc(var(--x))'],
    ['shadows', 'sm', '0 0 0 0 red;} * {display:none'],
    ['motion', 'easing', 'steps(4);}'],
    ['layout', 'contentWidth', 'expression(alert(1))'],
];
foreach ($hostile as [$section, $key, $value]) {
    $bad = $default;
    $bad[$section][$key] = $value;
    $use_config($bad);
    $css = $fresh(['variables', 'styles', 'presets']) . $fresh(['custom-css']);
    $hits = array_values(array_filter(['evil.test', '<script', '</style', 'expression(', 'display:none', 'display: none;}', '@import', 'alert(1)'], static fn ($s) => str_contains($css, $s)));
    $check("hostile $section.$key never reaches WordPress CSS", $hits === [], json_encode($hits));
    $check("hostile $section.$key fails closed (output equals no-config state)", $css_vars($fresh(['variables', 'styles', 'presets'])) === $nocfg_full);
}
$use_config($default);

// Control: WordPress itself does not neutralize theme-origin filter data, so the generator must.
$control = static fn ($data) => $data->update_with(['version' => 3, 'settings' => ['color' => ['palette' => [['slug' => 'primary', 'name' => 'P', 'color' => 'red;}body{display:none}/*']]]]]);
add_filter('wp_theme_json_data_theme', $control, 99);
$control_css = $fresh(['variables']);
remove_filter('wp_theme_json_data_theme', $control, 99);
$note('control: raw hostile color through theme origin reaches CSS', str_contains($control_css, 'display:none') ? 'YES (WordPress does not sanitize; generator must)' : 'no (WordPress sanitized it)');
wp_clean_theme_json_cache();

// ------------------------------------------------------------------ Parent untouched, switch back.
$check('parent theme files unchanged', $tree_hash("$themes_root/blixis-base") === $parent_hash);
switch_theme('blixis-base');
$use_config(null);
$check('switching back removes token effect', $css_vars($fresh()) === $base_vars);
$use_config($default);
switch_theme('blixis-starter');

echo 'DONE-CHECK ' . $fails . "\n";
exit($fails === 0 ? 0 : 1);
