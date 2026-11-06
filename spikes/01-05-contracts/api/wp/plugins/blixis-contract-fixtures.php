<?php
/**
 * Plugin Name: Blixis 01-05 test fixtures
 * Description: Throwaway probes and deliberately naive routes used to measure hazards. Never product code.
 * Version: 0.0.0
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

// The harness has no TLS, and core offers application passwords only on HTTPS or in a local environment.
add_filter('wp_is_application_passwords_available', '__return_true');

add_action('init', static function (): void {
    register_post_type('blixis_secret', ['public' => false, 'show_in_rest' => false, 'label' => 'Secret']);
    // Positive control for the exposure sweep. Never carries a document.
    register_post_meta('page', 'blixis_control_meta', ['type' => 'string', 'single' => true, 'show_in_rest' => true]);
    add_shortcode('blixis_whoami', static fn (): string => 'VIEWER-' . get_current_user_id());
});

// A hostile or careless plugin that widens every query.
add_action('pre_get_posts', static function (WP_Query $query): void {
    if (get_option('blixis_fixture_widen_queries') === '1') {
        $query->set('post_status', 'any');
    }
});

add_action('blixis_api_fault_probe', static function (): void {
    global $wpdb;
    $fault = get_option('blixis_fixture_fault');
    if (!$fault) {
        return;
    }
    // Simulate a misconfigured production site that displays errors.
    ini_set('display_errors', '1');
    $wpdb->show_errors(true);
    if ($fault === 'exception') {
        throw new RuntimeException('SELECT secret FROM wp_users failed in ' . __FILE__);
    }
    if ($fault === 'type_error') {
        strlen([]);
    }
    if ($fault === 'sql') {
        $wpdb->query('SELECT * FROM blixis_no_such_table');
    }
    if ($fault === 'warning') {
        echo $undefined_for_fault_test;
    }
});

add_action('rest_api_init', static function (): void {
    $open = '__return_true';
    register_rest_route('blixis-fixture/v1', '/whoami', [
        'methods' => 'GET',
        'permission_callback' => $open,
        'callback' => static fn (): array => [
            'user' => get_current_user_id(),
            'can_edit_pages' => current_user_can('edit_pages'),
            'is_ssl' => is_ssl(),
            'client' => $_SERVER['REMOTE_ADDR'] ?? '',
        ],
    ]);
    // Deliberately naive: what a first implementation of the content list would look like.
    register_rest_route('blixis-fixture/v1', '/naive-list', [
        'methods' => 'GET',
        'permission_callback' => $open,
        'callback' => static function (): array {
            $query = new WP_Query(['post_type' => 'page', 'posts_per_page' => 100]);
            return array_map(static fn (WP_Post $p): string => $p->post_title . '|' . $p->post_status, $query->posts);
        },
    ]);
    // Deliberately naive: a route that marks itself public and leaves core's nocache and nonce handling in place.
    register_rest_route('blixis-fixture/v1', '/naive-public', [
        'methods' => 'GET',
        'permission_callback' => $open,
        'callback' => static fn () => new WP_REST_Response(['ok' => true], 200, ['Cache-Control' => 'public, max-age=60']),
    ]);
    register_rest_route('blixis-fixture/v1', '/rl-transient', [
        'methods' => 'GET',
        'permission_callback' => $open,
        'callback' => static function () {
            $hits = (int) get_transient('blixis_fixture_rl');
            if ($hits >= 10) {
                return new WP_REST_Response(['limited' => true], 429);
            }
            set_transient('blixis_fixture_rl', $hits + 1, 300);
            return ['hits' => $hits + 1];
        },
    ]);
    register_rest_route('blixis-fixture/v1', '/rl-atomic', [
        'methods' => 'GET',
        'permission_callback' => $open,
        'callback' => static fn () => blixis_api_rate_limit_hit('fixture-atomic', 10, 300)
            ? new WP_REST_Response(['limited' => true], 429)
            : ['limited' => false],
    ]);
    register_rest_route('blixis-fixture/v1', '/rl-object-cache', [
        'methods' => 'GET',
        'permission_callback' => $open,
        'callback' => static function (): array {
            wp_cache_add('hits', 0, 'blixis_fixture');
            return ['hits' => wp_cache_incr('hits', 1, 'blixis_fixture'), 'external' => (bool) wp_using_ext_object_cache()];
        },
    ]);
});
