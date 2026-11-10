<?php
/**
 * Setup wizard: the Header and footer step and the layout draft (task 03-07 Part D).
 *
 * The step edits the header and footer part of a BlixisLayoutConfig (docs/contracts/layout).
 * The draft keeps a full layout config next to the token config (keys `layout` and
 * `layout_base_revision`). Everything is plain server-rendered form fields: native checkboxes
 * with role="switch", radio groups, selects, and text fields. The controls script only adds
 * live validation, dependent rows, the social link list, and a live preview.
 *
 * Every posted value is validated again here with the layout validator, which stays
 * authoritative. Saving belongs to the review step in wizard.php.
 *
 * @package Blixis\Blocks
 */

declare(strict_types=1);

namespace Blixis\Blocks\Setup;

use function Blixis\Blocks\Layout\can_manage as layout_can_manage;
use function Blixis\Blocks\Layout\defaults as layout_defaults;
use function Blixis\Blocks\Layout\layout_map;
use function Blixis\Blocks\Layout\store_read as layout_store_read;
use function Blixis\Blocks\Layout\validate_bytes as layout_validate_bytes;
use function Blixis\Blocks\Tokens\canonical_json;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const LAYOUT_PREVIEW_ACTION = 'blixis_setup_layout_preview';

add_action( 'admin_post_' . LAYOUT_PREVIEW_ACTION, __NAMESPACE__ . '\\handle_layout_preview' );

/**
 * Add the layout part to a draft: from the stored layout config, or the defaults.
 *
 * @param array $draft Draft with a token config.
 * @return array Draft with `layout` (valid, theme slug set) and `layout_base_revision`.
 */
function with_layout( array $draft ): array {
	$slug   = (string) ( $draft['config']['theme']['slug'] ?? '' );
	$stored = layout_store_read();
	$layout = $draft['layout'] ?? null;
	if ( ! is_array( $layout ) || ! is_int( $draft['layout_base_revision'] ?? null ) || ! layout_validate_bytes( canonical_json( $layout ) )['ok'] ) {
		$layout                        = $stored ? $stored['config'] : layout_defaults( '' !== $slug ? $slug : 'blixis-starter' );
		$draft['layout_base_revision'] = $stored ? $stored['revision'] : 0;
	}
	if ( '' !== $slug ) {
		$layout['theme']['slug'] = $slug;
	}
	$draft['layout'] = $layout;
	return $draft;
}

/**
 * The layout config the draft is compared with: the stored one, or the defaults.
 *
 * @param array $draft Draft.
 * @return array<string, mixed>
 */
function layout_baseline( array $draft ): array {
	$stored = layout_store_read();
	$slug   = (string) ( $draft['layout']['theme']['slug'] ?? 'blixis-starter' );
	return $stored ? $stored['config'] : layout_defaults( $slug );
}

/**
 * Whether the draft's layout differs from what is saved (or from the defaults before a first save).
 *
 * The theme slug is left out: the saved layout is shared by the site, the draft always carries
 * the slug of the theme being edited.
 *
 * @param array $draft Draft.
 */
function layout_differs( array $draft ): bool {
	$a = $draft['layout'];
	$b = layout_baseline( $draft );
	unset( $a['theme'], $b['theme'] );
	return canonical_json( $a ) !== canonical_json( $b );
}

/**
 * Whether saving writes the layout: it differs from what is saved, or it is the first save and
 * the owner has been through the Header and footer step. Without that the site keeps Base's
 * plain header and footer.
 *
 * @param array $draft Draft.
 */
function layout_should_write( array $draft ): bool {
	if ( layout_store_read() ) {
		return layout_differs( $draft ) || ( layout_store_read()['config']['theme']['slug'] ?? '' ) !== ( $draft['layout']['theme']['slug'] ?? '' );
	}
	return layout_differs( $draft ) || in_array( 'header', (array) $draft['done'], true );
}

/**
 * Message for a layout validator error code.
 *
 * @param string $code Error code.
 */
function layout_error_message( string $code ): string {
	$map = layout_map()['limits'];
	return match ( $code ) {
		'field.required', 'text.empty', 'url.empty' => __( 'This field is required.', 'blixis-blocks' ),
		'text.control_char'         => __( 'Remove tabs and other control characters. Only the contact text may have line breaks.', 'blixis-blocks' ),
		'text.markup'               => __( 'Remove the characters < and >. Text is plain text.', 'blixis-blocks' ),
		'text.too_long'             => __( 'This text is too long.', 'blixis-blocks' ),
		'text.placeholder_unknown'  => __( 'The only braces allowed are {year} and {site}, in lower case.', 'blixis-blocks' ),
		'url.invalid'               => __( 'Enter a full link starting with https://, or for the button a path on this site such as /contact. Social links need https://.', 'blixis-blocks' ),
		'header.usp.empty'          => __( 'Add at least one short text, or turn the USP bar off.', 'blixis-blocks' ),
		/* translators: %d: maximum number of USP texts. */
		'header.usp.too_many'       => sprintf( __( 'Use at most %d texts.', 'blixis-blocks' ), (int) $map['uspItems'] ),
		/* translators: %d: maximum number of social links. */
		'footer.social.too_many'    => sprintf( __( 'Use at most %d social links.', 'blixis-blocks' ), (int) $map['socialItems'] ),
		'footer.social.service_invalid' => __( 'Choose one of the services.', 'blixis-blocks' ),
		'footer.columns.invalid'    => __( 'Choose one to four columns.', 'blixis-blocks' ),
		'header.logo.invalid'       => __( 'Choose a logo position.', 'blixis-blocks' ),
		'header.mobile_menu.invalid' => __( 'Choose when the menu button shows.', 'blixis-blocks' ),
		default                     => __( 'This value is not allowed.', 'blixis-blocks' ),
	};
}

