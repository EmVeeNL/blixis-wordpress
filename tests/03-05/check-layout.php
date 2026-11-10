<?php
// Task 03-07 Part A, in process: the stored layout configuration (option blixis_layout_config) on
// a real WordPress. Compare-and-swap on the stored bytes, hash check on read, fallback to the
// previous config, rollback as a new revision, capability helper, and that nothing public reads
// the row. Runs after check-v2.php. It removes its option when it is done, so the browser stage
// sees the same state as before.

use function Blixis\Blocks\Layout\can_manage;
use function Blixis\Blocks\Layout\defaults;
use function Blixis\Blocks\Layout\migrate_config;
use function Blixis\Blocks\Layout\previous_config;
use function Blixis\Blocks\Layout\store_raw;
use function Blixis\Blocks\Layout\store_read;
use function Blixis\Blocks\Layout\store_rollback;
use function Blixis\Blocks\Layout\store_write;
use function Blixis\Blocks\Layout\validate_bytes;
use function Blixis\Blocks\Tokens\canonical_json;
use function Blixis\Blocks\Tokens\config_hash;

$label = '[' . get_bloginfo('version') . ' php' . PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION . ' layout] ';
$count = 0;
$check = static function (string $name, bool $ok, string $detail = '') use ($label, &$count): void {
    ++$count;
    echo ($ok ? 'PASS ' : 'FAIL ') . $label . $name . (!$ok && $detail !== '' ? ' -- ' . substr($detail, 0, 300) : '') . "\n";
};
global $wpdb;
$option = 'blixis_layout_config';
$put = static function (string $raw) use ($wpdb, $option): void {
    $wpdb->update($wpdb->options, ['option_value' => $raw], ['option_name' => $option]);
    wp_cache_delete($option, 'options');
    wp_cache_delete('alloptions', 'options');
};
$code = static fn($result): string => is_wp_error($result) ? $result->get_error_code() : '';
$same = static fn($a, $b): bool => canonical_json($a) === canonical_json($b);
$norm = static fn(array $config): array => validate_bytes(canonical_json($config))['config'];
$status = static fn($result): int => is_wp_error($result) ? (int) ($result->get_error_data()['status'] ?? 0) : 0;
wp_set_current_user((int) get_user_by('login', 'fixture_admin')->ID);
delete_option($option);

$first = defaults('acme-site');
$sticky = $first;
$sticky['header']['sticky'] = true;
$sticky['header']['usp'] = ['enabled' => true, 'items' => ['Free delivery', 'Fish & chips']];
$wide = $sticky;
$wide['layout'] = 'business';
$wide['footer']['columns'] = 3;
$wide['footer']['contact'] = "Line one\nLine two";

// ---- Nothing stored.
$check('nothing is stored at first', null === store_raw() && null === store_read() && null === previous_config());
$check('rolling back with nothing stored is refused with 409', 'blixis_layout_no_previous' === $code(store_rollback(0)) && 409 === $status(store_rollback(0)));

// ---- First write.
$events = [];
add_action('blixis_layout_saved', static function (int $revision, string $hash) use (&$events): void {
    $events[] = [$revision, $hash];
}, 10, 2);
$r1 = store_write(canonical_json($first), 0);
$check('the first write is revision 1', !is_wp_error($r1) && 1 === $r1['revision'], json_encode($r1));
$stored = store_read();
$check('the stored record reads back with the same config and hash', null !== $stored && $same($stored['config'], $norm($first)) && $stored['hash'] === config_hash($stored['config']) && $stored['hash'] === $r1['hash'] && 1 === $stored['revision'] && null === $stored['previous']);
$check('the save is announced once with revision and hash', [[1, $r1['hash']]] === $events, json_encode($events));
$autoload = $wpdb->get_var($wpdb->prepare("SELECT autoload FROM {$wpdb->options} WHERE option_name = %s", $option));
$check('the option is autoloaded', in_array($autoload, ['yes', 'on', 'auto-on', 'auto'], true), (string) $autoload);
$row = json_decode((string) store_raw(), true);
$check('the row holds revision, hash, config, previous and nothing else', ['config', 'hash', 'previous', 'revision'] === array_keys($row), json_encode(array_keys($row)));

