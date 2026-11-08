<?php
// Runs in the disposable fixture after the child theme is active. Creates neutral inner pages and
// a static front page. If the child registers a front-page pattern (<slug>/front-page, /home or
// /showcase) its markup becomes the front page body; otherwise the child's own front-page
// template (or Base's) renders and the front page keeps a plain intro. No secrets here.
wp_delete_post( 1, true );
wp_delete_post( 2, true );
$slug = get_stylesheet();
$mk = static function ( array $a ): int {
	$id = wp_insert_post( array_merge( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_author' => 1 ), $a ), true );
	if ( is_wp_error( $id ) ) {
		echo 'HARNESS seed failed: ' . $id->get_error_message() . "\n";
		exit( 1 );
	}
	return $id;
};
$p = static fn( string $t ): string => '<!-- wp:paragraph --><p>' . $t . '</p><!-- /wp:paragraph -->';

$front_markup = '';
$used         = '';
foreach ( array( 'front-page', 'home', 'showcase' ) as $name ) {
	$pattern = WP_Block_Patterns_Registry::get_instance()->get_registered( $slug . '/' . $name );
	if ( $pattern ) {
		$front_markup = $pattern['content'];
		$used         = $slug . '/' . $name;
		break;
	}
}
$home  = $mk( array( 'import_id' => 6001, 'post_title' => 'Home', 'post_name' => 'home', 'post_content' => $front_markup ? $front_markup : $p( 'T0205-HOME-FALLBACK plain intro.' ) ) );
$about = $mk( array( 'import_id' => 6002, 'post_title' => 'About', 'post_name' => 'about', 'post_content' => $p( 'T0205-ABOUT-BODY' ) . '<!-- wp:heading {"level":2} --><h2 class="wp-block-heading">Section</h2><!-- /wp:heading -->' . $p( 'More text with a <a href="https://example.test/">link</a>.' ) ) );
$mk( array( 'import_id' => 6003, 'post_title' => 'Contact', 'post_name' => 'contact', 'post_content' => $p( 'T0205-CONTACT-BODY' ) ) );
$mk( array( 'import_id' => 6004, 'post_title' => 'T0205 Draft Secret', 'post_status' => 'draft', 'post_content' => $p( 'T0205-DRAFT-BODY' ) ) );
$mk( array( 'import_id' => 6005, 'post_title' => 'Neutral Base theme', 'post_name' => 'base-preview', 'post_content' =>
	'<!-- wp:heading {"level":2} --><h2 class="wp-block-heading">Semantic templates, neutral defaults</h2><!-- /wp:heading -->'
	. $p( 'Blixis Base is the neutral parent theme. It supplies semantic block templates, accessible navigation and token-ready defaults without site branding.' )
	. '<!-- wp:list --><ul class="wp-block-list"><!-- wp:list-item --><li>System fonts and no external requests</li><!-- /wp:list-item --><!-- wp:list-item --><li>Header, content and footer landmarks</li><!-- /wp:list-item --><!-- wp:list-item --><li>Branding belongs in a child theme</li><!-- /wp:list-item --></ul><!-- /wp:list -->'
	. '<!-- wp:quote --><blockquote class="wp-block-quote"><!-- wp:paragraph --><p>Defaults stay neutral so a child theme can own the brand.</p><!-- /wp:paragraph --></blockquote><!-- /wp:quote -->'
	. '<!-- wp:heading {"level":3} --><h3 class="wp-block-heading">Ready for a child theme</h3><!-- /wp:heading -->'
	. $p( 'Colours, type and spacing come from theme.json presets, so a child theme can restyle every template without editing the parent.' )
	. '<!-- wp:buttons --><div class="wp-block-buttons"><!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="#">Primary action</a></div><!-- /wp:button --></div><!-- /wp:buttons -->' ) );
wp_insert_post( array( 'import_id' => 6101, 'post_title' => 'Hello Showcase', 'post_name' => 'hello-showcase', 'post_status' => 'publish', 'post_content' => $p( 'T0205-POST-BODY' ) ) );

update_option( 'show_on_front', 'page' );
update_option( 'page_on_front', $home );
update_option( 'blogname', 'Example Site' );
update_option( 'blogdescription', 'A disposable test site' );

// A primary menu if the child registers a location, so header navigation has inner-page links.
$locations = get_registered_nav_menus();
if ( $locations ) {
	$menu = wp_create_nav_menu( 'Fixture primary' );
	foreach ( array( $home => 'Home', $about => 'About', 6003 => 'Contact' ) as $id => $title ) {
		wp_update_nav_menu_item( $menu, 0, array( 'menu-item-title' => $title, 'menu-item-object' => 'page', 'menu-item-object-id' => $id, 'menu-item-type' => 'post_type', 'menu-item-status' => 'publish' ) );
	}
	set_theme_mod( 'nav_menu_locations', array_fill_keys( array_keys( $locations ), $menu ) );
}
echo 'NOTE seeded; theme ' . $slug . '; parent ' . get_template() . '; front pattern ' . ( $used ? $used : 'none (child front-page template)' ) . "\n";
