<?php
/**
 * Runs inside a disposable WordPress through `wp eval-file`. Throwaway proof for task 01-05.
 * Uses the real esc_html, esc_attr, esc_url, wp_kses, theme.json resolver, options, and REST.
 */

// phpcs:disable WordPress.DB.DirectDatabaseQuery, WordPress.WP.AlternativeFunctions, WordPress.Security.EscapeOutput.OutputNotEscaped, WordPress.WP.GlobalVariablesOverride

// wp eval-file runs this file inside a function, so the counters must be declared global.
global $blixis_pass, $blixis_fail;
$blixis_pass = 0;
$blixis_fail = 0;

/**
 * Records one check.
 *
 * @param string $name   Name.
 * @param bool   $ok     Result.
 * @param string $detail Failure detail.
 * @return void
 */
function blixis_check( string $name, bool $ok, string $detail = '' ): void {
	global $blixis_pass, $blixis_fail;
	if ( $ok ) {
		++$blixis_pass;
	} else {
		++$blixis_fail;
		echo 'FAIL ' . $name . ( '' !== $detail ? ' :: ' . $detail : '' ) . "\n";
	}
}

/**
 * Records an observation that is reported, whatever its value.
 *
 * @param string $name  Name.
 * @param string $value Value.
 * @return void
 */
function blixis_note( string $name, string $value ): void {
	echo 'NOTE ' . $name . ': ' . $value . "\n";
}

/**
 * Hashes every file below a directory.
 *
 * @param string $dir Directory.
 * @return string
 */
function blixis_tree_hash( string $dir ): string {
	$files = array();
	foreach ( new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $dir, FilesystemIterator::SKIP_DOTS ) ) as $file ) {
		$files[ substr( (string) $file, strlen( $dir ) ) ] = md5_file( (string) $file ) . ':' . filemtime( (string) $file );
	}
	ksort( $files );
	return md5( (string) wp_json_encode( $files ) );
}

/**
 * Reads a custom property from CSS text.
 *
 * @param string $css  CSS.
 * @param string $name Property.
 * @return string|null
 */
function blixis_css_var( string $css, string $name ): ?string {
	return preg_match( '~' . preg_quote( $name, '~' ) . ':\s*([^;]+);~', $css, $m ) ? trim( $m[1] ) : null;
}

/**
 * Current stylesheet, without any cache.
 *
 * @param string[] $types Stylesheet types.
 * @return string
 */
function blixis_fresh_styles( array $types = array( 'variables' ) ): string {
	wp_clean_theme_json_cache();
	return wp_get_global_stylesheet( $types );
}

global $wp_version, $wpdb;
blixis_note( 'versions', 'WordPress ' . $wp_version . ', PHP ' . PHP_VERSION );

$contract_root = '/tmp/contract/wp';
$themes_root   = get_theme_root();
foreach ( json_decode( file_get_contents( $contract_root . '/fixture-themes.json' ), true ) as $relative => $text ) {
	wp_mkdir_p( dirname( $themes_root . '/' . $relative ) );
	file_put_contents( $themes_root . '/' . $relative, $text );
}
switch_theme( 'blixis-starter' );
blixis_check( 'child theme active', 'blixis-starter' === get_stylesheet() && 'blixis-base' === get_template() );
$parent_hash = blixis_tree_hash( $themes_root . '/blixis-base' );

$admin = get_user_by( 'login', 'contract_admin' );
$admin_id = (int) $admin->ID;
$subscriber_id = (int) wp_insert_user( array( 'user_login' => 'contract_sub', 'user_pass' => wp_generate_password(), 'role' => 'subscriber', 'user_email' => 'sub@example.test' ) );
$editor_id     = (int) wp_insert_user( array( 'user_login' => 'contract_ed', 'user_pass' => wp_generate_password(), 'role' => 'editor', 'user_email' => 'ed@example.test' ) );
$author_id     = (int) wp_insert_user( array( 'user_login' => 'contract_au', 'user_pass' => wp_generate_password(), 'role' => 'author', 'user_email' => 'au@example.test' ) );

// ---------------------------------------------------------------- Validator in real WordPress.
$manifest = blixis_contract_json( 'invalid/expected.json' );
foreach ( blixis_contract_list( 'invalid/' ) as $path ) {
	$name = substr( $path, strlen( 'invalid/' ) );
	if ( 'expected.json' === $name ) {
		continue;
	}
	$result = blixis_validate_bytes( blixis_contract_raw( $path ) );
	blixis_check( 'validator invalid ' . $name, ! $result['ok'] && $result['errors'] === $manifest[ $name ]['errors'], (string) wp_json_encode( $result['errors'] ) );
}
foreach ( blixis_contract_list( 'valid/' ) as $path ) {
	$result = blixis_validate_bytes( blixis_contract_raw( $path ) );
	blixis_check( 'validator valid ' . $path, $result['ok'], (string) wp_json_encode( $result['errors'] ) );
}
foreach ( blixis_contract_json( 'raw-cases.json' ) as $case ) {
	$result = blixis_validate_bytes( (string) base64_decode( $case['base64'], true ) );
	blixis_check( 'validator raw ' . $case['name'], $result['errors'] === $case['errors'], (string) wp_json_encode( $result['errors'] ) );
}

// ---------------------------------------------------------------- Generator goldens.
$default_bytes = blixis_contract_raw( 'valid/default.json' );
$default       = blixis_validate_bytes( $default_bytes )['config'];
$golden_css    = blixis_contract_raw( 'golden/default.tokens.css' );
blixis_check( 'golden css bytes', blixis_generate_css( $default ) === $golden_css );
blixis_check( 'golden theme.json', blixis_canonical_json( blixis_generate_theme_json( $default ) ) === blixis_canonical_json( blixis_contract_json( 'golden/default.theme.json' ) ) );
blixis_check( 'golden css key', blixis_css_cache_key( $default ) === blixis_contract_json( 'golden/cache-keys.json' )['css']['default'] );