// ---- Validation on write.
$bad = $first;
$bad['header']['cta'] = ['enabled' => true, 'text' => 'Go', 'url' => 'javascript:alert(1)'];
$before = store_raw();
$refused = store_write(canonical_json($bad), 1);
$check('an invalid config is refused with 400 and the validator errors', 'blixis_layout_invalid' === $code($refused) && 400 === $status($refused) && [['code' => 'url.invalid', 'path' => '/header/cta/url']] === $refused->get_error_data()['errors'], json_encode($refused));
$check('a refused write leaves the row untouched and announces nothing', store_raw() === $before && 1 === count($events));
$check('garbage bytes are refused', 'blixis_layout_invalid' === $code(store_write('{"not":"a config"', 1)) && 'blixis_layout_invalid' === $code(store_write('', 1)));
$check('a token config is not a layout config', 'blixis_layout_invalid' === $code(store_write(canonical_json(['schemaVersion' => 2, 'theme' => ['slug' => 'acme-site', 'parent' => 'blixis-base']]), 1)));

// ---- Second write keeps the first as previous.
$r2 = store_write(canonical_json($sticky), 1);
$check('the second write is revision 2 and keeps revision 1 as previous', !is_wp_error($r2) && 2 === $r2['revision'] && $same(store_read()['previous'], $norm($first)), json_encode($r2));
$check('the stored config is the normalized one', store_read()['config']['header']['usp']['items'] === ['Free delivery', 'Fish & chips']);
$padded = $sticky;
$padded['header']['usp']['items'] = ['  Padded  '];
$r3 = store_write(canonical_json($padded), 2);
$check('text is stored trimmed', !is_wp_error($r3) && ['Padded'] === store_read()['config']['header']['usp']['items']);
$r3b = store_write(canonical_json($sticky), 3);
$check('revisions count up', !is_wp_error($r3b) && 4 === $r3b['revision']);

// ---- Compare-and-swap.
$stale = store_write(canonical_json($wide), 1);
$check('a write from a stale revision is a conflict (409) and changes nothing', 'blixis_layout_conflict' === $code($stale) && 409 === $status($stale) && 4 === store_read()['revision'] && $same(store_read()['config'], $norm($sticky)));
$ahead = store_write(canonical_json($wide), 9);
$check('a write from a future revision is a conflict too', 'blixis_layout_conflict' === $code($ahead));
$zero = store_write(canonical_json($wide), 0);
$check('revision 0 with a stored row is a conflict', 'blixis_layout_conflict' === $code($zero));

// A second writer lands between this writer's read and its UPDATE: the UPDATE must match no row.
$interloper = canonical_json(['revision' => 4, 'hash' => 'interloper', 'config' => ['x' => 1], 'previous' => null]);
$racing = static function (string $query) use ($wpdb, $option, $interloper): string {
    static $done = false;
    if (!$done && str_starts_with($query, "UPDATE {$wpdb->options} SET option_value") && str_contains($query, $option)) {
        $done = true;
        mysqli_query($wpdb->dbh, "UPDATE {$wpdb->options} SET option_value = '" . mysqli_real_escape_string($wpdb->dbh, $interloper) . "' WHERE option_name = '$option'");
    }
    return $query;
};
add_filter('query', $racing);
$lost = store_write(canonical_json($wide), 4);
remove_filter('query', $racing);
$check('a writer that loses the race is a conflict and the other writer survives', 'blixis_layout_conflict' === $code($lost) && store_raw() === $interloper, (string) store_raw());
$check('a lost race announces nothing', 4 === count($events), json_encode($events));

// A row that holds a foreign config is not a layout config.
$same_revision = canonical_json(['revision' => 4, 'hash' => 'other', 'config' => ['y' => 2], 'previous' => null]);
$put($same_revision);
$check('a row whose config is not a layout config reads as nothing', null === store_read());

// ---- A row whose config no longer validates, or whose hash does not match.
$put(canonical_json(['revision' => 7, 'hash' => $r3b['hash'], 'config' => $norm($sticky), 'previous' => $norm($first)]));
$good = store_read();
$check('a row written by hand with the right hash reads', null !== $good && 7 === $good['revision'] && $good['hash'] === $r3b['hash']);

