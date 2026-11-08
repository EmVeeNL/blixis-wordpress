<?php
/**
 * Title: Blixis Showcase hero
 * Slug: blixis-showcase/hero
 * Categories: featured
 * Description: Optional showcase hero with a labelled concept note. Not starter content.
 *
 * @package Blixis_Showcase
 */
?>
<!-- wp:group {"tagName":"section","align":"wide","className":"blixis-showcase-hero","layout":{"type":"constrained"}} -->
<section class="wp-block-group alignwide blixis-showcase-hero">
<!-- wp:group {"className":"blixis-showcase-copy","layout":{"type":"default"}} -->
<div class="wp-block-group blixis-showcase-copy">
<!-- wp:heading {"level":1} -->
<h1 class="wp-block-heading"><?php esc_html_e( 'A strong foundation for every website.', 'blixis-showcase' ); ?></h1>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p><?php esc_html_e( 'Blixis Base is a lightweight, neutral WordPress theme. This optional showcase child theme demonstrates it; Blixis Blocks and the token setup are planned and not available yet.', 'blixis-showcase' ); ?></p>
<!-- /wp:paragraph -->
<!-- wp:buttons -->
<div class="wp-block-buttons">
<!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="#<?php echo esc_attr( 'showcase-status' ); ?>"><?php esc_html_e( 'See what is implemented', 'blixis-showcase' ); ?></a></div>
<!-- /wp:button -->
<!-- wp:button {"className":"is-style-outline"} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="#<?php echo esc_attr( 'showcase-features' ); ?>"><?php esc_html_e( 'View the principles', 'blixis-showcase' ); ?></a></div>
<!-- /wp:button -->
</div>
<!-- /wp:buttons -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"blixis-showcase-concept","layout":{"type":"constrained"}} -->
<div class="wp-block-group blixis-showcase-concept">
<!-- wp:paragraph {"className":"blixis-showcase-concept-label"} -->
<p class="blixis-showcase-concept-label"><strong><?php esc_html_e( 'Concept', 'blixis-showcase' ); ?></strong> <?php esc_html_e( 'This page layout is inspired by a design concept preview. The editor and colour tools it sketches are not a working product.', 'blixis-showcase' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