// ---------------------------------------------------------------- Before any config: Base alone.
$base_only = blixis_fresh_styles();
blixis_check( 'Base palette untouched without config', '#06b6d4' === blixis_css_var( $base_only, '--wp--preset--color--accent' ) );

// ---------------------------------------------------------------- Persistence and last-valid.
wp_set_current_user( $admin_id );
$saved = blixis_proof_save( $default_bytes );
blixis_check( 'valid save', 'saved' === $saved['status'] && 1 === $saved['revision'], (string) wp_json_encode( $saved ) );
$autoload = $wpdb->get_var( $wpdb->prepare( "SELECT autoload FROM {$wpdb->options} WHERE option_name = %s", BLIXIS_PROOF_OPTION ) );
blixis_check( 'option is autoloaded', in_array( $autoload, array( 'yes', 'on', 'auto-on' ), true ), (string) $autoload );
blixis_note( 'option row bytes', (string) strlen( (string) blixis_proof_raw_row() ) );

$row_before = blixis_proof_raw_row();
$css_before = blixis_generate_css( blixis_proof_read()['config'] );
$invalid_ok = 0;
$invalid_n  = 0;
foreach ( blixis_contract_list( 'invalid/' ) as $path ) {
	if ( str_ends_with( $path, 'expected.json' ) ) {
		continue;
	}
	++$invalid_n;
	$out = blixis_proof_save( blixis_contract_raw( $path ) );
	if ( 'invalid' === $out['status'] && blixis_proof_raw_row() === $row_before && blixis_generate_css( blixis_proof_read()['config'] ) === $css_before ) {
		++$invalid_ok;
	}
}
blixis_check( 'every invalid save keeps the row and CSS byte-identical', $invalid_ok === $invalid_n, $invalid_ok . '/' . $invalid_n );
blixis_note( 'invalid saves refused', $invalid_ok . '/' . $invalid_n );

$fixture_blue = str_replace( '#155dfc', '#00ff00', $default_bytes );
$conflict = blixis_proof_save( $fixture_blue, 99 );
blixis_check( 'stale revision refused', 'conflict' === $conflict['status'] && blixis_proof_raw_row() === $row_before );

$failing = static function ( string $sql ): string {
	return str_starts_with( $sql, 'UPDATE' ) && str_contains( $sql, BLIXIS_PROOF_OPTION ) ? '' : $sql;
};
add_filter( 'query', $failing );
$suppress = $wpdb->suppress_errors( true );
$failed   = blixis_proof_save( $fixture_blue );
$wpdb->suppress_errors( $suppress );
remove_filter( 'query', $failing );
blixis_check( 'failed database write keeps last valid', 'write_failed' === $failed['status'] && blixis_proof_raw_row() === $row_before, (string) wp_json_encode( $failed ) );
blixis_check( 'failed write leaves active config', '#155dfc' === blixis_proof_read()['config']['colors']['primary'] );

// A second writer lands between the read and the UPDATE.
$raced = false;
$race  = static function ( string $sql ) use ( &$raced, $wpdb ): string {
	if ( ! $raced && str_starts_with( $sql, 'UPDATE' ) && str_contains( $sql, BLIXIS_PROOF_OPTION ) ) {
		$raced = true;
		$other = json_decode( (string) blixis_proof_raw_row(), true );
		$other['revision'] = 50;
		$wpdb->update( $wpdb->options, array( 'option_value' => wp_json_encode( $other ) ), array( 'option_name' => BLIXIS_PROOF_OPTION ) );
	}
	return $sql;
};
add_filter( 'query', $race );
$lost = blixis_proof_save( $fixture_blue );
remove_filter( 'query', $race );
blixis_check( 'concurrent writer wins, second writer gets conflict', 'conflict' === $lost['status'], (string) wp_json_encode( $lost ) );
$after_race = json_decode( (string) blixis_proof_raw_row(), true );
blixis_check( 'no lost update', 50 === $after_race['revision'] && '#155dfc' === $after_race['config']['colors']['primary'] );
$wpdb->update( $wpdb->options, array( 'option_value' => $row_before ), array( 'option_name' => BLIXIS_PROOF_OPTION ) );
wp_cache_delete( 'alloptions', 'options' );
wp_cache_delete( BLIXIS_PROOF_OPTION, 'options' );