/**
 * Layout error messages for the controls script, keyed `layoutErr_<code>`.
 *
 * @return array<string, string>
 */
function layout_error_strings(): array {
	$out = array();
	foreach ( layout_map()['errorCodes'] as $code ) {
		$out[ 'layoutErr_' . $code ] = layout_error_message( (string) $code );
	}
	$out['layoutErr_other'] = layout_error_message( 'other' );
	return $out;
}

/**
 * Name of a layout contract path for the error summary.
 *
 * @param string $path Path such as /header/cta/url.
 */
function layout_field_name( string $path ): string {
	$path = (string) preg_replace( '#/\d+(?=/|$)#', '', $path );
	return match ( $path ) {
		'/header/sticky'          => __( 'Sticky header', 'blixis-blocks' ),
		'/header/usp/enabled'     => __( 'USP bar', 'blixis-blocks' ),
		'/header/usp/items'       => __( 'USP texts', 'blixis-blocks' ),
		'/header/logo'            => __( 'Logo position', 'blixis-blocks' ),
		'/header/cta/enabled'     => __( 'Button', 'blixis-blocks' ),
		'/header/cta/text'        => __( 'Button text', 'blixis-blocks' ),
		'/header/cta/url'         => __( 'Button link', 'blixis-blocks' ),
		'/header/search'          => __( 'Search', 'blixis-blocks' ),
		'/header/mobileMenu'      => __( 'Mobile menu', 'blixis-blocks' ),
		'/footer/stickToBottom'   => __( 'Footer at the bottom', 'blixis-blocks' ),
		'/footer/columns'         => __( 'Footer columns', 'blixis-blocks' ),
		'/footer/contact'         => __( 'Contact text', 'blixis-blocks' ),
		'/footer/social'          => __( 'Social links', 'blixis-blocks' ),
		'/footer/social/service'  => __( 'Social link service', 'blixis-blocks' ),
		'/footer/social/url'      => __( 'Social link', 'blixis-blocks' ),
		'/footer/copyright/text'  => __( 'Copyright text', 'blixis-blocks' ),
		'/footer/copyright/enabled' => __( 'Copyright line', 'blixis-blocks' ),
		'/footer/backToTop'       => __( 'Back to top link', 'blixis-blocks' ),
		default                   => __( 'Header and footer', 'blixis-blocks' ),
	};
}

/**
 * Whether a posted checkbox is on.
 *
 * @param mixed $value Posted value.
 */
function post_on( mixed $value ): bool {
	return is_string( $value ) && '1' === $value;
}

/**
 * Build a layout config from posted form data.
 *
 * Blank USP texts and blank social rows are dropped, the contract's lists have no gaps. The
 * returned maps turn an index in the config back into the posted row, so an error lands on the
 * field the user typed in.
 *
 * @param array                $posted Unslashed `layout` POST data.
 * @param array<string, mixed> $base   The draft's layout config: supplies the layout name and theme slug.
 * @return array{config: array<string, mixed>, usp_map: list<int>, social_map: list<int>, form: array<string, mixed>}
 */
function layout_from_post( array $posted, array $base ): array {
	$header = is_array( $posted['header'] ?? null ) ? $posted['header'] : array();
	$footer = is_array( $posted['footer'] ?? null ) ? $posted['footer'] : array();
	$text   = static fn( mixed $value ): string => is_string( $value ) ? $value : '';
	$cta    = is_array( $header['cta'] ?? null ) ? $header['cta'] : array();
	$usp    = is_array( $header['usp'] ?? null ) ? $header['usp'] : array();
	$copy   = is_array( $footer['copyright'] ?? null ) ? $footer['copyright'] : array();

	$items   = array();
	$usp_map = array();
	foreach ( array_slice( is_array( $usp['items'] ?? null ) ? $usp['items'] : array(), 0, 20, true ) as $index => $item ) {
		if ( '' !== trim( $text( $item ), " \n" ) ) {
			$items[]   = $text( $item );
			$usp_map[] = (int) $index;
		}
	}
	$social     = array();
	$social_map = array();
	foreach ( array_slice( is_array( $footer['social'] ?? null ) ? $footer['social'] : array(), 0, 20, true ) as $index => $row ) {
		$row = is_array( $row ) ? $row : array();
		$url = trim( $text( $row['url'] ?? '' ) );
		if ( '' !== $url ) {
			$social[]     = array(
				'service' => $text( $row['service'] ?? '' ),
				'url'     => $url,
			);
			$social_map[] = (int) $index;
		}
	}
	$columns = $text( $footer['columns'] ?? '' );

	$config = array(
		'schemaVersion' => $base['schemaVersion'],
		'theme'         => $base['theme'],
		'layout'        => $base['layout'],
		'header'        => array(
			'sticky'     => post_on( $header['sticky'] ?? null ),
			'usp'        => array(
				'enabled' => post_on( $usp['enabled'] ?? null ),
				'items'   => $items,
			),
			'logo'       => $text( $header['logo'] ?? '' ),
			'cta'        => array(
				'enabled' => post_on( $cta['enabled'] ?? null ),
				'text'    => $text( $cta['text'] ?? '' ),
				'url'     => trim( $text( $cta['url'] ?? '' ) ),
			),
			'search'     => post_on( $header['search'] ?? null ),
			'mobileMenu' => $text( $header['mobileMenu'] ?? '' ),
		),
		'footer'        => array(
			'stickToBottom' => post_on( $footer['stickToBottom'] ?? null ),
			'columns'       => 1 === preg_match( '/^\d{1,3}$/', $columns ) ? (int) $columns : $columns,
			'contact'       => str_replace( "\r\n", "\n", $text( $footer['contact'] ?? '' ) ),
			'social'        => $social,
			'copyright'     => array(
				'enabled' => post_on( $copy['enabled'] ?? null ),
				'text'    => $text( $copy['text'] ?? '' ),
			),
			'backToTop'     => post_on( $footer['backToTop'] ?? null ),
		),
	);
	return array(
		'config'     => $config,
		'usp_map'    => $usp_map,
		'social_map' => $social_map,
		'form'       => layout_form_values( $config, $posted ),
	);
}

