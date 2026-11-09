<?php
/**
 * Plugin Name: Blixis 03-04 test proof
 * Description: Test-only. On ?t0304_fonts=1, prints @font-face rules for a config that uses
 * Liberation Sans as the body font and styles a paragraph with it, so the browser stage can
 * measure font loading. Task 03-05 will apply stored configs for real.
 */

add_action('wp_head', static function (): void {
    // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Test fixture.
    if (!isset($_GET['t0304_fonts'])) {
        return;
    }
    $config = ['fonts' => ['body' => 'Liberation Sans', 'heading' => 'system-ui', 'mono' => 'ui-monospace']];
    \Blixis\Blocks\Fonts\print_font_faces_for($config);
    echo '<style>.t0304-sample{font-family:"Liberation Sans",system-ui,sans-serif}</style>';
});
add_action('wp_footer', static function (): void {
    if (isset($_GET['t0304_fonts'])) {
        echo '<p class="t0304-sample">Font loading sample: The quick brown fox jumps over the lazy dog.</p>';
    }
});