// ---------------------------------------------------------------- Global styles through the filter.
$styles = blixis_fresh_styles();
$vars   = blixis_css_variables( $default );
$wp_map = array(
	'colors'    => '--wp--preset--color--',
	'fonts'     => '--wp--preset--font-family--',
	'typeScale' => '--wp--preset--font-size--',
	'spacing'   => '--wp--preset--spacing--',
	'radius'    => '--wp--preset--border-radius--',
	'shadows'   => '--wp--preset--shadow--',
);
$parity = 0;
foreach ( blixis_token_map()['sections'] as $section ) {
	if ( ! isset( $wp_map[ $section['section'] ] ) ) {
		continue;
	}
	foreach ( $section['tokens'] as $key => $variable ) {
		$wp_var = $wp_map[ $section['section'] ] . _wp_to_kebab_case( (string) $key );
		$actual = blixis_css_var( $styles, $wp_var );
		blixis_check( 'parity ' . $wp_var, $actual === $vars[ $variable ], (string) $actual . ' vs ' . $vars[ $variable ] );
		++$parity;
	}
}
blixis_note( 'preset parity checks', (string) $parity );
blixis_note( '2xl slug becomes', _wp_to_kebab_case( '2xl' ) );
foreach ( array( 'duration-fast', 'duration-base', 'duration-slow', 'easing' ) as $key ) {
	$actual = blixis_css_var( $styles, '--wp--custom--blixis--motion--' . $key );
	blixis_check( 'parity custom motion ' . $key, $actual === $vars[ '--blixis-motion-' . $key ], (string) $actual );
}
blixis_check( 'parity custom gutter', blixis_css_var( $styles, '--wp--custom--blixis--layout--gutter' ) === $vars['--blixis-layout-gutter'] );
blixis_check( 'Base preset replaced, not merged', null === blixis_css_var( $styles, '--wp--preset--color--background' ) );
$rules = blixis_fresh_styles( array( 'styles' ) );
blixis_check( 'parity content width', blixis_css_var( $rules, '--wp--style--global--content-size' ) === $vars['--blixis-layout-content-width'], (string) blixis_css_var( $rules, '--wp--style--global--content-size' ) );
blixis_check( 'parity wide width', blixis_css_var( $rules, '--wp--style--global--wide-size' ) === $vars['--blixis-layout-wide-width'], (string) blixis_css_var( $rules, '--wp--style--global--wide-size' ) );
blixis_check( 'body uses the surface preset', str_contains( $rules, 'background-color: var(--wp--preset--color--surface)' ), substr( $rules, 0, 300 ) );
blixis_check( 'no orphan background reference', ! str_contains( $rules, 'var(--wp--preset--color--background)' ) );
blixis_check( 'parent theme files unchanged after save', blixis_tree_hash( $themes_root . '/blixis-base' ) === $parent_hash );

// Control: deliberately restoring the old background reference creates an orphan.
$only_palette = static fn( $data ) => $data->update_with(
	array(
		'version'  => 3,
		'settings' => array( 'color' => array( 'palette' => blixis_generate_theme_json( blixis_proof_read()['config'] )['settings']['color']['palette'] ) ),
		'styles'   => array( 'color' => array( 'background' => 'var:preset|color|background' ) ),
	)
);
add_filter( 'wp_theme_json_data_theme', $only_palette, 20 );
$orphan_rules = blixis_fresh_styles( array( 'styles' ) );
$orphan_vars  = blixis_fresh_styles();
remove_filter( 'wp_theme_json_data_theme', $only_palette, 20 );
blixis_check(
	'control: obsolete background reference is orphaned',
	str_contains( $orphan_rules, 'var(--wp--preset--color--background)' ) && null === blixis_css_var( $orphan_vars, '--wp--preset--color--background' )
);

// Control: explicitly enabling fluid typography rewrites sizes and loses parity.
$fluid = static fn( $data ) => $data->update_with(
	array(
		'version'  => 3,
		'settings' => array(
			'typography' => array(
				'fluid' => true,
				'fontSizes' => array(
					array(
						'slug' => '3xl',
						'name' => '3xl',
						'size' => '2rem',
						'fluid' => true,
					),
				),
			),
		),
	)
);
add_filter( 'wp_theme_json_data_theme', $fluid, 20 );
$fluid_value = (string) blixis_css_var( blixis_fresh_styles(), '--wp--preset--font-size--3-xl' );
remove_filter( 'wp_theme_json_data_theme', $fluid, 20 );
blixis_check( 'control: explicit fluid typography rewrites sizes', str_starts_with( $fluid_value, 'clamp(' ), $fluid_value );
blixis_note( 'fluid rewrite of 2rem', $fluid_value );

// Control: a Site Editor (user origin) override diverges from --blixis-*.
$user_override = static fn( $data ) => $data->update_with(
	array(
		'version'  => 3,
		'settings' => array(
			'color' => array(
				'palette' => array(
					array(
						'slug'  => 'primary',
						'name'  => 'Primary',
						'color' => '#000000',
					),
				),
			),
		),
	)
);
add_filter( 'wp_theme_json_data_user', $user_override );
$user_styles = blixis_fresh_styles();
remove_filter( 'wp_theme_json_data_user', $user_override );
blixis_note( 'user origin primary preset', (string) blixis_css_var( $user_styles, '--wp--preset--color--primary' ) );
blixis_check( 'finding: Site Editor override changes the preset but not --blixis-*', '#000000' === blixis_css_var( $user_styles, '--wp--preset--color--primary' ) && '#155dfc' === $vars['--blixis-color-primary'] );

// Stale global-styles cache: a write that skips invalidation is not seen.
wp_clean_theme_json_cache();
$first   = wp_get_global_stylesheet( array( 'variables' ) );
$changed = json_decode( (string) blixis_proof_raw_row(), true );
$green   = blixis_validate_bytes( $fixture_blue )['config'];
$direct  = $changed;
$direct['config'] = $green;
$direct['hash']   = blixis_config_hash( $green );
update_option( BLIXIS_PROOF_OPTION, (string) wp_json_encode( $direct ) );
$stale = wp_get_global_stylesheet( array( 'variables' ) );
blixis_check( 'finding: writing the option alone leaves global styles stale', '#155dfc' === blixis_css_var( $stale, '--wp--preset--color--primary' ), (string) blixis_css_var( $stale, '--wp--preset--color--primary' ) );
wp_clean_theme_json_cache();
blixis_check( 'wp_clean_theme_json_cache makes it fresh', '#00ff00' === blixis_css_var( wp_get_global_stylesheet( array( 'variables' ) ), '--wp--preset--color--primary' ) );
update_option( BLIXIS_PROOF_OPTION, $row_before );
wp_clean_theme_json_cache();