/**
 * Values to show in the form: a config, or the rejected posted rows as they were typed.
 *
 * @param array<string, mixed>      $config Layout config.
 * @param array<string, mixed>|null $posted Rejected posted data, shown again unchanged.
 * @return array<string, mixed>
 */
function layout_form_values( array $config, ?array $posted = null ): array {
	$header = $config['header'];
	$footer = $config['footer'];
	$usp    = array_values( (array) $header['usp']['items'] );
	$social = array_values( (array) $footer['social'] );
	if ( null !== $posted ) {
		$typed  = static fn( mixed $value ): string => is_string( $value ) ? $value : '';
		$usp    = array();
		$social = array();
		foreach ( array_slice( is_array( $posted['header']['usp']['items'] ?? null ) ? $posted['header']['usp']['items'] : array(), 0, 20, true ) as $index => $item ) {
			$usp[ (int) $index ] = $typed( $item );
		}
		foreach ( array_slice( is_array( $posted['footer']['social'] ?? null ) ? $posted['footer']['social'] : array(), 0, 20, true ) as $index => $row ) {
			$social[ (int) $index ] = array(
				'service' => $typed( is_array( $row ) ? ( $row['service'] ?? '' ) : '' ),
				'url'     => $typed( is_array( $row ) ? ( $row['url'] ?? '' ) : '' ),
			);
		}
	}
	return array(
		'header' => $header,
		'footer' => $footer,
		'usp'    => $usp,
		'social' => $social,
	);
}

/**
 * Turn validator errors into errors on the rows the user typed in.
 *
 * @param list<array{code: string, path: string}> $errors     Validator errors.
 * @param list<int>                               $usp_map    Config index to posted USP row.
 * @param list<int>                               $social_map Config index to posted social row.
 * @return list<array{code: string, path: string}>
 */
function remap_layout_errors( array $errors, array $usp_map, array $social_map ): array {
	foreach ( $errors as $key => $error ) {
		$path = $error['path'];
		if ( 1 === preg_match( '#^/header/usp/items/(\d+)$#', $path, $match ) ) {
			$path = '/header/usp/items/' . ( $usp_map[ (int) $match[1] ] ?? (int) $match[1] );
		} elseif ( 1 === preg_match( '#^/footer/social/(\d+)/(service|url)$#', $path, $match ) ) {
			$path = '/footer/social/' . ( $social_map[ (int) $match[1] ] ?? (int) $match[1] ) . '/' . $match[2];
		}
		$errors[ $key ]['path'] = $path;
	}
	return $errors;
}

/**
 * Only the errors the Header and footer step can show.
 *
 * @param list<array{code: string, path: string}> $errors Errors.
 * @return list<array{code: string, path: string}>
 */
function header_step_errors( array $errors ): array {
	return array_values(
		array_filter(
			$errors,
			static fn( array $error ): bool => 1 === preg_match( '#^/(header|footer)(/|$)#', $error['path'] )
		)
	);
}

/**
 * An error line for a field and the attributes that tie it to the field.
 *
 * @param array<string, string> $errors Errors by path.
 * @param string                $path   Contract path of the field.
 * @param string                $hint   Id of a hint element, or ''.
 * @return array{0: string, 1: string} Error markup and attributes for the control.
 */
function layout_error_parts( array $errors, string $path, string $hint = '' ): array {
	$id   = field_id( $path );
	$code = $errors[ $path ] ?? null;
	$ids  = trim( $hint . ( $code ? ' ' . $id . '-error' : '' ) );
	$attr = ( '' !== $ids ? ' aria-describedby="' . esc_attr( $ids ) . '"' : '' ) . ( $code ? ' aria-invalid="true"' : '' );
	$html = $code ? '<p class="blixis-setup-error" id="' . esc_attr( $id ) . '-error">' . esc_html( layout_error_message( $code ) ) . '</p>' : '';
	return array( $html, $attr );
}

/**
 * Arguments for render_row().
 *
 * @param string $classes Extra class names.
 * @param string $help_id Id of the help text.
 * @param string $error   Escaped error markup.
 * @return array<string, string>
 */
function row_args( string $classes = '', string $help_id = '', string $error = '' ): array {
	return array(
		'class'      => $classes,
		'help_id'    => $help_id,
		'error_html' => $error,
	);
}

