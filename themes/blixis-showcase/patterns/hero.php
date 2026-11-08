<?php
/**
 * Title: Blixis Showcase hero
 * Slug: blixis-showcase/hero
 * Categories: featured
 * Description: Optional showcase introduction and an illustrative editor concept.
 *
 * @package Blixis_Showcase
 */
?>
<!-- wp:group {"tagName":"section","anchor":"top","align":"wide","className":"blixis-showcase-hero","layout":{"type":"constrained"}} -->
<section id="top" class="wp-block-group alignwide blixis-showcase-hero">
<!-- wp:group {"className":"blixis-showcase-copy","layout":{"type":"default"}} -->
<div class="wp-block-group blixis-showcase-copy">
<!-- wp:paragraph {"className":"showcase-eyebrow"} -->
<p class="showcase-eyebrow"><?php esc_html_e( 'Blixis Base Theme', 'blixis-showcase' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":1} -->
<h1 class="wp-block-heading"><?php esc_html_e( 'A strong foundation for every website.', 'blixis-showcase' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph {"className":"showcase-hero-description"} -->
<p class="showcase-hero-description"><?php esc_html_e( 'A lightweight WordPress foundation, ready to be shaped with design tokens and Blixis Blocks as those planned tools are built.', 'blixis-showcase' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons {"className":"showcase-hero-actions"} -->
<div class="wp-block-buttons showcase-hero-actions">
<!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="#showcase-status"><?php esc_html_e( 'Explore the possibilities', 'blixis-showcase' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"is-style-outline"} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="#showcase-features"><?php esc_html_e( 'View the foundation', 'blixis-showcase' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:html -->
<div class="showcase-art" role="img" aria-label="<?php esc_attr_e( 'Illustration of a planned visual editor interface; this editor is not implemented.', 'blixis-showcase' ); ?>">
    <div class="showcase-art-halo"></div>
    <div class="showcase-art-window" aria-hidden="true">
    <div class="showcase-art-toolbar"><i></i><i></i><i></i></div>
    <div class="showcase-art-app">
        <div class="showcase-art-rail"><b>W</b><i></i><i></i><i></i></div>
        <div class="showcase-art-canvas"><span class="showcase-art-line"></span><div class="showcase-art-gradient"></div><span class="showcase-art-line short"></span><span class="showcase-art-line"></span><div class="showcase-art-tiles"><i></i><i></i><i></i></div></div>
    </div>
    </div>
    <div class="showcase-art-palette" aria-hidden="true"><i></i><i></i><i></i><i></i><span></span><span></span><span></span><span></span></div>
    <div class="showcase-art-layers" aria-hidden="true"><span></span><span></span><span></span></div>
    <div class="showcase-art-grid" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
</div>
<!-- /wp:html -->
</section>
<!-- /wp:group -->
