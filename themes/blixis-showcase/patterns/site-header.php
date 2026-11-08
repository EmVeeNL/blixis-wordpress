<?php
/**
 * Title: Blixis Showcase header
 * Slug: blixis-showcase/site-header
 * Categories: featured
 *
 * @package Blixis_Showcase
 */
$home = home_url( '/' );
?>
<!-- wp:html -->
<div class="showcase-header-inner">
    <a class="showcase-wordmark" href="<?php echo esc_url( $home ); ?>" aria-label="<?php esc_attr_e( 'Blixis home', 'blixis-showcase' ); ?>">BLIXIS</a>
    <nav class="showcase-header-nav" aria-label="<?php esc_attr_e( 'Showcase sections', 'blixis-showcase' ); ?>">
    <ul>
        <li><a href="<?php echo esc_url( $home ); ?>"><?php esc_html_e( 'Home', 'blixis-showcase' ); ?></a></li>
        <li><a href="<?php echo esc_url( $home . '#showcase-features' ); ?>"><?php esc_html_e( 'Features', 'blixis-showcase' ); ?></a></li>
        <li><a href="<?php echo esc_url( $home . '#showcase-status' ); ?>"><?php esc_html_e( 'Project status', 'blixis-showcase' ); ?></a></li>
    </ul>
    </nav>
</div>
<!-- /wp:html -->