$via_save = blixis_proof_save( $fixture_blue, 1 );
blixis_check( 'second save', 'saved' === $via_save['status'] && 2 === $via_save['revision'], (string) wp_json_encode( $via_save ) );
blixis_check( 'save invalidates global styles itself', '#00ff00' === blixis_css_var( wp_get_global_stylesheet( array( 'variables' ) ), '--wp--preset--color--primary' ) );
blixis_check( 'css key changed with the value', $via_save['cssKey'] !== $saved['cssKey'] );
$rolled = blixis_proof_rollback();
blixis_check( 'rollback is a new revision with the old hash', 'saved' === $rolled['status'] && 3 === $rolled['revision'] && $rolled['hash'] === $saved['hash'], (string) wp_json_encode( $rolled ) );
blixis_check( 'rollback restores global styles', '#155dfc' === blixis_css_var( wp_get_global_stylesheet( array( 'variables' ) ), '--wp--preset--color--primary' ) );

// ---------------------------------------------------------------- Tampered stored data.
$good_row = blixis_proof_raw_row();
$tampered = json_decode( $good_row, true );
$tampered['config']['colors']['primary'] = 'red;}body{display:none}';
$wpdb->update( $wpdb->options, array( 'option_value' => wp_json_encode( $tampered ) ), array( 'option_name' => BLIXIS_PROOF_OPTION ) );
wp_cache_delete( 'alloptions', 'options' );
wp_cache_delete( BLIXIS_PROOF_OPTION, 'options' );
$read = blixis_proof_read();
blixis_check( 'tampered row falls back to previous', 'previous' === $read['source'], $read['source'] );
blixis_check( 'tampered value never reaches CSS', ! str_contains( blixis_generate_css( $read['config'] ), 'body{display:none}' ) );
$tamper_styles = blixis_fresh_styles();
blixis_check( 'tampered value never reaches global styles', ! str_contains( $tamper_styles, 'body{display:none}' ) );
$tampered['previous'] = null;
$wpdb->update( $wpdb->options, array( 'option_value' => wp_json_encode( $tampered ) ), array( 'option_name' => BLIXIS_PROOF_OPTION ) );
wp_cache_delete( 'alloptions', 'options' );
wp_cache_delete( BLIXIS_PROOF_OPTION, 'options' );
blixis_check( 'tampered row without previous yields no config', 'none' === blixis_proof_read()['source'] );
$none_styles = blixis_fresh_styles();
blixis_check( 'no config falls back to Base presets', '#06b6d4' === blixis_css_var( $none_styles, '--wp--preset--color--accent' ) );
$forged = $tampered;
$forged['config'] = $default;
$forged['hash']   = 'deadbeefdeadbeef';
$wpdb->update( $wpdb->options, array( 'option_value' => wp_json_encode( $forged ) ), array( 'option_name' => BLIXIS_PROOF_OPTION ) );
wp_cache_delete( 'alloptions', 'options' );
wp_cache_delete( BLIXIS_PROOF_OPTION, 'options' );
blixis_check( 'hash mismatch is refused', 'none' === blixis_proof_read()['source'] );
$wpdb->update( $wpdb->options, array( 'option_value' => $good_row ), array( 'option_name' => BLIXIS_PROOF_OPTION ) );
wp_cache_delete( 'alloptions', 'options' );
wp_cache_delete( BLIXIS_PROOF_OPTION, 'options' );

// ---------------------------------------------------------------- Theme slug guard.
$slug_bytes = str_replace( '"slug":"blixis-starter"', '"slug":"other-child"', (string) wp_json_encode( json_decode( $default_bytes ) ) );
$slug_bytes = str_replace( '#155dfc', '#112233', $slug_bytes );
$other = blixis_proof_save( $slug_bytes );
blixis_check( 'config for another child saves', 'saved' === $other['status'] );
blixis_check( 'config for another child does not apply', '#155dfc' === blixis_css_var( blixis_fresh_styles(), '--wp--preset--color--primary' ) );
blixis_proof_save( $default_bytes );

// ---------------------------------------------------------------- REST permissions and export.
/**
 * Runs a REST request as a user.
 *
 * @param int                   $user    User ID.
 * @param string                $method  Method.
 * @param string                $route   Route.
 * @param string|null           $body    Raw body.
 * @param array<string, string> $headers Headers.
 * @return WP_REST_Response
 */
function blixis_rest( int $user, string $method, string $route, ?string $body = null, array $headers = array() ): WP_REST_Response {
	wp_set_current_user( $user );
	$request = new WP_REST_Request( $method, $route );
	if ( null !== $body ) {
		$request->set_body( $body );
	}
	foreach ( $headers as $name => $value ) {
		$request->set_header( $name, $value );
	}
	return rest_ensure_response( rest_do_request( $request ) );
}

do_action( 'rest_api_init' );
$row_now = blixis_proof_raw_row();
blixis_check( 'REST anonymous save 401', 401 === blixis_rest( 0, 'POST', '/blixis-proof/v1/tokens', $fixture_blue )->get_status() );
blixis_check( 'REST subscriber save 403', 403 === blixis_rest( $subscriber_id, 'POST', '/blixis-proof/v1/tokens', $fixture_blue )->get_status() );
blixis_check( 'REST author save 403', 403 === blixis_rest( $author_id, 'POST', '/blixis-proof/v1/tokens', $fixture_blue )->get_status() );
blixis_check( 'REST editor save 403', 403 === blixis_rest( $editor_id, 'POST', '/blixis-proof/v1/tokens', $fixture_blue )->get_status() );
blixis_check( 'REST anonymous export 401', 401 === blixis_rest( 0, 'GET', '/blixis-proof/v1/tokens' )->get_status() );
blixis_check( 'refused requests changed nothing', blixis_proof_raw_row() === $row_now );
$bad_response = blixis_rest( $admin_id, 'POST', '/blixis-proof/v1/tokens', blixis_contract_raw( 'invalid/color-css-breakout.json' ) );
blixis_check( 'REST invalid 422 with field error', 422 === $bad_response->get_status() && array( array( 'code' => 'token.color.invalid', 'path' => '/colors/primary' ) ) === $bad_response->get_data()['errors'] );
blixis_check( 'REST invalid changed nothing', blixis_proof_raw_row() === $row_now );
$current_revision = (int) json_decode( $row_now, true )['revision'];
$stale_response   = blixis_rest( $admin_id, 'POST', '/blixis-proof/v1/tokens', $fixture_blue, array( 'if-match' => (string) ( $current_revision - 1 ) ) );
blixis_check( 'REST stale revision 409', 409 === $stale_response->get_status() );