$tampered = $norm($sticky);
$tampered['header']['sticky'] = false;
$put(canonical_json(['revision' => 7, 'hash' => $r3b['hash'], 'config' => $tampered, 'previous' => $norm($first)]));
$check('a config that does not match its stored hash is not returned', null === store_read());
$check('the previous config is still available when the current one is bad', $same(previous_config(), $norm($first)));

$invalid_config = $norm($sticky);
$invalid_config['layout'] = 'shop';
$put(canonical_json(['revision' => 7, 'hash' => config_hash($invalid_config), 'config' => $invalid_config, 'previous' => $norm($first)]));
$check('a stored config that no longer validates is not returned', null === store_read());
$check('rolling back from a bad row is refused, and a new write replaces it', 'blixis_layout_no_previous' === $code(store_rollback(7)));
$healed = store_write(canonical_json($wide), 7);
$check('a valid write over a bad row works and becomes revision 8', !is_wp_error($healed) && 8 === $healed['revision'] && null !== store_read(), json_encode($healed));
$check('the bad config is kept as the previous value, untouched', $same(store_read()['previous'], $invalid_config));

$put('this is not json');
$check('a row that is not JSON reads as nothing', null === store_read() && null === previous_config());
$put(canonical_json(['revision' => '3', 'hash' => 'x', 'config' => []]));
$check('a row with a non-integer revision reads as nothing', null === store_read());
$put(canonical_json(['revision' => 3, 'hash' => 'x', 'config' => ['schemaVersion' => 2] + $norm($first)]));
$check('a stored version this code does not know is not returned', null === store_read());

// ---- Rollback.
delete_option($option);
store_write(canonical_json($first), 0);
store_write(canonical_json($sticky), 1);
store_write(canonical_json($wide), 2);
$events = [];
$stale_rollback = store_rollback(2);
$check('rollback from a stale revision is a conflict', 'blixis_layout_conflict' === $code($stale_rollback) && 3 === store_read()['revision']);
$back = store_rollback(3);
$now = store_read();
$check('rollback writes the previous config as a new revision', !is_wp_error($back) && 4 === $back['revision'] && $same($now['config'], $norm($sticky)) && 4 === $now['revision'], json_encode($back));
$check('after rollback the replaced config is the previous one, so rollback can be undone', $same($now['previous'], $norm($wide)));
$check('rollback is announced like a save', 1 === count($events) && 4 === $events[0][0]);
$undo = store_rollback(4);
$check('rollback can be undone', !is_wp_error($undo) && 5 === $undo['revision'] && $same(store_read()['config'], $norm($wide)));

// A previous config from an older contract version is read by the same validator (none exists yet:
// version 1 is the only one), and an unreadable previous is not applied.
$put(canonical_json(['revision' => 5, 'hash' => store_read()['hash'], 'config' => store_read()['config'], 'previous' => ['not' => 'a config']]));
$check('an unreadable previous config cannot be rolled back to', 'blixis_layout_invalid' === $code(store_rollback(5)) && 5 === store_read()['revision']);
$check('migration of a current config changes nothing', migrate_config(store_read()['config']) === store_read()['config']);

// ---- Capabilities and visibility.
$check('an administrator may manage the layout configuration', can_manage());
foreach (['fixture_editor', 'fixture_subscriber'] as $login) {
    wp_set_current_user((int) get_user_by('login', $login)->ID);
    $check("$login may not manage the layout configuration", !can_manage());
}
wp_set_current_user(0);
$check('a visitor may not manage the layout configuration', !can_manage());
wp_set_current_user((int) get_user_by('login', 'fixture_admin')->ID);
$check('the option is not a registered setting, so the REST settings route does not expose it', !array_key_exists($option, get_registered_settings()));
$request = new WP_REST_Request('GET', '/wp/v2/settings');
$settings = rest_get_server()->dispatch($request)->get_data();
$check('the REST settings response does not contain the layout config', is_array($settings) && !array_key_exists($option, $settings));
ob_start();
do_action('wp_head');
do_action('wp_footer');
$page = (string) ob_get_clean();
$check('nothing from the stored layout config reaches the page head or footer', !str_contains($page, 'Free delivery') && !str_contains($page, $option));

// ---- Leave no trace.
delete_option($option);
$check('the layout option is removed again', null === store_raw());
// A run that stopped early would print fewer lines and no marker; the harness shows this note.
echo 'NOTE ' . $label . "layout checks completed: $count\n";