/**
 * A switch: a native checkbox with role="switch" and its text.
 *
 * @param string $name    Input name.
 * @param string $id      Input id.
 * @param bool   $checked State.
 * @param string $text    What the switch does, as a sentence.
 * @param string $attr    Escaped extra attributes.
 */
function layout_switch( string $name, string $id, bool $checked, string $text, string $attr = '' ): string {
	return '<label class="blixis-switch" for="' . esc_attr( $id ) . '"><input type="checkbox" role="switch" id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '" value="1"' . checked( $checked, true, false ) . $attr . '><span>' . esc_html( $text ) . '</span></label>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped above.
}

/**
 * A segmented control: native radios in a fieldset.
 *
 * @param string                $name    Input name.
 * @param string                $id      Fieldset id.
 * @param string                $legend  Accessible name.
 * @param array<string, string> $options Value => label.
 * @param string                $current Selected value.
 * @param string                $attr    Escaped extra attributes for the fieldset.
 */
function layout_segmented( string $name, string $id, string $legend, array $options, string $current, string $attr = '' ): string {
	$out = '<fieldset class="blixis-seg" id="' . esc_attr( $id ) . '" tabindex="-1"' . $attr . '><legend class="screen-reader-text">' . esc_html( $legend ) . '</legend>';
	foreach ( $options as $value => $label ) {
		$out .= '<label class="blixis-seg__opt"><input type="radio" name="' . esc_attr( $name ) . '" value="' . esc_attr( (string) $value ) . '"' . checked( $current, (string) $value, false ) . '><span>' . esc_html( $label ) . '</span></label>';
	}
	return $out . '</fieldset>';
}

/**
 * A select with plain options.
 *
 * @param string                $name    Input name.
 * @param string                $id      Id.
 * @param array<string, string> $options Value => label.
 * @param string                $current Selected value.
 * @param string                $attr    Escaped extra attributes.
 * @param string                $classes Class names.
 */
function layout_select( string $name, string $id, array $options, string $current, string $attr = '', string $classes = 'blixis-select' ): string {
	$out = '<select class="' . esc_attr( $classes ) . '" id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '"' . $attr . '>';
	foreach ( $options as $value => $label ) {
		$out .= '<option value="' . esc_attr( (string) $value ) . '"' . selected( $current, (string) $value, false ) . '>' . esc_html( $label ) . '</option>';
	}
	return $out . '</select>';
}

/**
 * A single-line text input.
 *
 * @param string $name  Input name.
 * @param string $id    Id.
 * @param string $value Value.
 * @param string $attr  Escaped extra attributes.
 */
function layout_text_input( string $name, string $id, string $value, string $attr = '' ): string {
	return '<input type="text" class="blixis-text" id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '" value="' . esc_attr( $value ) . '" autocomplete="off"' . $attr . '>';
}

/**
 * Service names for the social link select.
 *
 * @return array<string, string>
 */
function social_services(): array {
	return array(
		'facebook'  => 'Facebook',
		'instagram' => 'Instagram',
		'linkedin'  => 'LinkedIn',
		'x'         => 'X',
		'youtube'   => 'YouTube',
		'tiktok'    => 'TikTok',
		'mastodon'  => 'Mastodon',
		'bluesky'   => 'Bluesky',
		'github'    => 'GitHub',
		'other'     => __( 'Other', 'blixis-blocks' ),
	);
}

/**
 * The Header and footer step: a Header card and a Footer card.
 *
 * @param array                 $draft  Draft.
 * @param array<string, string> $errors Errors by path.
 * @param array                 $values Rejected submitted values.
 */
