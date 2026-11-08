<?php
// Runs in the disposable fixture: creates deterministic content and the unauthorised states
// (draft, private, pending, scheduled, password protected) that must never leak.
// Secrets come from the environment; nothing here is a real credential.
$post = static function ( array $args ): int {
	$defaults = array(
		'post_type'    => 'post',
		'post_status'  => 'publish',
		'post_author'  => 1,
		// Unique fixture timestamps avoid undefined SQL ordering for equal dates.
		'post_date'    => gmdate( 'Y-m-d H:i:s', strtotime( '2026-01-15 10:00:00 UTC' ) + (int) ( $args['import_id'] ?? 0 ) ),
		'post_content' => '',
	);
	$id = wp_insert_post( array_merge( $defaults, $args ), true );
	if ( is_wp_error( $id ) ) {
		echo 'HARNESS seed failed: ' . $id->get_error_message() . "\n";
		exit( 1 );
	}
	return $id;
};
$p = static fn( string $text ): string => '<!-- wp:paragraph --><p>' . $text . '</p><!-- /wp:paragraph -->';
$h = static fn( int $level, string $text ): string => '<!-- wp:heading {"level":' . $level . '} --><h' . $level . ' class="wp-block-heading">' . $text . '</h' . $level . '><!-- /wp:heading -->';

$cat = wp_insert_term( 'Fixtures', 'category', array( 'slug' => 'fixtures' ) );
$cat_id = is_wp_error( $cat ) ? 0 : (int) $cat['term_id'];
update_option( 'blogname', 'Fixture Site' );
update_option( 'blogdescription', 'A disposable test site' );
update_option( 'posts_per_page', 10 );
update_option( 'comment_registration', 1 );

// Published pages.
$post( array( 'import_id' => 5001, 'post_type' => 'page', 'post_title' => 'Sample Page', 'post_name' => 'sample-page',
	'post_content' => $h( 2, 'Section heading' ) . $p( 'T0204-PAGE-BODY first paragraph with a <a href="https://example.test/">link</a>.' )
		. '<!-- wp:list --><ul class="wp-block-list"><!-- wp:list-item --><li>One</li><!-- /wp:list-item --><!-- wp:list-item --><li>Two</li><!-- /wp:list-item --></ul><!-- /wp:list -->'
		. $h( 3, 'Sub heading' ) . $p( 'More text.' ) ) );
$post( array( 'import_id' => 5003, 'post_type' => 'page', 'post_title' => 'Static Front', 'post_name' => 'static-front',
	'post_content' => $p( 'T0204-FRONT-BODY welcome copy.' ) ) );

// Published posts.
$post( array( 'import_id' => 5101, 'post_title' => 'First Post', 'post_name' => 'first-post', 'post_category' => array( $cat_id ), 'tags_input' => array( 'edge' ),
	'post_excerpt' => 'Excerpt of the first post.',
	'post_content' => $h( 2, 'Inside the post' ) . $p( 'T0204-POST-BODY text of the first post.' ) ) );
for ( $i = 1; $i <= 12; $i++ ) {
	$post( array( 'import_id' => 5110 + $i, 'post_title' => sprintf( 'Filler Post %02d', $i ), 'post_name' => sprintf( 'filler-%02d', $i ),
		'post_category' => array( $cat_id ), 'post_date' => sprintf( '2026-01-%02d 09:00:00', $i ), 'post_content' => $p( 'Filler body ' . $i ) ) );
}

// Edge content.
$long = str_repeat( 'Unbreakable', 18 );
$post( array( 'import_id' => 5301, 'post_title' => $long, 'post_name' => 'long-title', 'post_category' => array( $cat_id ),
	'post_content' => $p( 'https://example.test/' . str_repeat( 'a-very-long-path-segment/', 12 ) )
		. '<!-- wp:preformatted --><pre class="wp-block-preformatted">' . str_repeat( 'x', 240 ) . '</pre><!-- /wp:preformatted -->'
		. '<!-- wp:table --><figure class="wp-block-table"><table><tbody><tr>' . '<td>cell</td><td>cell</td>' . '</tr></tbody></table></figure><!-- /wp:table -->'
		. $p( 'T0204-LONG-BODY' ) ) );
$post( array( 'import_id' => 5302, 'post_title' => 'Tom & Jerry\'s "Quotes" 日本語 😀', 'post_name' => 'special-chars', 'post_category' => array( $cat_id ),
	'post_content' => $p( 'T0204-SPECIAL-BODY' ) ) );
$post( array( 'import_id' => 5303, 'post_title' => '', 'post_name' => 'no-title', 'post_content' => $p( 'T0204-NOTITLE-BODY' ) ) );

// Must never be visible to anonymous visitors (title or body), in any template.
$post( array( 'import_id' => 5201, 'post_status' => 'draft', 'post_title' => 'T0204 Draft Secret', 'post_category' => array( $cat_id ), 'post_content' => $p( 'T0204-DRAFT-BODY' ) ) );
$post( array( 'import_id' => 5202, 'post_status' => 'private', 'post_title' => 'T0204 Private Secret', 'post_category' => array( $cat_id ), 'post_content' => $p( 'T0204-PRIVATE-BODY' ) ) );
$post( array( 'import_id' => 5204, 'post_status' => 'pending', 'post_title' => 'T0204 Pending Secret', 'post_category' => array( $cat_id ), 'post_content' => $p( 'T0204-PENDING-BODY' ) ) );
$post( array( 'import_id' => 5205, 'post_status' => 'future', 'post_date' => '2099-01-01 10:00:00', 'post_title' => 'T0204 Future Secret', 'post_category' => array( $cat_id ), 'post_content' => $p( 'T0204-FUTURE-BODY' ) ) );
$post( array( 'import_id' => 5206, 'post_type' => 'page', 'post_status' => 'draft', 'post_title' => 'T0204 Draft Page', 'post_content' => $p( 'T0204-DRAFTPAGE-BODY' ) ) );
// Protected: the title is public by design, the body is not.
$post( array( 'import_id' => 5203, 'post_title' => 'T0204 Protected Post', 'post_password' => (string) getenv( 'T0204_PROTECTED_PASSWORD' ),
	'post_category' => array( $cat_id ), 'post_content' => $p( 'T0204-PROTECTED-BODY' ) ) );

echo 'NOTE seeded; theme ' . get_stylesheet() . ', category ' . $cat_id . "\n";
