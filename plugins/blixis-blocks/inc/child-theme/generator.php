<?php
/**
 * Child theme generator (task 03-01).
 *
 * Creates a minimal, installable child theme of Blixis Base in the WordPress
 * theme root. It writes only a new directory named after a validated slug,
 * never into Blixis Base, another existing theme, or WordPress Core, and it
 * never activates the result. Branding, tokens, and fonts arrive in later tasks.
 *
 * @package Blixis\Blocks
 */

declare(strict_types=1);

namespace Blixis\Blocks\ChildTheme;

use WP_Error;

if (!defined('ABSPATH')) {
    exit;
}

/** Stylesheet of the only supported parent theme. */
const PARENT_THEME = 'blixis-base';

/** Approved WordPress and PHP floors written into every generated header. */
const REQUIRES_WP  = '7.0';
const REQUIRES_PHP = '8.3';

/**
 * Input field rules. Header values are generated only from validated text fields.
 *
 * @return array<string, array{required: bool, max: int}>
 */
function fields(): array {
    return array(
        'name'        => array(
			'required' => true,
			'max'      => 64,
		),
        'slug'        => array(
			'required' => true,
			'max'      => 48,
		),
        'description' => array(
			'required' => false,
			'max'      => 200,
		),
        'author'      => array(
			'required' => false,
			'max'      => 64,
		),
        'version'     => array(
			'required' => false,
			'max'      => 16,
		),
        'starter'     => array(
			'required' => false,
			'max'      => 16,
		),
        'layout'      => array(
			'required' => false,
			'max'      => 16,
		),
    );
}

/**
 * Validate generator input.
 *
 * Returns normalized values and a list of field errors. Error codes are stable:
 * unknown_field, invalid_type, required, too_long, invalid_characters,
 * invalid_slug, reserved_slug, invalid_version.
 *
 * @param array<mixed> $input Raw input, for example a decoded REST body.
 * @return array{values: array<string, string>, errors: list<array{field: string, code: string}>}
 */
function validate( array $input ): array {
    $errors = array();
    $values = array();
    $rules  = fields();

    foreach (array_keys($input) as $key) {
        if (!is_string($key) || !isset($rules[ $key ])) {
            $errors[] = array(
				'field' => (string) $key,
				'code'  => 'unknown_field',
			);
        }
    }

    foreach ($rules as $field => $rule) {
        if (!array_key_exists($field, $input) || null === $input[ $field ]) {
            if ($rule['required']) {
                $errors[] = array(
					'field' => $field,
					'code'  => 'required',
				);
            }
            continue;
        }
        $value = $input[ $field ];
        if (!is_string($value)) {
            $errors[] = array(
				'field' => $field,
				'code'  => 'invalid_type',
			);
            continue;
        }
        $value = trim($value);
        if ('' === $value) {
            if ($rule['required']) {
                $errors[] = array(
					'field' => $field,
					'code'  => 'required',
				);
            }
            continue;
        }
        if (!preg_match('//u', $value) || mb_strlen($value, 'UTF-8') > $rule['max']) {
            $errors[] = array(
				'field' => $field,
				'code'  => preg_match('//u', $value) ? 'too_long' : 'invalid_characters',
			);
            continue;
        }
        // Header values must stay on one line and must not close the CSS comment.
        if (preg_match('/[\x00-\x1F\x7F]|\*\/|[<>]/u', $value)) {
            $errors[] = array(
				'field' => $field,
				'code'  => 'invalid_characters',
			);
            continue;
        }
        $values[ $field ] = $value;
    }

    if (isset($values['slug'])) {
        $slug = $values['slug'];
        if (!preg_match('/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/D', $slug) || strlen($slug) < 3) {
            $errors[] = array(
				'field' => 'slug',
				'code'  => 'invalid_slug',
			);
            unset($values['slug']);
        } elseif (in_array($slug, reserved_slugs(), true)) {
            $errors[] = array(
				'field' => 'slug',
				'code'  => 'reserved_slug',
			);
            unset($values['slug']);
        }
    }

    if (isset($values['version']) && !preg_match('/^(?:0|[1-9][0-9]{0,3})\.(?:0|[1-9][0-9]{0,3})\.(?:0|[1-9][0-9]{0,3})$/D', $values['version'])) {
        $errors[] = array(
			'field' => 'version',
			'code'  => 'invalid_version',
		);
        unset($values['version']);
    }
    $values['version'] ??= '0.1.0';
    $legacy              = $values['starter'] ?? null;
    $legacy_map          = array(
		'none'    => 'blank',
		'neutral' => 'business',
	);
    if (null !== $legacy && !isset($legacy_map[ $legacy ])) {
        $errors[] = array(
			'field' => 'starter',
			'code'  => 'invalid_starter',
		);
    }
    $layout = $values['layout'] ?? ( null !== $legacy ? ( $legacy_map[ $legacy ] ?? null ) : 'blank' );
    if (null !== $layout && !in_array($layout, array( 'blank', 'business', 'portfolio', 'blog', 'landing' ), true)) {
        $errors[] = array(
			'field' => 'layout',
			'code'  => 'invalid_layout',
		);
    }
    if (null !== $legacy && isset($legacy_map[ $legacy ]) && array_key_exists('layout', $input) && $layout !== $legacy_map[ $legacy ]) {
        $errors[] = array(
			'field' => 'layout',
			'code'  => 'conflicts_with_starter',
		);
    }
    if (null !== $legacy) {
		$values['starter'] = $legacy; }
    $values['layout'] = $layout ?? 'blank';

    return array(
		'values' => $values,
		'errors' => $errors,
	);
}