function render_header_step( array $draft, array $errors, array $values ): void {
	$form   = is_array( $values['layout'] ?? null ) ? $values['layout'] : layout_form_values( $draft['layout'] );
	$header = $form['header'];
	$footer = $form['footer'];
	$limits = layout_map()['limits'];

	render_card_start( 'header', __( 'Header', 'blixis-blocks' ), '', 'blixis-section-header', 'blixis-section-header' );
	echo '<p class="blixis-card__intro blixis-setup-hint">' . esc_html__( 'The top of every page. Changes show in the preview and apply to the site when you save on the last step.', 'blixis-blocks' ) . '</p>';

	// Sticky.
	list( $err, $attr ) = layout_error_parts( $errors, '/header/sticky' );
	render_row( esc_html__( 'Sticky header', 'blixis-blocks' ), layout_switch( 'layout[header][sticky]', field_id( '/header/sticky' ), (bool) $header['sticky'], __( 'Keep the header at the top while scrolling', 'blixis-blocks' ), $attr ), __( 'It stays below the admin bar when you are signed in.', 'blixis-blocks' ), '', row_args( '', '', $err ) );

	// USP bar.
	list( $err, $attr ) = layout_error_parts( $errors, '/header/usp/enabled' );
	render_row( esc_html__( 'USP bar', 'blixis-blocks' ), layout_switch( 'layout[header][usp][enabled]', field_id( '/header/usp/enabled' ), (bool) $header['usp']['enabled'], __( 'Show a bar of short selling points above the header', 'blixis-blocks' ), $attr . ' data-blixis-controls="usp"' ), '', '', row_args( '', '', $err ) );
	list( $err ) = layout_error_parts( $errors, '/header/usp/items', 'blixis-header-usp-hint' );
	$control     = '<div class="blixis-usp-fields" id="' . esc_attr( field_id( '/header/usp/items' ) ) . '" tabindex="-1">';
	for ( $i = 0; $i < (int) $limits['uspItems']; $i++ ) {
		$path                         = '/header/usp/items/' . $i;
		list( $item_err, $item_attr ) = layout_error_parts( $errors, $path, 'blixis-header-usp-hint' );
		/* translators: %d: number of the text. */
		$label    = sprintf( __( 'USP text %d', 'blixis-blocks' ), $i + 1 );
		$control .= '<div class="blixis-usp-field"><label class="screen-reader-text" for="' . esc_attr( field_id( $path ) ) . '">' . esc_html( $label ) . '</label>' . $item_err . layout_text_input( 'layout[header][usp][items][' . $i . ']', field_id( $path ), (string) ( $form['usp'][ $i ] ?? '' ), $item_attr . ' maxlength="' . (int) ( $limits['uspItemLength'] * 2 ) . '" data-blixis-limit="' . (int) $limits['uspItemLength'] . '"' ) . '</div>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped by the helpers.
	}
	$control .= '</div>';
	/* translators: 1: maximum number of texts, 2: maximum characters per text. */
	$help = sprintf( __( 'Up to %1$d short texts of %2$d characters, shown with a check mark. Leave a field empty to skip it.', 'blixis-blocks' ), (int) $limits['uspItems'], (int) $limits['uspItemLength'] );
	render_row( esc_html__( 'USP texts', 'blixis-blocks' ), $control, $help, '', row_args( 'blixis-dep', 'blixis-header-usp-hint', $err ) );

	// Logo position.
	list( $err ) = layout_error_parts( $errors, '/header/logo' );
	render_row(
		esc_html__( 'Logo position', 'blixis-blocks' ),
		layout_segmented(
			'layout[header][logo]',
			field_id( '/header/logo' ),
			__( 'Logo position', 'blixis-blocks' ),
			array(
				'start'  => __( 'At the start', 'blixis-blocks' ),
				'center' => __( 'Centred', 'blixis-blocks' ),
			),
			(string) $header['logo']
		),
		__( 'The start is the left in left-to-right languages and the right in right-to-left languages.', 'blixis-blocks' ),
		'',
		row_args( '', '', $err )
	);

	// Button.
	list( $err, $attr ) = layout_error_parts( $errors, '/header/cta/enabled' );
	render_row( esc_html__( 'Button', 'blixis-blocks' ), layout_switch( 'layout[header][cta][enabled]', field_id( '/header/cta/enabled' ), (bool) $header['cta']['enabled'], __( 'Show a call-to-action button in the header', 'blixis-blocks' ), $attr . ' data-blixis-controls="cta"' ), '', '', row_args( '', '', $err ) );
	list( $err, $attr ) = layout_error_parts( $errors, '/header/cta/text' );
	render_row( esc_html__( 'Button text', 'blixis-blocks' ), layout_text_input( 'layout[header][cta][text]', field_id( '/header/cta/text' ), (string) $header['cta']['text'], $attr . ' maxlength="' . (int) ( $limits['ctaTextLength'] * 2 ) . '"' ), '', field_id( '/header/cta/text' ), row_args( 'blixis-dep', '', $err ) );
	list( $err, $attr ) = layout_error_parts( $errors, '/header/cta/url', 'blixis-header-cta-url-hint' );
	render_row( esc_html__( 'Button link', 'blixis-blocks' ), layout_text_input( 'layout[header][cta][url]', field_id( '/header/cta/url' ), (string) $header['cta']['url'], $attr . ' dir="ltr" spellcheck="false" inputmode="url"' ), __( 'A full link such as https://example.com/contact, or a path on this site such as /contact.', 'blixis-blocks' ), field_id( '/header/cta/url' ), row_args( 'blixis-dep', 'blixis-header-cta-url-hint', $err ) );

	// Search.
	list( $err, $attr ) = layout_error_parts( $errors, '/header/search' );
	render_row( esc_html__( 'Search', 'blixis-blocks' ), layout_switch( 'layout[header][search]', field_id( '/header/search' ), (bool) $header['search'], __( 'Show a search field in the header', 'blixis-blocks' ), $attr ), '', '', row_args( '', '', $err ) );

	// Mobile menu.
	list( $err, $attr ) = layout_error_parts( $errors, '/header/mobileMenu' );
	render_row(
		esc_html__( 'Mobile menu', 'blixis-blocks' ),
		layout_select(
			'layout[header][mobileMenu]',
			field_id( '/header/mobileMenu' ),
			array(
				'mobile' => __( 'Menu button on small screens only', 'blixis-blocks' ),
				'always' => __( 'Menu button on every screen', 'blixis-blocks' ),
			),
			(string) $header['mobileMenu'],
			$attr
		),
		'',
		field_id( '/header/mobileMenu' ),
		row_args( '', '', $err )
	);
	render_card_end();

	render_card_start( 'footer', __( 'Footer', 'blixis-blocks' ), '', 'blixis-section-footer', 'blixis-section-footer' );
	echo '<p class="blixis-card__intro blixis-setup-hint">' . esc_html__( 'The bottom of every page.', 'blixis-blocks' ) . '</p>';

	list( $err, $attr ) = layout_error_parts( $errors, '/footer/stickToBottom' );
	render_row( esc_html__( 'Footer at the bottom', 'blixis-blocks' ), layout_switch( 'layout[footer][stickToBottom]', field_id( '/footer/stickToBottom' ), (bool) $footer['stickToBottom'], __( 'Keep the footer at the bottom of the window on short pages', 'blixis-blocks' ), $attr ), __( 'On long pages the footer scrolls as usual. It is never fixed.', 'blixis-blocks' ), '', row_args( '', '', $err ) );

	list( $err ) = layout_error_parts( $errors, '/footer/columns', 'blixis-footer-columns-hint' );
	$columns     = array();
	for ( $i = (int) $limits['columnsMin']; $i <= (int) $limits['columnsMax']; $i++ ) {
		$columns[ (string) $i ] = (string) $i;
	}
	render_row( esc_html__( 'Columns', 'blixis-blocks' ), layout_segmented( 'layout[footer][columns]', field_id( '/footer/columns' ), __( 'Footer columns', 'blixis-blocks' ), $columns, (string) $footer['columns'], ' aria-describedby="blixis-footer-columns-hint"' ), __( 'In this order: site information, menu, contact, social links. Column n shows the first n.', 'blixis-blocks' ), '', row_args( '', 'blixis-footer-columns-hint', $err ) );

	list( $err, $attr ) = layout_error_parts( $errors, '/footer/contact', 'blixis-footer-contact-hint' );
	/* translators: %d: maximum characters. */
	$help = sprintf( __( 'Address, phone number or opening hours, up to %d characters. Line breaks are kept.', 'blixis-blocks' ), (int) $limits['contactLength'] );
	render_row( esc_html__( 'Contact', 'blixis-blocks' ), '<textarea class="blixis-textarea" id="' . esc_attr( field_id( '/footer/contact' ) ) . '" name="layout[footer][contact]" rows="3"' . $attr . '>' . esc_textarea( (string) $footer['contact'] ) . '</textarea>', $help, field_id( '/footer/contact' ), row_args( '', 'blixis-footer-contact-hint', $err ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped above.

	// Social links.
	list( $err ) = layout_error_parts( $errors, '/footer/social', 'blixis-footer-social-hint' );
	$rows        = $form['social'];
	$slots       = (int) $limits['socialItems'];
	// Without the script: the filled rows and two empty ones. The script reveals the rest.
	$shown    = min( $slots, ( $rows ? (int) max( array_keys( $rows ) ) + 1 : 0 ) + 2 );
	$services = social_services();
	$control  = '<div class="blixis-social" id="' . esc_attr( field_id( '/footer/social' ) ) . '" tabindex="-1" data-blixis-social data-max="' . (int) $limits['socialItems'] . '"><ol class="blixis-social__list">';
	for ( $i = 0; $i < $slots; $i++ ) {
		$row     = $rows[ $i ] ?? array(
			'service' => 'facebook',
			'url'     => '',
		);
		$service = (string) $row['service'];
		if ( ! isset( $services[ $service ] ) ) {
			$service = 'other';
		}
		$service_path                       = '/footer/social/' . $i . '/service';
		$url_path                           = '/footer/social/' . $i . '/url';
		list( $service_err, $service_attr ) = layout_error_parts( $errors, $service_path );
		list( $url_err, $url_attr )         = layout_error_parts( $errors, $url_path );
		/* translators: %d: number of the link. */
		$service_label = sprintf( __( 'Service of link %d', 'blixis-blocks' ), $i + 1 );
		/* translators: %d: number of the link. */
		$url_label = sprintf( __( 'Address of link %d', 'blixis-blocks' ), $i + 1 );
		$control  .= '<li class="blixis-social__item"' . ( $i >= $shown ? ' hidden' : '' ) . '>' . $service_err . $url_err . '<label class="screen-reader-text" for="' . esc_attr( field_id( $service_path ) ) . '">' . esc_html( $service_label ) . '</label>' . layout_select( 'layout[footer][social][' . $i . '][service]', field_id( $service_path ), $services, $service, $service_attr, 'blixis-select blixis-social__service' ) . '<label class="screen-reader-text" for="' . esc_attr( field_id( $url_path ) ) . '">' . esc_html( $url_label ) . '</label>' . layout_text_input( 'layout[footer][social][' . $i . '][url]', field_id( $url_path ), (string) $row['url'], $url_attr . ' dir="ltr" spellcheck="false" inputmode="url" placeholder="https://"' ) . '</li>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Escaped by the helpers.
	}
	$control .= '</ol></div>';
	/* translators: %d: maximum number of links. */
	$help = sprintf( __( 'Up to %d links, each starting with https://. Leave the address empty to skip a row.', 'blixis-blocks' ), (int) $limits['socialItems'] );
	render_row( esc_html__( 'Social links', 'blixis-blocks' ), $control, $help, '', row_args( '', 'blixis-footer-social-hint', $err ) );

	// Copyright.
	list( $err, $attr ) = layout_error_parts( $errors, '/footer/copyright/enabled' );
	render_row( esc_html__( 'Copyright line', 'blixis-blocks' ), layout_switch( 'layout[footer][copyright][enabled]', field_id( '/footer/copyright/enabled' ), (bool) $footer['copyright']['enabled'], __( 'Show a copyright line', 'blixis-blocks' ), $attr . ' data-blixis-controls="copyright"' ), '', '', row_args( '', '', $err ) );
	list( $err, $attr ) = layout_error_parts( $errors, '/footer/copyright/text', 'blixis-footer-copyright-hint' );
	render_row( esc_html__( 'Copyright text', 'blixis-blocks' ), layout_text_input( 'layout[footer][copyright][text]', field_id( '/footer/copyright/text' ), (string) $footer['copyright']['text'], $attr . ' maxlength="' . (int) ( $limits['copyrightLength'] * 2 ) . '"' ), __( '{year} becomes the current year and {site} the site title.', 'blixis-blocks' ), field_id( '/footer/copyright/text' ), row_args( 'blixis-dep', 'blixis-footer-copyright-hint', $err ) );

	list( $err, $attr ) = layout_error_parts( $errors, '/footer/backToTop' );
	render_row( esc_html__( 'Back to top', 'blixis-blocks' ), layout_switch( 'layout[footer][backToTop]', field_id( '/footer/backToTop' ), (bool) $footer['backToTop'], __( 'Show a link that returns to the top of the page', 'blixis-blocks' ), $attr ), '', '', row_args( '', '', $err ) );
	render_card_end();
}

/**
 * What the review step lists for the layout.
 *
 * @param array<string, mixed> $layout Layout config.
 * @return array<string, list<string>> Heading => lines.
 */
function layout_summary( array $layout ): array {
	$yes    = __( 'on', 'blixis-blocks' );
	$no     = __( 'off', 'blixis-blocks' );
	$onoff  = static fn( bool $value ): string => $value ? $yes : $no;
	$header = $layout['header'];
	$footer = $layout['footer'];
	$names  = layout_names();
	$lines  = array(
		/* translators: %s: layout name. */
		'layout' => array( sprintf( __( 'Layout: %s', 'blixis-blocks' ), $names[ $layout['layout'] ] ?? (string) $layout['layout'] ) ),
		'header' => array(),
		'footer' => array(),
	);
	/* translators: %s: on or off. */
	$lines['header'][] = sprintf( __( 'Sticky header: %s', 'blixis-blocks' ), $onoff( $header['sticky'] ) );
	if ( $header['usp']['enabled'] ) {
		/* translators: %s: the texts, separated by semicolons. */
		$lines['header'][] = sprintf( __( 'USP bar: %s', 'blixis-blocks' ), implode( '; ', $header['usp']['items'] ) );
	} else {
		/* translators: %s: on or off. */
		$lines['header'][] = sprintf( __( 'USP bar: %s', 'blixis-blocks' ), $no );
	}
	/* translators: %s: Start or centred. */
	$lines['header'][] = sprintf( __( 'Logo: %s', 'blixis-blocks' ), 'center' === $header['logo'] ? __( 'centred', 'blixis-blocks' ) : __( 'at the start', 'blixis-blocks' ) );
	if ( $header['cta']['enabled'] ) {
		/* translators: 1: button text, 2: link. */
		$lines['header'][] = sprintf( __( 'Button: %1$s (%2$s)', 'blixis-blocks' ), $header['cta']['text'], $header['cta']['url'] );
	} else {
		/* translators: %s: on or off. */
		$lines['header'][] = sprintf( __( 'Button: %s', 'blixis-blocks' ), $no );
	}
	/* translators: %s: on or off. */
	$lines['header'][] = sprintf( __( 'Search: %s', 'blixis-blocks' ), $onoff( $header['search'] ) );
	/* translators: %s: when the menu button shows. */
	$lines['header'][] = sprintf( __( 'Menu button: %s', 'blixis-blocks' ), 'always' === $header['mobileMenu'] ? __( 'on every screen', 'blixis-blocks' ) : __( 'on small screens only', 'blixis-blocks' ) );

	/* translators: %s: on or off. */
	$lines['footer'][] = sprintf( __( 'Footer at the bottom of short pages: %s', 'blixis-blocks' ), $onoff( $footer['stickToBottom'] ) );
	/* translators: %d: number of columns. */
	$lines['footer'][] = sprintf( __( 'Columns: %d', 'blixis-blocks' ), (int) $footer['columns'] );
	$lines['footer'][] = '' !== $footer['contact'] ? sprintf(
		/* translators: %s: contact text on one line. */
		__( 'Contact: %s', 'blixis-blocks' ),
		str_replace( "\n", ' / ', $footer['contact'] )
	) : __( 'Contact: empty', 'blixis-blocks' );
	$services = social_services();
	$social   = array();
	foreach ( $footer['social'] as $link ) {
		$social[] = ( $services[ $link['service'] ] ?? $link['service'] ) . ' ' . $link['url'];
	}
	/* translators: %s: list of links, or "none". */
	$lines['footer'][] = sprintf( __( 'Social links: %s', 'blixis-blocks' ), $social ? implode( '; ', $social ) : __( 'none', 'blixis-blocks' ) );
	if ( $footer['copyright']['enabled'] ) {
		/* translators: %s: copyright text. */
		$lines['footer'][] = sprintf( __( 'Copyright: %s', 'blixis-blocks' ), $footer['copyright']['text'] );
	} else {
		/* translators: %s: on or off. */
		$lines['footer'][] = sprintf( __( 'Copyright: %s', 'blixis-blocks' ), $no );
	}
	/* translators: %s: on or off. */
	$lines['footer'][] = sprintf( __( 'Back to top link: %s', 'blixis-blocks' ), $onoff( $footer['backToTop'] ) );
	return $lines;
}

/**
 * Names of the layouts.
 *
 * @return array<string, string>
 */
function layout_names(): array {
	return array(
		'blank'     => __( 'Blank', 'blixis-blocks' ),
		'business'  => __( 'Business', 'blixis-blocks' ),
		'portfolio' => __( 'Portfolio', 'blixis-blocks' ),
		'blog'      => __( 'Blog', 'blixis-blocks' ),
		'landing'   => __( 'Landing page', 'blixis-blocks' ),
	);
}

/**
 * The review step's list of layout settings.
 *
 * @param array $draft Draft.
 */
function render_review_layout( array $draft ): void {
	$stored = layout_store_read();
	echo '<h3>' . esc_html__( 'Header and footer', 'blixis-blocks' ) . '</h3><p>';
	if ( $stored ) {
		/* translators: %d: revision number. */
		echo esc_html( sprintf( __( 'Saved header and footer revision: %d.', 'blixis-blocks' ), $stored['revision'] ) ) . ' ';
	} else {
		echo esc_html__( 'No header and footer settings are saved yet. The site keeps its plain header and footer until you save them.', 'blixis-blocks' ) . ' ';
	}
	if ( layout_should_write( $draft ) ) {
		echo esc_html__( 'These settings are saved together with the design tokens.', 'blixis-blocks' );
	} else {
		echo esc_html__( 'There is nothing new to save for the header and footer.', 'blixis-blocks' );
	}
	echo '</p><dl class="blixis-setup-review blixis-setup-review--layout">';
	$headings = array(
		'layout' => __( 'Layout', 'blixis-blocks' ),
		'header' => __( 'Header', 'blixis-blocks' ),
		'footer' => __( 'Footer', 'blixis-blocks' ),
	);
	foreach ( layout_summary( $draft['layout'] ) as $key => $lines ) {
		echo '<dt>' . esc_html( $headings[ $key ] ) . '</dt><dd><ul>';
		foreach ( $lines as $line ) {
			echo '<li>' . esc_html( $line ) . '</li>';
		}
		echo '</ul></dd>';
	}
	echo '</dl>';
}

/**
 * Handle the Header and footer step.
 *
 * @param int    $user  User ID.
 * @param array  $draft Draft.
 * @param string $next  Next step.
 */
function handle_header_step( int $user, array $draft, string $next ): void {
	if ( ! layout_can_manage() ) {
		wp_die( esc_html__( 'Sorry, you are not allowed to change the header and footer.', 'blixis-blocks' ), '', array( 'response' => 403 ) );
	}
	// phpcs:ignore WordPress.Security.NonceVerification.Missing, WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Nonce checked by the caller; validated by the layout validator below.
	$posted = isset( $_POST['layout'] ) && is_array( $_POST['layout'] ) ? wp_unslash( $_POST['layout'] ) : array();
	$built  = layout_from_post( $posted, $draft['layout'] );
	$result = layout_validate_bytes( canonical_json( $built['config'] ) );
	if ( ! $result['ok'] ) {
		$errors = header_step_errors( remap_layout_errors( $result['errors'], $built['usp_map'], $built['social_map'] ) );
		if ( ! $errors ) {
			$errors[] = array(
				'code' => 'other',
				'path' => '/header',
			);
		}
		flash(
			$user,
			'header',
			array(
				'errors' => $errors,
				'values' => array( 'layout' => $built['form'] ),
			)
		);
		wp_safe_redirect( step_url( 'header' ) );
		exit;
	}
	$draft['layout'] = $result['config'];
	$draft['done']   = array_values( array_unique( array_merge( $draft['done'], array( 'header' ) ) ) );
	save_draft( $user, $draft );
	wp_safe_redirect( step_url( $next ) );
	exit;
}

/**
 * Endpoint for the live preview: store the posted layout in the user's draft when it is valid.
 *
 * POST to admin-post.php with action, a nonce, and the same `layout[...]` fields as the step.
 * Answers JSON. Needs edit_theme_options and the nonce. The server validates; an invalid
 * layout is refused with its errors and nothing is stored. The draft is private to the user;
 * the preview iframe reads it only for the same user with a valid preview nonce.
 */
function handle_layout_preview(): void {
	if ( ! layout_can_manage() ) {
		wp_send_json( array( 'ok' => false ), 403 );
	}
	// phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized, WordPress.Security.ValidatedSanitizedInput.MissingUnslash -- Nonce value only compared.
	$nonce = isset( $_POST['_wpnonce'] ) && is_string( $_POST['_wpnonce'] ) ? wp_unslash( $_POST['_wpnonce'] ) : '';
	if ( ! wp_verify_nonce( $nonce, LAYOUT_PREVIEW_ACTION ) ) {
		wp_send_json( array( 'ok' => false ), 403 );
	}
	$user  = get_current_user_id();
	$draft = draft( $user );
	if ( '' === ( $draft['config']['theme']['slug'] ?? '' ) ) {
		wp_send_json( array( 'ok' => false ), 409 );
	}
	// phpcs:ignore WordPress.Security.NonceVerification.Missing, WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Verified above; validated by the layout validator.
	$posted = isset( $_POST['layout'] ) && is_array( $_POST['layout'] ) ? wp_unslash( $_POST['layout'] ) : array();
	$built  = layout_from_post( $posted, $draft['layout'] );
	$result = layout_validate_bytes( canonical_json( $built['config'] ) );
	if ( ! $result['ok'] ) {
		wp_send_json(
			array(
				'ok'     => false,
				'errors' => header_step_errors( remap_layout_errors( $result['errors'], $built['usp_map'], $built['social_map'] ) ),
			),
			422
		);
	}
	$draft['layout'] = $result['config'];
	save_draft( $user, $draft );
	wp_send_json( array( 'ok' => true ) );
}