// Export: the option holds the canonical config, and an import returns the same hash.
$export = blixis_rest( $admin_id, 'GET', '/blixis-proof/v1/tokens' );
blixis_check( 'REST admin export 200', 200 === $export->get_status() );
$exported = (string) wp_json_encode( $export->get_data()['config'], JSON_PRETTY_PRINT );
$import   = blixis_validate_bytes( $exported );
blixis_check( 'export re-validates', $import['ok'], (string) wp_json_encode( $import['errors'] ) );
blixis_check( 'export round trip keeps the hash', blixis_config_hash( $import['config'] ) === $export->get_data()['hash'] );
blixis_check( 'export round trip keeps the CSS bytes', blixis_generate_css( $import['config'] ) === $golden_css );
wp_set_current_user( $admin_id );

// ---------------------------------------------------------------- Renderer goldens, real escapers.
$cases = blixis_contract_json( 'renderer/cases.json' );
$fixture_media = static fn( int $id ): ?array => $cases['media'][ (string) $id ] ?? null;
foreach ( $cases['cases'] as $case ) {
	$diagnostics = array();
	$html        = blixis_render_node( $case['node'], $fixture_media, $diagnostics );
	blixis_check( 'render ' . $case['name'], $html === $case['html'], $html );
	blixis_check( 'render diagnostics ' . $case['name'], $diagnostics === $case['diagnostics'], (string) wp_json_encode( $diagnostics ) );
	// WordPress's own HTML parser decides what is a tag or attribute, not a regular expression.
	$parsed = new WP_HTML_Tag_Processor( $html );
	while ( $parsed->next_tag() ) {
		blixis_check( 'render tag ' . $case['name'], in_array( $parsed->get_tag(), array( 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'A', 'SPAN', 'IMG', 'STRONG', 'EM', 'BR', 'CODE' ), true ), (string) $parsed->get_tag() );
		foreach ( (array) $parsed->get_attribute_names_with_prefix( '' ) as $attribute ) {
			blixis_check( 'render attribute ' . $case['name'], in_array( $attribute, array( 'class', 'href', 'src', 'alt', 'width', 'height', 'loading' ), true ), $attribute );
		}
		foreach ( array( 'href', 'src' ) as $attribute ) {
			$url = $parsed->get_attribute( $attribute );
			blixis_check( 'render url scheme ' . $case['name'], ! is_string( $url ) || ! preg_match( '/^\s*(?:javascript|data|vbscript):/i', $url ), (string) $url );
		}
	}
}
blixis_note( 'renderer cases', (string) count( $cases['cases'] ) );
foreach ( blixis_contract_json( 'renderer/responsive.json' ) as $item ) {
	$resolved = blixis_resolve_responsive( $item['base'], $item['overrides'] );
	blixis_check( 'responsive ' . $item['name'], $resolved === $item['resolved'] && implode( ' ', blixis_responsive_classes( $item['prop'], $resolved ) ) === $item['classes'] );
}

// Why plain esc_html is not enough: it keeps entities, so the two renderers would disagree.
blixis_check( 'finding: esc_html does not double-encode', 'AT&amp;T' === esc_html( 'AT&amp;T' ) );
blixis_check( 'finding: esc_attr does not double-encode', 'R&amp;D' === esc_attr( 'R&amp;D' ) );
blixis_check( 'literal escape keeps the entity as text', 'AT&amp;amp;T' === blixis_esc_text( 'AT&amp;T' ) );
blixis_check( 'esc_url refuses data: without an allowlist', '' === esc_url( 'data:text/html,x' ) );
blixis_check( 'esc_url refuses javascript:', '' === esc_url( 'javascript:alert(1)' ) );
blixis_check( 'finding: esc_url default list admits ftp, so pass protocols', 'ftp://example.test/' === esc_url( 'ftp://example.test/' ) );
blixis_check( 'allowlist drops ftp in esc_url', '' === esc_url( 'ftp://example.test/', array( 'http', 'https', 'mailto', 'tel' ) ) );

