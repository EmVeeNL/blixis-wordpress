<?php
// Runs in the disposable fixture after check.php: creates the page the browser stage
// compares between the frontend and the block editor, using only token-backed presets.
$swatch = static function (string $slug): string {
    return '<!-- wp:group {"className":"t0203-swatch t0203-' . $slug . '","backgroundColor":"' . $slug . '","style":{"dimensions":{"minHeight":"80px"}},"layout":{"type":"constrained"}} -->'
        . '<div class="wp-block-group t0203-swatch t0203-' . $slug . ' has-' . $slug . '-background-color has-background" style="min-height:80px"></div>'
        . '<!-- /wp:group -->';
};
$content = '<!-- wp:heading {"level":1,"fontSize":"3xl"} --><h1 class="wp-block-heading has-3-xl-font-size">Token proof</h1><!-- /wp:heading -->'
    . '<!-- wp:paragraph {"textColor":"muted","fontSize":"lg"} --><p class="has-muted-color has-text-color has-lg-font-size">Body copy in the body font.</p><!-- /wp:paragraph -->'
    . implode('', array_map($swatch, ['primary', 'surface', 'foreground', 'muted', 'accent']))
    . '<!-- wp:buttons --><div class="wp-block-buttons"><!-- wp:button {"backgroundColor":"accent","textColor":"surface"} -->'
    . '<div class="wp-block-button"><a class="wp-block-button__link has-surface-color has-accent-background-color has-text-color has-background wp-element-button">Action</a></div>'
    . '<!-- /wp:button --></div><!-- /wp:buttons -->';
$id = wp_insert_post(['import_id' => 4242, 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Token proof', 'post_name' => 'token-proof', 'post_content' => $content], true);
$admin = get_user_by('login', 'fixture_admin');
update_user_meta($admin->ID, 'wp_persisted_preferences', ['core/edit-post' => ['welcomeGuide' => false, 'fullscreenMode' => false], 'core' => ['enableChoosePatternModal' => false], '_modified' => gmdate('c')]);
echo 'NOTE seeded page ' . (is_wp_error($id) ? $id->get_error_message() : $id) . ', theme ' . get_stylesheet() . ', config ' . (get_option('t0203_config') ? 'set' : 'MISSING') . "\n";
