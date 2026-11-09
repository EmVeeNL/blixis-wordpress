<?php
/**
 * Plugin Name: Blixis Blocks
 * Description: Foundation for the Blixis visual content editor.
 * Version: 0.1.0
 * Requires at least: 7.0
 * Requires PHP: 8.3
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: blixis-blocks
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

require_once __DIR__ . '/inc/tokens/validate.php';
require_once __DIR__ . '/inc/tokens/css.php';
require_once __DIR__ . '/inc/tokens/theme-json.php';
require_once __DIR__ . '/inc/tokens/store.php';
require_once __DIR__ . '/inc/child-theme/generator.php';
require_once __DIR__ . '/inc/child-theme/rest.php';
require_once __DIR__ . '/inc/fonts/library.php';
require_once __DIR__ . '/inc/tokens/apply.php';
require_once __DIR__ . '/inc/tokens/scheme.php';
require_once __DIR__ . '/inc/setup/wizard.php';

// Editor features are introduced with their implementation; see docs/architecture/EDITOR.md.