// Real attachment through the media resolver.
$upload = wp_upload_bits( 'proof.png', null, base64_decode( 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', true ) );
blixis_check( 'upload fixture', empty( $upload['error'] ), (string) $upload['error'] );
$attachment = (int) wp_insert_attachment( array( 'post_mime_type' => 'image/png', 'post_title' => 'Proof', 'post_status' => 'inherit' ), $upload['file'] );
wp_update_attachment_metadata( $attachment, array( 'width' => 1, 'height' => 1, 'file' => _wp_relative_upload_path( $upload['file'] ) ) );
$diagnostics = array();
$attachment_html = blixis_render_node( array( 'id' => 'i', 'type' => 'blixis/image', 'version' => 1, 'props' => array( 'mediaId' => $attachment, 'alt' => 'x"y' ) ), 'blixis_proof_media', $diagnostics );
blixis_check( 'real attachment renders', str_contains( $attachment_html, 'src="' . esc_url( $upload['url'] ) . '"' ) && str_contains( $attachment_html, 'alt="x&quot;y"' ) && str_contains( $attachment_html, 'width="1"' ), $attachment_html );
$hostile_src = static fn( $image ) => array( 'javascript:alert(1)', 1, 1, false );
add_filter( 'wp_get_attachment_image_src', $hostile_src );
$diagnostics = array();
$hostile_html = blixis_render_node( array( 'id' => 'i', 'type' => 'blixis/image', 'version' => 1, 'props' => array( 'mediaId' => $attachment, 'alt' => 'x' ) ), 'blixis_proof_media', $diagnostics );
remove_filter( 'wp_get_attachment_image_src', $hostile_src );
blixis_check( 'hostile attachment URL from a filter is dropped', '' === $hostile_html && 'render.unsafe_url' === ( $diagnostics[0]['code'] ?? '' ) );

// ---------------------------------------------------------------- Content filter order.
$literal_node = array( array( 'id' => 'c', 'type' => 'blixis/paragraph', 'version' => 1, 'props' => array( 'text' => "[blixis_proof_probe] -- 'quoted'" ) ) );
$early_post   = (int) wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Early', 'post_content' => 'x' ) );
update_post_meta( $early_post, BLIXIS_PROOF_META, wp_slash( (string) wp_json_encode( $literal_node ) ) );
$GLOBALS['post'] = get_post( $early_post );
setup_postdata( $GLOBALS['post'] );
$late_result = apply_filters( 'the_content', 'x' );
blixis_check( 'late hook keeps user text literal', ! str_contains( $late_result, 'SHORTCODE_EXECUTED' ) && str_contains( $late_result, '[blixis_proof_probe] -- &#039;quoted&#039;' ), $late_result );
$early_hook = static function () use ( $early_post ) {
	$diagnostics = array();
	return blixis_render_node( json_decode( get_post_meta( $early_post, BLIXIS_PROOF_META, true ), true )[0], 'blixis_proof_media', $diagnostics );
};
add_filter( 'the_content', $early_hook, 8 );
remove_all_filters( 'the_content', PHP_INT_MAX );
$early_result = apply_filters( 'the_content', 'x' );
remove_filter( 'the_content', $early_hook, 8 );
blixis_check( 'finding: an early the_content hook executes shortcodes in user text', str_contains( $early_result, 'SHORTCODE_EXECUTED' ), $early_result );
blixis_check( 'finding: an early the_content hook rewrites user text', ! str_contains( $early_result, ' -- ' ), $early_result );
wp_reset_postdata();

// ---------------------------------------------------------------- Real HTTP against the public site.
wp_set_current_user( 0 );
$hostile_nodes = array(
	array( 'id' => 'ok', 'type' => 'blixis/heading', 'version' => 1, 'props' => array( 'text' => 'Visible heading', 'level' => 2 ) ),
	array( 'id' => 'xss', 'type' => 'blixis/paragraph', 'version' => 1, 'props' => array( 'text' => '<script>window.pwned=1</script>[blixis_proof_probe]', 'onclick' => 'window.pwned=2' ) ),
	array( 'id' => 'future', 'type' => 'blixis/heading', 'version' => 99, 'props' => array( 'text' => 'SECRET_FUTURE_TEXT', 'newProp' => 1 ) ),
	array( 'id' => 'alien', 'type' => 'blixis/evil-element', 'version' => 1, 'props' => array( 'text' => 'SECRET_ALIEN_TEXT' ) ),
	array( 'id' => 'link', 'type' => 'blixis/button', 'version' => 1, 'props' => array( 'label' => 'Bad link', 'url' => 'javascript:window.pwned=3' ) ),
);
$stored_json = (string) wp_json_encode( $hostile_nodes );
$page_id = (int) wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Public proof', 'post_content' => 'Fallback body', 'post_author' => $admin_id ) );
update_post_meta( $page_id, BLIXIS_PROOF_META, wp_slash( $stored_json ) );
$response = wp_remote_get( home_url( '/?page_id=' . $page_id ), array( 'timeout' => 30 ) );
blixis_check( 'public page HTTP 200', 200 === wp_remote_retrieve_response_code( $response ), is_wp_error( $response ) ? $response->get_error_message() : (string) wp_remote_retrieve_response_code( $response ) );
$body = (string) wp_remote_retrieve_body( $response );
blixis_note( 'public page bytes', (string) strlen( $body ) );
blixis_check( 'public: rendered element present', str_contains( $body, '<h2 class="blixis-heading">Visible heading</h2>' ), substr( $body, 0, 500 ) );
blixis_check( 'public: script escaped', str_contains( $body, '&lt;script&gt;window.pwned=1&lt;/script&gt;' ) && ! str_contains( $body, '<script>window.pwned' ) );
blixis_check( 'public: shortcode not executed', ! str_contains( $body, 'SHORTCODE_EXECUTED' ) );
blixis_check( 'public: event prop absent', ! str_contains( $body, 'window.pwned=2' ) && ! str_contains( $body, 'onclick' ) );
blixis_check( 'public: bad link inert', str_contains( $body, '<span class="blixis-button">Bad link</span>' ) && ! str_contains( $body, 'window.pwned=3' ) );
blixis_check( 'public: unknown version text absent', ! str_contains( $body, 'SECRET_FUTURE_TEXT' ) );
blixis_check( 'public: unknown type text absent', ! str_contains( $body, 'SECRET_ALIEN_TEXT' ) );
blixis_check( 'public: no diagnostic leak', ! preg_match( '/render\.(unknown|invalid|unsafe)|blixis\/evil-element|newProp/', $body ) );
blixis_check( 'public: tokens inline', str_contains( $body, '--blixis-color-primary: #155dfc;' ) );
blixis_check( 'public: token style block complete', str_contains( $body, trim( $golden_css ) ), 'golden CSS not found verbatim' );
blixis_check( 'public: preset parity on the wire', 1 === preg_match( '/--wp--preset--color--primary: ?#155dfc/', $body ) );
blixis_check( 'public: Base fallback body not shown', ! str_contains( $body, 'Fallback body' ) );
$editor_patterns = array(
	'/id=["\'](?:blixis-editor|react|react-dom|wp-element|wp-components|wp-block-editor|wp-edit-post|wp-editor)[^"\']*-(?:js|css)["\']/',
	'/wp-includes\/js\/dist\/(?:element|components|block-editor|edit-post|editor)(?:\.min)?\.js/',
	'/wp-includes\/js\/dist\/vendor\/react/',
	'/blixis-editor/',
);
foreach ( $editor_patterns as $pattern ) {
	blixis_check( 'public: no editor asset ' . $pattern, ! preg_match( $pattern, $body ) );
}
blixis_check( 'stored document is byte-identical after public render', get_post_meta( $page_id, BLIXIS_PROOF_META, true ) === $stored_json );
blixis_check( 'stored unknown version text kept', str_contains( (string) get_post_meta( $page_id, BLIXIS_PROOF_META, true ), 'SECRET_FUTURE_TEXT' ) );
$public_rest = (string) wp_remote_retrieve_body( wp_remote_get( rest_url( 'wp/v2/pages/' . $page_id ) ) );
blixis_note( 'core REST content.rendered carries element HTML', str_contains( $public_rest, 'Visible heading' ) ? 'yes' : 'no' );
blixis_check( 'document meta hidden from public REST', ! str_contains( (string) wp_remote_retrieve_body( wp_remote_get( rest_url( 'wp/v2/pages/' . $page_id ) ) ), 'SECRET_FUTURE_TEXT' ) );

// Positive control: the same plugin does load editor assets in admin.
blixis_check( 'control: editor assets hook only admin', false !== has_action( 'admin_enqueue_scripts', 'blixis_proof_enqueue_editor' ) && false === has_action( 'wp_enqueue_scripts', 'blixis_proof_enqueue_editor' ) );
blixis_proof_enqueue_editor();
blixis_check( 'control: editor script enqueues React dependencies', wp_script_is( 'blixis-editor', 'enqueued' ) && in_array( 'react', wp_scripts()->registered['blixis-editor']->deps, true ) );
wp_dequeue_script( 'blixis-editor' );

// Diagnostics are out of band and need post access, even for an administrator's page view.
wp_set_current_user( $admin_id );
$GLOBALS['post'] = get_post( $page_id );
setup_postdata( $GLOBALS['post'] );
$admin_view = (string) apply_filters( 'the_content', 'x' );
wp_reset_postdata();
blixis_check( 'admin page view has no diagnostic in HTML', ! preg_match( '/render\.|evil-element/', $admin_view ), $admin_view );
blixis_check( 'REST anonymous diagnostics 401', 401 === blixis_rest( 0, 'GET', '/blixis-proof/v1/diagnostics/' . $page_id )->get_status() );
blixis_check( 'REST subscriber diagnostics 403', 403 === blixis_rest( $subscriber_id, 'GET', '/blixis-proof/v1/diagnostics/' . $page_id )->get_status() );
$found_diag = blixis_rest( $editor_id, 'GET', '/blixis-proof/v1/diagnostics/' . $page_id );
$diag_data  = $found_diag->get_data();
blixis_check( 'REST editor sees diagnostics', 200 === $found_diag->get_status() && 'render.unknown_version' === ( $diag_data['future'][0]['code'] ?? '' ) && 'render.unknown_type' === ( $diag_data['alien'][0]['code'] ?? '' ), (string) wp_json_encode( $diag_data ) );

// Drafts and passwords are not public and have no cache key.
wp_set_current_user( 0 );
$draft_id = (int) wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'draft', 'post_title' => 'Draft', 'post_content' => 'x', 'post_author' => $admin_id ) );
update_post_meta( $draft_id, BLIXIS_PROOF_META, wp_slash( (string) wp_json_encode( array( array( 'id' => 'd', 'type' => 'blixis/heading', 'version' => 1, 'props' => array( 'text' => 'SECRET_DRAFT_TEXT' ) ) ) ) ) );
$draft_response = wp_remote_get( home_url( '/?page_id=' . $draft_id ), array( 'timeout' => 30 ) );
blixis_check( 'draft is not public', ! str_contains( (string) wp_remote_retrieve_body( $draft_response ), 'SECRET_DRAFT_TEXT' ), (string) wp_remote_retrieve_response_code( $draft_response ) );
$key_input = array( 'postId' => $draft_id, 'documentHash' => 'x', 'rendererVersion' => 1, 'registryHash' => 'x', 'status' => get_post_status( $draft_id ), 'hasPassword' => false, 'configHash' => 'x' );
blixis_check( 'draft has no cache key', null === blixis_fragment_cache_key( $key_input ) && null === blixis_page_cache_key( $key_input ) );
$locked_id = (int) wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Locked', 'post_content' => 'x', 'post_password' => 'pw', 'post_author' => $admin_id ) );
update_post_meta( $locked_id, BLIXIS_PROOF_META, wp_slash( (string) wp_json_encode( array( array( 'id' => 'l', 'type' => 'blixis/heading', 'version' => 1, 'props' => array( 'text' => 'SECRET_LOCKED_TEXT' ) ) ) ) ) );
$locked_body = (string) wp_remote_retrieve_body( wp_remote_get( home_url( '/?page_id=' . $locked_id ), array( 'timeout' => 30 ) ) );
blixis_check( 'password-protected body stays hidden', ! str_contains( $locked_body, 'SECRET_LOCKED_TEXT' ), substr( $locked_body, 0, 200 ) );
blixis_check( 'password form still shown', str_contains( $locked_body, 'post_password' ) );
$locked_rest = (string) wp_remote_retrieve_body( wp_remote_get( rest_url( 'wp/v2/pages/' . $locked_id ) ) );
blixis_check( 'password-protected body hidden from core REST', ! str_contains( $locked_rest, 'SECRET_LOCKED_TEXT' ), substr( $locked_rest, 0, 200 ) );
// Control: the same hook without the password guard publishes the protected document.
update_option( 'blixis_proof_unsafe_no_password_guard', '1' );
$leak_body = (string) wp_remote_retrieve_body( wp_remote_get( home_url( '/?page_id=' . $locked_id ), array( 'timeout' => 30 ) ) );
$leak_rest = (string) wp_remote_retrieve_body( wp_remote_get( rest_url( 'wp/v2/pages/' . $locked_id ) ) );
delete_option( 'blixis_proof_unsafe_no_password_guard' );
blixis_check( 'finding: a late the_content hook without a guard leaks protected content', str_contains( $leak_body, 'SECRET_LOCKED_TEXT' ) );
blixis_note( 'unguarded hook leaks through core REST', str_contains( $leak_rest, 'SECRET_LOCKED_TEXT' ) ? 'yes' : 'no' );

