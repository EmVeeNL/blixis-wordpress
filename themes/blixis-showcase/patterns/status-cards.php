<?php
/**
 * Title: Blixis Showcase status cards
 * Slug: blixis-showcase/status-cards
 * Categories: featured
 * Description: Cards stating what is implemented and what is planned.
 *
 * @package Blixis_Showcase
 */
?>
<!-- wp:group {"tagName":"section","anchor":"showcase-status","align":"wide","className":"blixis-showcase-status","layout":{"type":"constrained"}} -->
<section id="showcase-status" class="wp-block-group alignwide blixis-showcase-status">
<!-- wp:heading {"level":2} -->
<h2 class="wp-block-heading"><?php esc_html_e( 'Project status', 'blixis-showcase' ); ?></h2>
<!-- /wp:heading -->
<!-- wp:group {"className":"blixis-showcase-grid","layout":{"type":"grid","minimumColumnWidth":"16rem"}} -->
<div class="wp-block-group blixis-showcase-grid">
<!-- wp:group {"className":"blixis-showcase-card","layout":{"type":"constrained"}} -->
<div class="wp-block-group blixis-showcase-card">
<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading"><?php esc_html_e( 'Blixis Base', 'blixis-showcase' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p><strong><?php esc_html_e( 'Implemented.', 'blixis-showcase' ); ?></strong> <?php esc_html_e( 'The neutral parent theme with semantic templates and a Tailwind CSS pipeline.', 'blixis-showcase' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"blixis-showcase-card","layout":{"type":"constrained"}} -->
<div class="wp-block-group blixis-showcase-card">
<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading"><?php esc_html_e( 'Design tokens', 'blixis-showcase' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p><strong><?php esc_html_e( 'Planned.', 'blixis-showcase' ); ?></strong> <?php esc_html_e( 'Token setup for colour, typography, and spacing is not complete; the settings screens are not available yet.', 'blixis-showcase' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
<!-- wp:group {"className":"blixis-showcase-card","layout":{"type":"constrained"}} -->
<div class="wp-block-group blixis-showcase-card">
<!-- wp:heading {"level":3} -->
<h3 class="wp-block-heading"><?php esc_html_e( 'Blixis Blocks', 'blixis-showcase' ); ?></h3>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p><strong><?php esc_html_e( 'Planned.', 'blixis-showcase' ); ?></strong> <?php esc_html_e( 'The Blocks editor does not exist yet. This page uses core WordPress blocks only.', 'blixis-showcase' ); ?></p>
<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
</div>
<!-- /wp:group -->
</section>
<!-- /wp:group -->