/**
 * Slugs a child theme may never take, even when no such directory exists yet.
 *
 * @return list<string>
 */
function reserved_slugs(): array {
    return array( PARENT_THEME, 'blixis-blocks', 'blixis-showcase', 'themes', 'plugins', 'wp-admin', 'wp-content', 'wp-includes' );
}

/**
 * The files of a new child theme, keyed by relative path.
 *
 * Values must already have passed validate().
 *
 * @param array<string, string> $values Normalized values.
 * @return array<string, string>
 */
function build_files( array $values ): array {
    $header = array(
        'Theme Name'        => $values['name'],
        'Description'       => $values['description'] ?? '',
        'Author'            => $values['author'] ?? '',
        'Version'           => $values['version'],
        'Requires at least' => REQUIRES_WP,
        'Requires PHP'      => REQUIRES_PHP,
        'License'           => 'GPLv2 or later',
        'License URI'       => 'https://www.gnu.org/licenses/gpl-2.0.html',
        'Text Domain'       => $values['slug'],
        'Template'          => PARENT_THEME,
    );
    $lines  = array();
    foreach ($header as $key => $value) {
        if ('' !== $value) {
            $lines[] = $key . ': ' . $value;
        }
    }
    $style = "/*\n" . implode("\n", $lines) . "\n*/\n\n/* Site branding and approved overrides belong here, never in Blixis Base. */\n";

    $theme_json = "{\n  \"\$schema\": \"https://schemas.wp.org/trunk/theme.json\",\n  \"version\": 3\n}\n";

    $function  = str_replace('-', '_', $values['slug']) . '_enqueue_styles';
    $handle    = $values['slug'];
    $functions = <<<PHP
<?php
/**
 * Child theme of Blixis Base. Generated by Blixis Blocks.
 *
 * @package {$values['slug']}
 */

declare(strict_types=1);

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Load this child stylesheet after Blixis Base.
 */
function {$function}(): void {
	\$path    = get_stylesheet_directory() . '/style.css';
	\$version = is_readable( \$path ) ? (string) filemtime( \$path ) : null;

	wp_enqueue_style( '{$handle}', get_stylesheet_uri(), array( 'blixis-base' ), \$version );
}
add_action( 'wp_enqueue_scripts', '{$function}', 30 );

PHP;

    $files = array(
        'style.css'     => $style,
        'theme.json'    => $theme_json,
        'functions.php' => $functions,
    );

    $layout = $values['layout'] ?? 'blank';
    if ('neutral' === ( $values['starter'] ?? null )) {
		$text_domain                        = $values['slug'];
        $files['templates/front-page.html'] = <<<HTML
<!-- wp:template-part {"slug":"header","tagName":"header"} /-->
<!-- wp:group {"tagName":"main","layout":{"type":"default"}} -->
<main class="wp-block-group">
<!-- wp:pattern {"slug":"{$values['slug']}/intro"} /-->
<!-- wp:pattern {"slug":"{$values['slug']}/features"} /-->
</main>
<!-- /wp:group -->
<!-- wp:template-part {"slug":"footer","tagName":"footer"} /-->
HTML;
        $files['patterns/intro.php']        = <<<PHP
<?php
/**
 * Title: Introduction
 * Slug: {$values['slug']}/intro
 * Categories: featured
 * Description: A neutral introduction section.
 */
?>
<!-- wp:group {"tagName":"section","layout":{"type":"constrained"}} -->
<section class="wp-block-group">
<!-- wp:heading {"level":1,"style":{"color":{"text":"var:preset|color|primary"}}} -->
<h1 class="wp-block-heading"><?php esc_html_e( 'Welcome', '{$text_domain}' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p><?php esc_html_e( 'Introduce your site and what visitors can find here.', '{$text_domain}' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons -->
<div class="wp-block-buttons"><!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="#features" title="<?php esc_attr_e( 'Explore the feature highlights', '{$text_domain}' ); ?>"><?php esc_html_e( 'Explore', '{$text_domain}' ); ?></a></div><!-- /wp:button --></div>
<!-- /wp:buttons -->
</section>
<!-- /wp:group -->
PHP;
        $files['patterns/features.php']     = <<<PHP
<?php
/**
 * Title: Features
 * Slug: {$values['slug']}/features
 * Categories: featured
 * Description: Three editable highlights for a site.
 */
?>
<!-- wp:group {"tagName":"section","anchor":"features","layout":{"type":"constrained"}} -->
<section id="features" class="wp-block-group">
<!-- wp:heading {"level":2} --><h2 class="wp-block-heading"><?php esc_html_e( 'What we offer', '{$text_domain}' ); ?></h2><!-- /wp:heading -->
<!-- wp:columns -->
<div class="wp-block-columns"><!-- wp:column --><div class="wp-block-column"><!-- wp:heading {"level":3} --><h3 class="wp-block-heading"><?php esc_html_e( 'First highlight', '{$text_domain}' ); ?></h3><!-- /wp:heading --><!-- wp:paragraph --><p><?php esc_html_e( 'Describe a useful part of your work.', '{$text_domain}' ); ?></p><!-- /wp:paragraph --></div><!-- /wp:column -->
<!-- wp:column --><div class="wp-block-column"><!-- wp:heading {"level":3} --><h3 class="wp-block-heading"><?php esc_html_e( 'Second highlight', '{$text_domain}' ); ?></h3><!-- /wp:heading --><!-- wp:paragraph --><p><?php esc_html_e( 'Share another detail visitors should know.', '{$text_domain}' ); ?></p><!-- /wp:paragraph --></div><!-- /wp:column -->
<!-- wp:column --><div class="wp-block-column"><!-- wp:heading {"level":3} --><h3 class="wp-block-heading"><?php esc_html_e( 'Third highlight', '{$text_domain}' ); ?></h3><!-- /wp:heading --><!-- wp:paragraph --><p><?php esc_html_e( 'Help visitors understand how to get started.', '{$text_domain}' ); ?></p><!-- /wp:paragraph --></div><!-- /wp:column --></div>
<!-- /wp:columns -->
</section>
<!-- /wp:group -->
PHP;
    }

    if ('neutral' !== ( $values['starter'] ?? null ) && 'blank' !== $layout) {
        $files['templates/front-page.html']              = <<<HTML
<!-- wp:template-part {"slug":"header","tagName":"header"} /-->
<!-- wp:group {"tagName":"main","layout":{"type":"default"}} -->
<main class="wp-block-group">
<!-- wp:pattern {"slug":"{$values['slug']}/{$layout}-content"} /-->
</main>
<!-- /wp:group -->
<!-- wp:template-part {"slug":"footer","tagName":"footer"} /-->
HTML;
        $files[ 'patterns/' . $layout . '-content.php' ] = layout_pattern($layout, $values['slug']);
    }

    return $files;
}

/** Generate an editable, unbranded core-block pattern for a layout. */
function layout_pattern( string $layout, string $domain ): string {
    $header    = "<?php\n/**\n * Title: " . ucfirst($layout) . " page\n * Slug: {$domain}/{$layout}-content\n * Categories: featured\n * Description: Editable {$layout} page sections.\n */\n?>\n";
    $heading   = "<!-- wp:heading {\"level\":1,\"style\":{\"color\":{\"text\":\"var:preset|color|primary\"}}} --><h1 class=\"wp-block-heading\"><?php esc_html_e( 'Welcome', '{$domain}' ); ?></h1><!-- /wp:heading -->\n";
    $paragraph = "<!-- wp:paragraph {\"style\":{\"color\":{\"text\":\"var:preset|color|foreground\"}}} --><p><?php esc_html_e( 'A clear introduction to this site and its work.', '{$domain}' ); ?></p><!-- /wp:paragraph -->\n";
    $feature   = "<!-- wp:columns --><div class=\"wp-block-columns\"><!-- wp:column --><div class=\"wp-block-column\"><!-- wp:heading {\"level\":2} --><h2 class=\"wp-block-heading\"><?php esc_html_e( 'First highlight', '{$domain}' ); ?></h2><!-- /wp:heading -->{$paragraph}</div><!-- /wp:column --><!-- wp:column --><div class=\"wp-block-column\"><!-- wp:heading {\"level\":2} --><h2 class=\"wp-block-heading\"><?php esc_html_e( 'Second highlight', '{$domain}' ); ?></h2><!-- /wp:heading -->{$paragraph}</div><!-- /wp:column --><!-- wp:column --><div class=\"wp-block-column\"><!-- wp:heading {\"level\":2} --><h2 class=\"wp-block-heading\"><?php esc_html_e( 'Third highlight', '{$domain}' ); ?></h2><!-- /wp:heading -->{$paragraph}</div><!-- /wp:column --></div><!-- /wp:columns -->\n";
    if ('blog' === $layout) {
        return $header . $heading . $paragraph . "<!-- wp:heading {\"level\":2} --><h2><?php esc_html_e( 'Featured post', '{$domain}' ); ?></h2><!-- /wp:heading --><!-- wp:query {\"queryId\":1,\"query\":{\"perPage\":1,\"pages\":0,\"offset\":0,\"postType\":\"post\",\"order\":\"desc\",\"orderBy\":\"date\",\"inherit\":false}} --><div class=\"wp-block-query\"><!-- wp:post-template --><!-- wp:post-title {\"isLink\":true} /--><!-- wp:post-excerpt /--><!-- /wp:post-template --></div><!-- /wp:query --><!-- wp:heading {\"level\":2} --><h2><?php esc_html_e( 'Latest posts', '{$domain}' ); ?></h2><!-- /wp:heading --><!-- wp:query {\"queryId\":2,\"query\":{\"perPage\":5,\"pages\":0,\"offset\":1,\"postType\":\"post\",\"order\":\"desc\",\"orderBy\":\"date\",\"inherit\":false}} --><div class=\"wp-block-query\"><!-- wp:post-template --><!-- wp:post-title {\"isLink\":true} /--><!-- wp:post-excerpt /--><!-- /wp:post-template --></div><!-- /wp:query -->";
    }
    if ('landing' === $layout) {
        $navigation = "<!-- wp:navigation {\"overlayMenu\":\"never\",\"ariaLabel\":\"<?php esc_attr_e( 'On this page', '{$domain}' ); ?>\"} --><!-- wp:navigation-link {\"label\":\"<?php esc_attr_e( 'Introduction', '{$domain}' ); ?>\",\"url\":\"#introduction\"} /--><!-- wp:navigation-link {\"label\":\"<?php esc_attr_e( 'Details', '{$domain}' ); ?>\",\"url\":\"#details\"} /--><!-- /wp:navigation -->";
        return $header . $navigation . "<!-- wp:group {\"tagName\":\"section\",\"anchor\":\"introduction\"} --><section id=\"introduction\">{$heading}{$paragraph}</section><!-- /wp:group --><!-- wp:group {\"tagName\":\"section\",\"anchor\":\"details\"} --><section id=\"details\"><!-- wp:heading {\"level\":2} --><h2 class=\"wp-block-heading\"><?php esc_html_e( 'Details', '{$domain}' ); ?></h2><!-- /wp:heading -->{$feature}</section><!-- /wp:group -->";
    }
    if ('portfolio' === $layout) {
        return $header . $heading . $paragraph . "<!-- wp:group {\"tagName\":\"section\",\"anchor\":\"projects\"} --><section id=\"projects\"><!-- wp:heading {\"level\":2} --><h2 class=\"wp-block-heading\"><?php esc_html_e( 'Selected projects', '{$domain}' ); ?></h2><!-- /wp:heading -->{$feature}</section><!-- /wp:group -->";
    }
    $contact = "<!-- wp:group {\"tagName\":\"section\",\"anchor\":\"contact\"} --><section id=\"contact\"><!-- wp:heading {\"level\":2} --><h2 class=\"wp-block-heading\"><?php esc_html_e( 'Contact', '{$domain}' ); ?></h2><!-- /wp:heading -->{$paragraph}</section><!-- /wp:group -->";
    return $header . $heading . $paragraph . $feature . "<!-- wp:buttons --><div class=\"wp-block-buttons\"><!-- wp:button --><div class=\"wp-block-button\"><a class=\"wp-block-button__link wp-element-button\" href=\"#contact\"><?php esc_html_e( 'Get in touch', '{$domain}' ); ?></a></div><!-- /wp:button --></div><!-- /wp:buttons -->" . $contact;
}

/**
 * Create a child theme directory from raw input.
 *
 * Does not check user capabilities; callers must. Never activates the theme.
 *
 * @param array<mixed> $input Raw input.
 * @return array{slug: string, name: string, version: string}|WP_Error
 */
function create( array $input ): array|WP_Error {
    if (( defined('DISALLOW_FILE_MODS') && DISALLOW_FILE_MODS ) || is_multisite()) {
        return new WP_Error('blixis_child_unavailable', __('Child themes cannot be created on this site.', 'blixis-blocks'), array( 'status' => 503 ));
    }

    $checked = validate($input);
    if ($checked['errors']) {
        return new WP_Error('blixis_child_invalid', __('The child theme details are invalid.', 'blixis-blocks'), array(
			'status' => 400,
			'errors' => $checked['errors'],
		));
    }
    $values = $checked['values'];

    if (!wp_get_theme(PARENT_THEME)->exists()) {
        return new WP_Error('blixis_child_parent_missing', __('Blixis Base is not installed.', 'blixis-blocks'), array( 'status' => 409 ));
    }

    $root = realpath(get_theme_root());
    if (false === $root || !is_dir($root)) {
        return new WP_Error('blixis_child_unavailable', __('Child themes cannot be created on this site.', 'blixis-blocks'), array( 'status' => 503 ));
    }
    $target = $root . DIRECTORY_SEPARATOR . $values['slug'];
    $parent = realpath(get_theme_root(PARENT_THEME) . DIRECTORY_SEPARATOR . PARENT_THEME);

    // The slug grammar already excludes separators and dots; this guards the result too.
    if (dirname($target) !== $root || $target === $parent || file_exists($target) || is_link($target) || wp_get_theme($values['slug'])->exists()) {
        return new WP_Error('blixis_child_exists', __('A theme with this slug already exists.', 'blixis-blocks'), array( 'status' => 409 ));
    }

    require_once ABSPATH . 'wp-admin/includes/file.php';
    if ('direct' !== get_filesystem_method(array(), $root) || !WP_Filesystem(false, $root)) {
        return new WP_Error('blixis_child_unavailable', __('The theme directory is not writable.', 'blixis-blocks'), array( 'status' => 503 ));
    }
    global $wp_filesystem;

    // Write into a hidden staging directory, then move it into place in one step.
    // WordPress skips directories whose names start with a dot when it lists themes.
    $staging = $root . DIRECTORY_SEPARATOR . '.blixis-child-' . strtolower(wp_generate_password(12, false));
    if (!$wp_filesystem->mkdir($staging, FS_CHMOD_DIR)) {
        return new WP_Error('blixis_child_write_failed', __('The child theme could not be written.', 'blixis-blocks'), array( 'status' => 500 ));
    }
    foreach (build_files($values) as $file => $contents) {
		$directory = dirname($file);
		if ('.' !== $directory) {
			$directory_path = $staging . DIRECTORY_SEPARATOR . $directory;
			if (!$wp_filesystem->is_dir($directory_path) && !$wp_filesystem->mkdir($directory_path, FS_CHMOD_DIR)) {
				$wp_filesystem->delete($staging, true);
				return new WP_Error('blixis_child_write_failed', __('The child theme could not be written.', 'blixis-blocks'), array( 'status' => 500 ));
			}
		}
		if (!$wp_filesystem->put_contents($staging . DIRECTORY_SEPARATOR . $file, $contents, FS_CHMOD_FILE)) {
            $wp_filesystem->delete($staging, true);
            return new WP_Error('blixis_child_write_failed', __('The child theme could not be written.', 'blixis-blocks'), array( 'status' => 500 ));
        }
    }
    if (file_exists($target) || !$wp_filesystem->move($staging, $target, false)) {
        $wp_filesystem->delete($staging, true);
        return new WP_Error('blixis_child_exists', __('A theme with this slug already exists.', 'blixis-blocks'), array( 'status' => 409 ));
    }

    wp_clean_themes_cache();

    return array(
        'slug'    => $values['slug'],
        'name'    => $values['name'],
        'version' => $values['version'],
    );
}