// Token change: HTML unchanged, CSS and page differ.
$first_fragment = blixis_proof_render_post( $page_id );
$before_body    = $body;
wp_set_current_user( $admin_id );
blixis_proof_save( $fixture_blue );
wp_set_current_user( 0 );
$second_fragment = blixis_proof_render_post( $page_id );
blixis_check( 'token value change leaves element HTML byte-identical', $first_fragment === $second_fragment );
$after_body = (string) wp_remote_retrieve_body( wp_remote_get( home_url( '/?page_id=' . $page_id ), array( 'timeout' => 30 ) ) );
blixis_check( 'next request shows the new value', str_contains( $after_body, '--blixis-color-primary: #00ff00;' ) && 1 === preg_match( '/--wp--preset--color--primary: ?#00ff00/', $after_body ) );
blixis_check( 'and not the old one', ! str_contains( $after_body, '#155dfc' ) );
wp_set_current_user( $admin_id );
blixis_proof_save( $default_bytes );
wp_set_current_user( 0 );

// Public page when the stored row was tampered with: no CSS break-out on the wire.
$good_row = blixis_proof_raw_row();
$tampered = json_decode( $good_row, true );
$tampered['config']['colors']['primary'] = 'red;}body{display:none}';
$wpdb->update( $wpdb->options, array( 'option_value' => wp_json_encode( $tampered ) ), array( 'option_name' => BLIXIS_PROOF_OPTION ) );
$tamper_body = (string) wp_remote_retrieve_body( wp_remote_get( home_url( '/?page_id=' . $page_id ), array( 'timeout' => 30 ) ) );
blixis_check( 'public: tampered row does not reach the wire', ! str_contains( $tamper_body, 'body{display:none}' ) && str_contains( $tamper_body, '--blixis-color-primary:' ), substr( $tamper_body, 0, 200 ) );
$wpdb->update( $wpdb->options, array( 'option_value' => $good_row ), array( 'option_name' => BLIXIS_PROOF_OPTION ) );

