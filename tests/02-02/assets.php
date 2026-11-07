<?php
// Executed by WP-CLI in the disposable 02-01 fixture, never the shared site.
$mode = getenv('T0202_MODE');
$check = static function (string $name, bool $ok): void {
    echo ($ok ? 'PASS ' : 'FAIL ') . '[02-02 ' . getenv('T0202_MODE') . '] ' . $name . "\n";
};
$asset = Blixis\Base\get_tailwind_asset();
if ($mode === 'missing') {
    $check('missing asset returns null', $asset === null);
    Blixis\Base\enqueue_assets();
    $check('production continues without broken CSS URL', !wp_style_is('blixis-base-tailwind', 'enqueued'));
    return;
}
if ($mode === 'local') {
    Blixis\Base\enqueue_assets();
    echo "FAIL [02-02 local] missing asset did not stop request\n";
    return;
}
$parent = get_template_directory_uri() . '/assets/build/tailwind.css';
$check('parent build URL and content version', $asset['url'] === $parent && $asset['version'] === substr(md5_file($asset['path']), 0, 12));
$check('editor uses only parent build URL', in_array($parent, $GLOBALS['editor_styles'], true) && !in_array('assets/build/tailwind.css', $GLOBALS['editor_styles'], true));
$editor_css = implode('\n', array_column(get_block_editor_theme_styles(), 'css'));
$check('editor resolves compiled parent CSS bytes', str_contains($editor_css, '--blixis-color-primary') && !str_contains($editor_css, '.child-shadow'));
do_action('wp_enqueue_scripts');
$registered = wp_styles()->registered['blixis-base-tailwind'];
$check('registered global styles dependency', in_array('global-styles', $registered->deps, true));
ob_start();
wp_print_styles();
$html = ob_get_clean();
$global = strpos($html, 'global-styles-inline-css');
$base = strpos($html, 'blixis-base-css');
$tailwind = strpos($html, 'blixis-base-tailwind-css');
$check('printed global/base/build ordering', $global !== false && $base !== false && $tailwind !== false && $global < $tailwind && $base < $tailwind);
wp_dequeue_style('blixis-base-tailwind');
wp_deregister_style('blixis-base-tailwind');
wp_deregister_style('global-styles');
Blixis\Base\enqueue_assets();
$check('absent global handle does not suppress CSS', wp_styles()->registered['blixis-base-tailwind']->deps === ['blixis-base']);
if ($mode === 'child') {
    $check('child theme active', get_stylesheet() === 'blixis-test-child');
    $check('child cannot shadow parent build', !str_contains($asset['path'], 'blixis-test-child'));
}