// Task 02-01 gives Base a singular template that renders the plugin output.
switch_theme( 'blixis-base' );
$base_body = (string) wp_remote_retrieve_body( wp_remote_get( home_url( '/?page_id=' . $page_id ), array( 'timeout' => 30 ) ) );
blixis_check( 'Base singular template renders the element HTML', str_contains( $base_body, '<h2 class="blixis-heading">Visible heading</h2>' ), substr( $base_body, 0, 200 ) );
blixis_note( 'Base template shows fallback body text', str_contains( $base_body, 'Fallback body' ) ? 'yes' : 'no' );
blixis_check( 'config for a child does not apply under Base', ! str_contains( $base_body, '--blixis-color-primary' ) );
switch_theme( 'blixis-starter' );

// Module independence: without the plugin the child theme still serves the page, with the
// plain post body and no token CSS, and the protected document stays unexposed.
wp_set_current_user( $admin_id );
deactivate_plugins( 'blixis-tokens-proof.php' );
$no_plugin = wp_remote_get( home_url( '/?page_id=' . $page_id ), array( 'timeout' => 30 ) );
activate_plugin( 'blixis-tokens-proof.php' );
wp_set_current_user( 0 );
$no_plugin_body = (string) wp_remote_retrieve_body( $no_plugin );
blixis_check( 'plugin inactive: page still served', 200 === wp_remote_retrieve_response_code( $no_plugin ) );
blixis_check( 'plugin inactive: post body is the fallback', str_contains( $no_plugin_body, 'Fallback body' ) );
blixis_check( 'plugin inactive: no document or token leak', ! str_contains( $no_plugin_body, 'SECRET_FUTURE_TEXT' ) && ! preg_match( '/(?<![a-z-])--blixis-[a-z-]+\s*:/', $no_plugin_body ) );

// ---------------------------------------------------------------- Cost and no-write guarantees.
$started = hrtime( true );
for ( $i = 0; $i < 200; $i++ ) {
	blixis_generate_css( blixis_proof_read()['config'] );
}
blixis_note( 'read, re-validate, and generate', round( ( hrtime( true ) - $started ) / 200 / 1000 ) . ' microseconds' );
blixis_check( 'parent theme files unchanged at the end', blixis_tree_hash( $themes_root . '/blixis-base' ) === $parent_hash );
blixis_check( 'no theme.json written to the child', ! file_exists( $themes_root . '/blixis-starter/theme.json' ) );

echo 'CONTRACT_RESULT pass=' . $blixis_pass . ' fail=' . $blixis_fail . "\n";
