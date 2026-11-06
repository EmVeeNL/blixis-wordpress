<?php
// Throwaway proof for task 01-05. Runs under `wp eval-file` from spikes/01-05-contracts/wordpress/run.sh.
// "ok"/"FAIL" lines are assertions. "OBSERVE" lines record measured behavior, including behavior this
// proof rejects, so a reader can see what the guard is protecting against.

$pass = 0;
$fail = 0;
$check = static function (string $name, bool $ok, string $detail = '') use (&$pass, &$fail): void {
    $ok ? $pass++ : $fail++;
    echo($ok ? 'ok   ' : 'FAIL ') . $name . ($ok || $detail === '' ? '' : " :: $detail") . "\n";
};
$observe = static function (string $key, mixed $value): void {
    echo "OBSERVE $key=" . (is_string($value) ? $value : json_encode($value)) . "\n";
};
$base = 'http://127.0.0.1:8080';
$lib = WP_PLUGIN_DIR . '/blixis-doc-contract-lib';
require_once "$lib/fixtures.php";
require_once ABSPATH . 'wp-admin/includes/post.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';

$bundle = blixis_doc_load_bundle('/tmp/contract/wp/bundle.json');
echo 'ENV WP ' . get_bloginfo('version') . ' PHP ' . PHP_VERSION . ' DB ' . $GLOBALS['wpdb']->db_version() . "\n";

// ---- 1. Fixtures through the same PHP validator the plugin uses.
$results = blixis_doc_run_bundle($bundle);
foreach (blixis_doc_compare_bundle($bundle, $results) as [$name, $ok, $detail]) {
    $check("fixture: $name", $ok, $detail);
}
echo 'VALIDATOR_DIGEST ' . blixis_doc_results_digest($results) . "\n";
$check('registry file equals the bundled registry', bdc_registry() === $bundle['registry']);

$start = microtime(true);
blixis_doc_validate(blixis_doc_generate(['generated' => 'flat-nodes', 'count' => 2000]), bdc_registry());
$observe('validate_2000_nodes_ms', round((microtime(true) - $start) * 1000, 1));
$start = microtime(true);
blixis_doc_validate(blixis_doc_generate(['generated' => 'pad-to-bytes', 'bytes' => 1048576]), bdc_registry());
$observe('validate_1MiB_ms', round((microtime(true) - $start) * 1000, 1));

// ---- Users and helpers.
$user = static fn (string $login, string $role): int => (int) wp_insert_user(['user_login' => $login, 'user_pass' => wp_generate_password(24), 'user_email' => "$login@example.test", 'role' => $role]);
$editor = $user('c_editor', 'editor');
$author = $user('c_author', 'author');
$other = $user('c_other', 'author');
$subscriber = $user('c_subscriber', 'subscriber');
$admin = (int) get_user_by('login', 'contract_admin')->ID;

$fixture = static fn (string $name): string => (string) base64_decode($bundle['valid'][$name]);
$mig = static fn (string $name): string => (string) base64_decode($bundle['migrationFiles'][$name]);
$doc_with = static function (string $text, ?string $id = 'fixture'): string {
    return (string) json_encode([
        'schemaVersion' => 1, 'documentId' => $id, 'root' => ['s'],
        'nodes' => [
            's' => ['id' => 's', 'type' => 'blixis/section', 'version' => 1, 'props' => (object) [], 'children' => ['h', 'p']],
            'h' => ['id' => 'h', 'type' => 'blixis/heading', 'version' => 1, 'props' => ['text' => 'Heading', 'level' => 2], 'children' => []],
            'p' => ['id' => 'p', 'type' => 'blixis/paragraph', 'version' => 1, 'props' => ['text' => $text], 'children' => []],
        ],
        'themeRef' => ['theme' => 'blixis-base', 'tokensVersion' => 1],
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
};
$new_post = static function (int $owner, string $status = 'draft', string $title = 'Title', string $type = 'post') {
    return (int) wp_insert_post(['post_type' => $type, 'post_status' => $status, 'post_author' => $owner, 'post_title' => $title, 'post_content' => '']);
};
$save = static function (int $id, string $raw, array $options = []): array {
    return bdc_save($id, $raw, bdc_token_for(bdc_raw($id)), $options);
};
$rest = static function (string $method, string $route, int $as, ?string $body = null, array $headers = [], array $params = []): WP_REST_Response {
    wp_set_current_user($as);
    $request = new WP_REST_Request($method, $route);
    foreach ($headers as $k => $v) {
        $request->set_header($k, $v);
    }
    if ($body !== null) {
        $request->set_body($body);
    }
    if ($params !== []) {
        $request->set_body_params($params);
    }
    return rest_ensure_response(rest_do_request($request));
};
$http = static function (string $url, array $headers = [], string $method = 'GET', ?string $body = null) use ($base): array {
    $target = str_starts_with($url, 'http') ? $url : $base . $url;
    $res = wp_remote_request($target, ['method' => $method, 'headers' => $headers, 'body' => $body, 'timeout' => 30, 'redirection' => 3]);
    return is_wp_error($res) ? ['status' => 0, 'body' => $res->get_error_message()] : ['status' => (int) wp_remote_retrieve_response_code($res), 'body' => (string) wp_remote_retrieve_body($res)];
};
wp_set_current_user($admin);

// ---- 2. Ownership.
$check('meta key is protected', is_protected_meta(BDC_META, 'post'));
$check('admin has no generic edit_post_meta on the document', !current_user_can('edit_post_meta', $new_post($admin), BDC_META));
$pid = $new_post($editor, 'draft', 'Owned title');
$before = get_post($pid);
$r = $rest('PUT', "/" . BDC_NS . "/posts/$pid/document", $editor, $fixture('section-heading.json'), ['If-Match' => bdc_token_for('')]);
$check('valid document saves through the route', $r->get_status() === 200, (string) wp_json_encode($r->get_data()));
$after = get_post($pid);
foreach (['post_title', 'post_status', 'post_author', 'post_name', 'post_date_gmt', 'post_excerpt'] as $field) {
    $check("save leaves $field alone", $after->{$field} === $before->{$field}, (string) $after->{$field});
}
$token = bdc_token_for(bdc_raw($pid));
foreach (['wp-owned-title.json', 'wp-owned-many.json'] as $file) {
    $r = $rest('PUT', "/" . BDC_NS . "/posts/$pid/document", $editor, (string) base64_decode($bundle['invalid'][$file]), ['If-Match' => $token]);
    $codes = array_unique(array_column($r->get_data()['errors'] ?? [], 'code'));
    $check("route refuses $file with wp_owned_field", $r->get_status() === 422 && in_array('wp_owned_field', $codes, true));
}
$after = get_post($pid);
$check('refused document changed no post field', $after->post_title === 'Owned title' && $after->post_status === 'draft');
$r = $rest('POST', "/wp/v2/posts/$pid", $editor, null, [], ['title' => 'New WordPress title']);
$check('WordPress still owns the title through its own route', $r->get_status() === 200 && get_post($pid)->post_title === 'New WordPress title', (string) $r->get_status());
$check('title change did not touch the document', bdc_raw($pid) === $fixture('section-heading.json'));
$r = $rest('POST', "/wp/v2/posts/$pid", $editor, null, [], ['meta' => [BDC_META => 'x']]);
$check('generic route cannot write the document', bdc_raw($pid) === $fixture('section-heading.json'), (string) $r->get_status());
wp_set_current_user($admin);

// Denied writers.
foreach ([['anonymous', 0, 401], ['subscriber', $subscriber, 403], ['other author', $other, 403]] as [$label, $as, $status]) {
    $r = $rest('PUT', "/" . BDC_NS . "/posts/$pid/document", $as, $fixture('empty-document.json'), ['If-Match' => bdc_token_for(bdc_raw($pid))]);
    $check("$label cannot write ($status)", $r->get_status() === $status, (string) $r->get_status());
    $r = $rest('GET', "/" . BDC_NS . "/posts/$pid/document", $as);
    $check("$label cannot read a draft document ($status)", $r->get_status() === $status, (string) $r->get_status());
}
wp_set_current_user($admin);

// ---- 3. Storage and slashing.
$slashes = $new_post($admin);
foreach ($bundle['valid'] as $name => $b64) {
    $raw = (string) base64_decode($b64);
    $r = $save($slashes, $raw);
    wp_cache_flush();
    $check("storage round trip is byte-exact: $name", $r['code'] === 200 && bdc_raw($slashes) === $raw, (string) wp_json_encode($r));
}
$big = blixis_doc_generate(['generated' => 'pad-to-bytes', 'bytes' => 1048576]);
$r = $save($slashes, $big);
wp_cache_flush();
$check('limit-sized document round-trips byte-exact', $r['code'] === 200 && bdc_raw($slashes) === $big);
$tricky = $fixture('tricky-text.json');
update_post_meta($slashes, BDC_META, $tricky);
$observe('unslashed_update_post_meta_corrupts', bdc_raw($slashes) !== $tricky);
$save($slashes, $tricky);
$observe('assoc_reencode_turns_empty_props_into_array', json_encode(json_decode('{"props":{}}', true)));
$check('empty object survives the object decoder', json_encode(json_decode('{"props":{}}')) === '{"props":{}}');

// ---- 4. Revisions.
$rev = $new_post($admin, 'draft', 'Rev');
$latest = static fn (int $id): int => (int) array_key_first(wp_get_post_revisions($id, ['orderby' => 'ID', 'order' => 'DESC', 'posts_per_page' => 1, 'check_enabled' => false]));
$v1 = $doc_with('First body');
$v2 = $doc_with('Second body');
$save($rev, $v1);
$r1 = $latest($rev);
$check('save creates a revision that holds the document', $r1 > 0 && get_metadata('post', $r1, BDC_META, true) === $v1);
$check('revision hash matches revision content', get_metadata('post', $r1, BDC_HASH, true) === hash('sha256', get_post($r1)->post_content));
$save($rev, $v2);
$r2 = $latest($rev);
$check('second save creates a second revision', $r2 > $r1 && get_metadata('post', $r2, BDC_META, true) === $v2);
$count = count(wp_get_post_revisions($rev));
$style_only = str_replace('"level":2', '"level":3', $v2);
$save($rev, $style_only);
$check('a change that alters no text but alters markup still revisions', count(wp_get_post_revisions($rev)) > $count);
$count = count(wp_get_post_revisions($rev));
$same_projection = str_replace('"documentId":"fixture"', '"documentId":"fixture2"', $style_only);
$save($rev, $same_projection);
$observe('meta_only_change_same_post_content_creates_revision', count(wp_get_post_revisions($rev)) > $count);
$check('meta-only change creates a revision', count(wp_get_post_revisions($rev)) > $count);
wp_restore_post_revision($r1);
wp_cache_flush();
$check('restore brings back the document, byte-exact', bdc_raw($rev) === $v1);
$check('restore brings back the matching post_content', str_contains(get_post($rev)->post_content, 'First body'));
$check('restore leaves the page not diverged', !bdc_diverged($rev));
$check('restore keeps a token that follows the bytes', bdc_save($rev, $v2, bdc_token_for($v1))['code'] === 200);
$check('the pre-restore token is stale after a restore', bdc_save($rev, $v1, bdc_token_for($same_projection))['code'] === 412);

// Revisions disabled: the token still works, but the rollback path is gone.
add_filter('wp_revisions_to_keep', '__return_zero');
$norev = $new_post($admin);
$save($norev, $v1);
$check('with revisions off, save still succeeds', bdc_raw($norev) === $v1);
$observe('revision_count_with_revisions_off', count(wp_get_post_revisions($norev, ['check_enabled' => false])));
remove_filter('wp_revisions_to_keep', '__return_zero');

// Restoring to before the first Blixis save.
$pre = $new_post($admin, 'draft', 'Pre');
wp_update_post(['ID' => $pre, 'post_content' => 'Original block editor text']);
$pre_rev = $latest($pre);
$save($pre, $v1);
wp_restore_post_revision($pre_rev);
wp_cache_flush();
$observe('restore_of_pre_blixis_revision_deletes_live_document', !bdc_has_document($pre));
$check('restoring a pre-Blixis revision returns the page to the other editor', !bdc_has_document($pre) && get_post($pre)->post_content === 'Original block editor text');
$held = false;
foreach (wp_get_post_revisions($pre, ['check_enabled' => false]) as $revision) {
    $held = $held || get_metadata('post', $revision->ID, BDC_META, true) === $v1;
}
$check('the deleted document stays recoverable from an earlier revision', $held);
$check('no separate editor-mode field can disagree: ownership follows the document', !bdc_has_document($pre) && use_block_editor_for_post($pre));

// Plugin off during a restore: the meta key is not registered as revisioned.
$off = $new_post($admin);
$save($off, $v1);
$off_r1 = $latest($off);
$save($off, $v2);
unregister_post_meta('post', BDC_META);
unregister_post_meta('post', BDC_HASH);
wp_restore_post_revision($off_r1);
wp_cache_flush();
$observe('restore_without_plugin_keeps_new_doc_with_old_content', bdc_raw($off) === $v2 && str_contains(get_post($off)->post_content, 'First body'));
foreach ([BDC_META, BDC_HASH] as $key) {
    register_post_meta('post', $key, ['type' => 'string', 'single' => true, 'show_in_rest' => false, 'revisions_enabled' => true, 'auth_callback' => '__return_false']);
}
$check('a restore made while the plugin was off is detected as diverged', bdc_diverged($off));

// ---- 5. Older schema held by a revision, and a downgraded plugin.
$old = $new_post($admin, 'publish', 'Old schema');
$v1b = $mig('v1-basic.input.json');
$v2b = $mig('v1-basic.v2.golden.json');
$check('fixture v1 stores', $save($old, $v1b)['code'] === 200);
$old_r = $latest($old);
update_option('bdc_reader', 2);
$migrated = bdc_migrate_post($old, 2);
$check('v2 build migrates on demand through the guarded write', $migrated['code'] === 200, (string) wp_json_encode($migrated));
$check('stored document is now v2', json_decode(bdc_raw($old))->schemaVersion === 2);
$check('the pre-migration revision still holds v1 bytes', get_metadata('post', $old_r, BDC_META, true) === $v1b);
wp_restore_post_revision($old_r);
wp_cache_flush();
$check('restored revision holds the older schema, byte-exact', bdc_raw($old) === $v1b);
$loaded = bdc_load($old);
$check('v2 reader serves the restored v1 by migrating in memory', $loaded['state'] === 'ready' && $loaded['doc']->schemaVersion === 2);
$check('reading wrote nothing', bdc_raw($old) === $v1b);
$check('save after restore goes through the current schema', bdc_migrate_post($old, 2)['code'] === 200 && json_decode(bdc_raw($old))->schemaVersion === 2);
$v2_bytes = bdc_raw($old);
update_option('bdc_reader', 1);
$loaded = bdc_load($old);
$check('downgraded plugin falls back on a future schema', $loaded['state'] === 'fallback' && $loaded['codes'] === ['unsupported_schema_version']);
$res = $http("/?p=$old");
$check('downgraded plugin serves the stored post_content', $res['status'] === 200 && str_contains($res['body'], 'Hello') && !str_contains($res['body'], 'data-blixis-rendered'), (string) $res['status']);
$r = $save($old, $v1b);
$check('downgraded plugin refuses to overwrite a future document', $r['code'] === 409 && $r['error'] === 'stored_document_unsupported');
$check('future document bytes are intact', bdc_raw($old) === $v2_bytes);
wp_restore_post_revision($old_r);
wp_cache_flush();
$check('rollback: restoring the v1 revision recovers a working downgraded site', bdc_load($old)['state'] === 'ready' && bdc_raw($old) === $v1b);

// A failing migration leaves everything alone.
$failing = $new_post($admin, 'draft', 'Failing');
$bad = $mig('v1-unmigratable.input.json');
update_post_meta($failing, BDC_META, wp_slash($bad));
$failing_content = get_post($failing)->post_content;
$revisions_before = count(wp_get_post_revisions($failing));
$r = bdc_migrate_post($failing, 2);
wp_cache_flush();
$check('failing migration reports migration_failed', $r['code'] === 409 && $r['error'] === 'migration_failed', (string) wp_json_encode($r));
$check('failing migration leaves bytes, content, and revisions intact', bdc_raw($failing) === $bad && get_post($failing)->post_content === $failing_content && count(wp_get_post_revisions($failing)) === $revisions_before);

// Future schema stored directly, and an invalid document stored directly.
$future = $new_post($admin, 'publish', 'Future');
wp_update_post(['ID' => $future, 'post_content' => 'Projected future text']);
$future_raw = $mig('future-v3.input.json');
update_post_meta($future, BDC_META, wp_slash($future_raw));
$res = $http("/?p=$future");
$check('future schema: public page shows the projection, no fatal', $res['status'] === 200 && str_contains($res['body'], 'Projected future text') && !str_contains($res['body'], 'data-blixis-rendered'), (string) $res['status']);
$check('future schema: bytes intact after a read', bdc_raw($future) === $future_raw);
$tampered = $new_post($admin, 'publish', 'Tampered');
wp_update_post(['ID' => $tampered, 'post_content' => 'Safe projection']);
$evil = (string) base64_decode($bundle['invalid']['unsafe-url-javascript.json']);
update_post_meta($tampered, BDC_META, wp_slash($evil));
$res = $http("/?p=$tampered");
$check('directly written invalid document never renders', str_contains($res['body'], 'Safe projection') && !str_contains($res['body'], 'javascript:alert'));

// Unknown node version.
$unk = $new_post($admin, 'publish', 'Unknown node');
$stored = $mig('preserve-stored.json');
update_post_meta($unk, BDC_META, wp_slash($stored));
wp_update_post(['ID' => $unk, 'post_content' => 'Older projection']);
$res = $http("/?p=$unk");
$check('unknown node: other content renders, unknown props do not', $res['status'] === 200 && str_contains($res['body'], 'data-blixis-rendered') && !str_contains($res['body'], 'futureProp'));
$check('unknown node: stored bytes intact after a read', bdc_raw($unk) === $stored);
$r = $save($unk, $mig('preserve-incoming-sibling-edit.json'));
$check('unknown node: a sibling edit saves and keeps it', $r['code'] === 200 && str_contains(bdc_raw($unk), '"futureProp": true'), (string) wp_json_encode($r));
$r = $save($unk, $mig('preserve-incoming-tampered.json'));
$check('unknown node: a changed copy is refused', $r['code'] === 422);
$r = $save($unk, $mig('preserve-incoming-smuggled.json'));
$check('unknown node: a new unknown node cannot be smuggled in', $r['code'] === 422);

// ---- 6. Conflict tokens.
$c = $new_post($admin);
$save($c, $v1);
$t1 = bdc_token_for(bdc_raw($c));
$modified_before = get_post($c)->post_modified_gmt;
update_post_meta($c, BDC_META, wp_slash($v2));
wp_cache_flush();
$observe('post_modified_token_misses_direct_meta_write', get_post($c)->post_modified_gmt === $modified_before);
$save($c, $v1);
$observe('post_modified_token_same_second_collision', get_post($c)->post_modified_gmt === $modified_before);
add_filter('wp_revisions_to_keep', '__return_zero');
$rid_before = $latest($c);
$save($c, $v2);
$observe('revision_id_token_unchanged_when_revisions_off', $latest($c) === $rid_before);
remove_filter('wp_revisions_to_keep', '__return_zero');
$save($c, $v1);
$url = "/" . BDC_NS . "/posts/$c/document";
$r = $rest('PUT', $url, $admin, $v2);
$check('no If-Match gets 428', $r->get_status() === 428, (string) $r->get_status());
$check('428 changed nothing', bdc_raw($c) === $v1);
$r = $rest('PUT', $url, $admin, $v2, ['If-Match' => bdc_token_for('stale')]);
$check('stale If-Match gets 412', $r->get_status() === 412, (string) $r->get_status());
$check('412 changed nothing', bdc_raw($c) === $v1);
$r = $rest('PUT', $url, $admin, $v2, ['If-Match' => 'W/' . bdc_token_for($v1)]);
$check('weak ETag is refused', $r->get_status() === 412);
$read = $rest('GET', $url, $admin);
$r = $rest('PUT', $url, $admin, $v2, ['If-Match' => $read->get_headers()['ETag']]);
$check('token from the read route writes', $r->get_status() === 200, (string) $r->get_status());
$check('response carries the next token', ($r->get_headers()['ETag'] ?? '') === bdc_token_for($v2));
$r = $rest('PUT', $url, $admin, $v1, ['If-Match' => bdc_token_for($v1)]);
$check('the writer that lost refreshes, it does not overwrite', $r->get_status() === 412 && bdc_raw($c) === $v2);
$emoji = $doc_with('Emoji 🌱 日本語 "q" \\ path');
$check('emoji document saves', $save($c, $emoji)['code'] === 200);
$check('SHA2 in the database equals the PHP hash for a multibyte document', $save($c, $v1)['code'] === 200);
$case_a = $doc_with('Same words');
$case_b = $doc_with('SAME WORDS');
$save($c, $case_a);
$observe('meta_value_equals_is_case_insensitive', (int) $GLOBALS['wpdb']->get_var($GLOBALS['wpdb']->prepare("SELECT COUNT(*) FROM {$GLOBALS['wpdb']->postmeta} WHERE post_id=%d AND meta_key=%s AND meta_value=%s", $c, BDC_META, $case_b)) === 1);
$check('case-only edit is a real change', $save($c, $case_b)['code'] === 200 && bdc_raw($c) === $case_b);

// Deterministic race: a competing write lands after the token check.
$race = $new_post($admin);
$save($race, $v1);
$competing = static function (int $id) use ($doc_with, &$competing): void {
    remove_action('bdc_between_check_and_write', $competing);
    $GLOBALS['wpdb']->update($GLOBALS['wpdb']->postmeta, ['meta_value' => $doc_with('Competing writer')], ['post_id' => $id, 'meta_key' => BDC_META]);
    wp_cache_delete($id, 'post_meta');
};
add_action('bdc_between_check_and_write', $competing);
$r = $save($race, $v2);
$check('the locked re-check refuses a write that lost the race', $r['code'] === 412 && str_contains(bdc_raw($race), 'Competing writer'), (string) wp_json_encode($r));
remove_action('bdc_between_check_and_write', $competing);
$race2 = $new_post($admin);
$save($race2, $v1);
add_action('bdc_between_check_and_write', $competing);
$r = bdc_save($race2, $v2, bdc_token_for($v1), ['mode' => 'none']);
$observe('check_then_write_without_cas_loses_the_competing_write', $r['code'] === 200 && bdc_raw($race2) === $v2);

// Real concurrency against separate PHP processes sharing the database.
$session = static function (int $id): array {
    $expires = time() + 3600;
    $token = WP_Session_Tokens::get_instance($id)->create($expires);
    $cookie = wp_generate_auth_cookie($id, $expires, 'logged_in', $token);
    $_COOKIE[LOGGED_IN_COOKIE] = $cookie;
    wp_set_current_user($id);
    return ['cookie' => LOGGED_IN_COOKIE . '=' . rawurlencode($cookie), 'nonce' => wp_create_nonce('wp_rest')];
};
$workers = [];
foreach ([8081, 8082, 8083, 8084] as $port) {
    $workers[] = proc_open(['php', '-S', "127.0.0.1:$port", '-t', ABSPATH], [0 => ['file', '/dev/null', 'r'], 1 => ['file', '/dev/null', 'a'], 2 => ['file', '/dev/null', 'a']], $pipes);
}
for ($i = 0; $i < 30; $i++) {
    $fp = @fsockopen('127.0.0.1', 8084, $en, $es, 0.2);
    if ($fp) {
        fclose($fp);
        break;
    }
    usleep(200000);
}
$s = $session($admin);
$fire = static function (int $id, array $bodies, string $token) use ($s): array {
    $procs = [];
    foreach ($bodies as $i => $body) {
        $port = 8081 + ($i % 4);
        $script = 'echo @file_get_contents($argv[1], false, stream_context_create(["http" => ["method" => "PUT", "ignore_errors" => true, "timeout" => 30, "header" => $argv[2], "content" => $argv[3]]])) === false ? "0" : explode(" ", $http_response_header[0])[1];';
        $header = "Cookie: {$s['cookie']}\r\nX-WP-Nonce: {$s['nonce']}\r\nIf-Match: $token\r\nContent-Type: application/json";
        $procs[] = proc_open(['php', '-r', $script, '--', "http://127.0.0.1:$port/?rest_route=/" . BDC_NS . "/posts/$id/document", $header, $body], [1 => ['pipe', 'w'], 2 => ['file', '/dev/null', 'a']], $p);
        $outs[] = $p[1];
    }
    $codes = [];
    foreach ($outs as $i => $out) {
        $codes[] = trim((string) stream_get_contents($out));
        fclose($out);
        proc_close($procs[$i]);
    }
    sort($codes);
    return $codes;
};
$bodies = [];
for ($i = 0; $i < 8; $i++) {
    $bodies[] = $doc_with("Concurrent writer $i");
}
update_option('bdc_race_sleep_ms', 300);
$first_rows = static fn (int $id): int => (int) $GLOBALS['wpdb']->get_var($GLOBALS['wpdb']->prepare("SELECT COUNT(*) FROM {$GLOBALS['wpdb']->postmeta} WHERE post_id=%d AND meta_key=%s", $id, BDC_META));
foreach (['none', 'sha-swap', 'lock'] as $mode) {
    update_option('bdc_write_mode', $mode);
    wp_cache_flush();
    $live = $new_post($admin);
    bdc_save($live, $v1, bdc_token_for(''), ['mode' => 'lock']);
    $codes = array_count_values($fire($live, $bodies, bdc_token_for($v1)));
    $observe("concurrent_8_updates_mode_$mode", $codes);
    $first = $new_post($admin);
    $first_codes = array_count_values($fire($first, $bodies, bdc_token_for('')));
    wp_cache_flush();
    $observe("concurrent_8_first_writes_mode_$mode", ['codes' => $first_codes, 'metaRows' => $first_rows($first)]);
    if ($mode === 'sha-swap' && $first_rows($first) > 1) {
        bdc_save($first, $v2, bdc_token_for(bdc_raw($first)));
    wp_cache_flush();
    $observe('duplicate_rows_remain_after_a_later_save_in_sha_swap', $first_rows($first));
    }
    if ($mode === 'lock') {
        $check('real concurrency, update: exactly one writer wins, the rest get 412', ($codes['200'] ?? 0) === 1 && ($codes['412'] ?? 0) === 7, (string) wp_json_encode($codes));
        wp_cache_flush();
        $winner = (string) bdc_raw($live);
        $check('real concurrency, update: stored document and post_content agree', !bdc_diverged($live) && str_contains(get_post($live)->post_content, (string) json_decode($winner)->nodes->p->props->text));
        $check('real concurrency, first write: exactly one writer wins', ($first_codes['200'] ?? 0) === 1 && ($first_codes['412'] ?? 0) === 7, (string) wp_json_encode($first_codes));
        $check('real concurrency, first write: exactly one meta row', $first_rows($first) === 1);
    }
}
delete_option('bdc_write_mode');
delete_option('bdc_race_sleep_ms');
foreach ($workers as $worker) {
    proc_terminate($worker);
}
wp_set_current_user($admin);

// Failure mid-write rolls back both tables.
$tx = $new_post($admin, 'draft', 'Tx');
$save($tx, $v1);
$tx_content = get_post($tx)->post_content;
$revs_before = count(wp_get_post_revisions($tx));
$boom = static function (): void {
    throw new RuntimeException('Simulated failure');
};
add_action('bdc_before_commit', $boom);
$r = $save($tx, $v2);
remove_action('bdc_before_commit', $boom);
wp_cache_flush();
$check('failure after the swap reports 500', $r['code'] === 500);
$check('failure rolls back the document', bdc_raw($tx) === $v1);
$check('failure rolls back post_content', get_post($tx)->post_content === $tx_content);
$check('failure rolls back the revision', count(wp_get_post_revisions($tx)) === $revs_before);
$check('failure leaves the page not diverged', !bdc_diverged($tx));

// ---- 7. Autosave.
$autosave_doc = $doc_with('AUTOSAVE-ONLY-MARKER');
foreach (['publish', 'draft', 'future'] as $status) {
    wp_set_current_user($editor);
    $args = ['post_type' => 'post', 'post_status' => $status, 'post_author' => $author, 'post_title' => "Autosave $status", 'post_content' => ''];
    if ($status === 'future') {
        $args['post_date'] = gmdate('Y-m-d H:i:s', time() + 86400);
    }
    $a = (int) wp_insert_post($args);
    bdc_save($a, $v1, bdc_token_for(''));
    $content = get_post($a)->post_content;
    $r = $rest('POST', "/" . BDC_NS . "/posts/$a/autosave", $editor, $autosave_doc);
    wp_cache_flush();
    $check("autosave on $status accepted", $r->get_status() === 200, (string) wp_json_encode($r->get_data()));
    $check("autosave on $status keeps the status", get_post_status($a) === $status, (string) get_post_status($a));
    $check("autosave on $status leaves the live document", bdc_raw($a) === $v1);
    $check("autosave on $status leaves post_content", get_post($a)->post_content === $content);
    $row = wp_get_post_autosave($a, $editor);
    $check("autosave on $status is on the autosave revision", $row && get_metadata('post', $row->ID, BDC_META, true) === $autosave_doc);
    $r = $rest('POST', "/" . BDC_NS . "/posts/$a/autosave", $editor, $doc_with('AUTOSAVE-SECOND'));
    wp_cache_flush();
    $check("second autosave on $status overwrites the same row", wp_get_post_autosave($a, $editor)->ID === $row->ID && str_contains((string) get_metadata('post', $row->ID, BDC_META, true), 'AUTOSAVE-SECOND'));
    $check("second autosave on $status still leaves the live document", bdc_raw($a) === $v1 && get_post_status($a) === $status);
    if ($status === 'publish') {
        $res = $http("/?p=$a");
        $check('anonymous reader of a published page never sees the autosave', $res['status'] === 200 && !str_contains($res['body'], 'AUTOSAVE'));
        $res = $http("/?p=$a&preview=true");
        $check('anonymous preview request does not see the autosave', !str_contains($res['body'], 'AUTOSAVE'));
        // Over HTTP: the core route defines DOING_AUTOSAVE, which would stop revisions in this process.
        $s = $session($editor);
        $res = $http("/?rest_route=/wp/v2/posts/$a/autosaves", ['Cookie' => $s['cookie'], 'X-WP-Nonce' => $s['nonce'], 'Content-Type' => 'application/json'], 'POST', (string) wp_json_encode(['title' => 'Core autosave', 'content' => 'CORE-AUTOSAVE-BODY']));
        wp_cache_flush();
        $observe('core_autosave_route_with_content_status', $res['status']);
        $check('core autosave route leaves the document and content alone', bdc_raw($a) === $v1 && get_post($a)->post_content === $content);
        wp_set_current_user($editor);
        $published_rev = $row->ID;
        wp_restore_post_revision($published_rev);
        wp_cache_flush();
        $observe('restoring_an_autosave_on_a_published_page_goes_live_immediately', str_contains(bdc_raw($a), 'AUTOSAVE-SECOND'));
    }
}
$a = $new_post($author, 'draft', 'Autosave denied');
$r = $rest('POST', "/" . BDC_NS . "/posts/$a/autosave", $other, $autosave_doc);
$check('other author cannot autosave', $r->get_status() === 403);
$r = $rest('POST', "/" . BDC_NS . "/posts/$a/autosave", $author, (string) base64_decode($bundle['invalid']['unsafe-url-javascript.json']));
$check('autosave validates too', $r->get_status() === 422);
wp_set_current_user($admin);
$p = $new_post($admin, 'draft');
$save($p, $v1);
$observe('core_wp_create_post_autosave_returns_when_fields_unchanged', wp_create_post_autosave(['post_ID' => $p, 'post_type' => 'post', 'post_title' => get_post($p)->post_title, 'post_content' => get_post($p)->post_content, 'post_excerpt' => '']));
$observe('core_wp_create_post_autosave_second_call_returns', wp_create_post_autosave(['post_ID' => $p, 'post_type' => 'post', 'post_title' => get_post($p)->post_title, 'post_content' => get_post($p)->post_content, 'post_excerpt' => '']));

// ---- 8. post_content strategies, over real HTTP, with the plugin on and off.
update_option('posts_per_rss', 200);
$strategies = ['empty', 'text', 'html', 'custom-block', 'html-block'];
$posts = [];
foreach ($strategies as $strategy) {
    $word = 'zzqword' . str_replace('-', '', $strategy);
    $raw = $doc_with("Body with $word & \"quotes\" and a<b text.");
    wp_set_current_user($author);
    $id = (int) wp_insert_post(['post_type' => 'post', 'post_status' => 'publish', 'post_author' => $author, 'post_title' => "STRATEGY-$strategy", 'post_content' => '']);
    update_option('bdc_strategy', $strategy);
    $r = bdc_save($id, $raw, bdc_token_for(''));
    $check("author without unfiltered_html can save with strategy $strategy", $r['code'] === 200, (string) wp_json_encode($r));
    $check("strategy $strategy: hash follows kses, so no false divergence", !bdc_diverged($id));
    $observe("strategy_{$strategy}_kses_changed_author_content", bdc_project_content(json_decode($raw), $strategy) !== get_post($id)->post_content);
    $check("strategy $strategy: text survives kses", $strategy === 'empty' || str_contains(get_post($id)->post_content, $word));
    $posts[$strategy] = ['id' => $id, 'word' => $word];
    $parsed = parse_blocks(get_post($id)->post_content);
    $observe("strategy_{$strategy}_first_block", $parsed[0]['blockName'] ?? null);
}
update_option('bdc_strategy', 'html-block');
$measure = static function (string $state) use ($posts, $http, $observe, $check): array {
    $feed = $http('/?feed=rss2');
    $xml = @simplexml_load_string($feed['body']);
    $table = [];
    foreach ($posts as $strategy => $info) {
        $w = $info['word'];
        $item = null;
        foreach ($xml ? $xml->channel->item : [] as $candidate) {
            if ((string) $candidate->title === "STRATEGY-$strategy") {
                $item = $candidate;
            }
        }
        $encoded = $item ? (string) $item->children('content', true)->encoded : '';
        $search = $http("/?s=$w");
        $page = $http("/?p={$info['id']}");
        $table[$strategy] = [
            'search' => str_contains($search['body'], "STRATEGY-$strategy"),
            'page' => str_contains($page['body'], $w),
            'excerpt' => $item !== null && str_contains((string) $item->description, $w),
            'feed' => str_contains($encoded, $w),
            'rendered' => str_contains($page['body'], 'data-blixis-rendered'),
        ];
    }
    $observe("post_content_matrix_$state", $table);
    return $table;
};
$on = $measure('plugin_on');
deactivate_plugins('blixis-doc-contract.php');
$off_table = $measure('plugin_off');
foreach ($strategies as $strategy) {
    $check("strategy $strategy: page uses the renderer while the plugin is on", $on[$strategy]['rendered']);
    $check("strategy $strategy: renderer is gone after deactivation", !$off_table[$strategy]['rendered']);
}
$check('recommended html-block: search, page, excerpt, feed all survive deactivation', $off_table['html-block'] === ['search' => true, 'page' => true, 'excerpt' => true, 'feed' => true, 'rendered' => false], (string) wp_json_encode($off_table['html-block']));
$check('recommended html-block: all work with the plugin on too', $on['html-block'] === ['search' => true, 'page' => true, 'excerpt' => true, 'feed' => true, 'rendered' => true], (string) wp_json_encode($on['html-block']));
$check('empty post_content loses content on deactivation', !$off_table['empty']['page'] && !$off_table['empty']['search'] && !$off_table['empty']['feed']);

// Editing while the plugin is off, then coming back.
$elsewhere = $posts['html-block']['id'];
$kept = bdc_raw($elsewhere);
wp_set_current_user($admin);
wp_update_post(['ID' => $elsewhere, 'post_content' => 'Edited while Blixis was off']);
activate_plugin('blixis-doc-contract.php');
wp_cache_flush();
$check('edit while the plugin was off is detected as divergence', bdc_diverged($elsewhere));
$check('the document is intact after that edit', bdc_raw($elsewhere) === $kept);

// While active: the REST write lock.
$lock = $new_post($admin, 'publish', 'Locked');
$save($lock, $v1);
$content = get_post($lock)->post_content;
$r = $rest('POST', "/wp/v2/posts/$lock", $admin, null, [], ['content' => 'Silent Gutenberg overwrite']);
$check('core REST content write on a Blixis page gets 409', $r->get_status() === 409, (string) $r->get_status());
$check('and changes nothing', get_post($lock)->post_content === $content);
$r = $rest('POST', "/wp/v2/posts/$lock", $admin, null, [], ['title' => 'Only the title']);
$check('a title-only core write still works', $r->get_status() === 200, (string) $r->get_status());
$check('block editor is off for a Blixis page', !use_block_editor_for_post($lock));
wp_set_current_user($admin);
wp_update_post(['ID' => $lock, 'post_content' => 'Programmatic write']);
$check('a programmatic write bypasses the lock, and the hash reveals it', bdc_diverged($lock));
$other_page = $new_post($admin, 'draft', 'Not Blixis');
$check('block editor stays on for a page Blixis does not own', use_block_editor_for_post($other_page));
$r = $rest('POST', "/wp/v2/posts/$other_page", $admin, null, [], ['content' => 'Fine']);
$check('core write on another page is untouched', $r->get_status() === 200);

// Explicit conversion back.
$conv = $new_post($admin, 'draft', 'Convert');
$save($conv, $v1);
$content = get_post($conv)->post_content;
$conv_rev = $latest($conv);
bdc_convert_to_gutenberg($conv);
wp_cache_flush();
$check('conversion hands the page to the block editor', !bdc_has_document($conv) && use_block_editor_for_post($conv));
$check('conversion keeps the projection as editable content', get_post($conv)->post_content === $content);
$blocks = array_values(array_filter(parse_blocks($content), static fn ($b) => $b['blockName'] !== null));
$observe('converted_content_blocks', array_column($blocks, 'blockName'));
wp_restore_post_revision($conv_rev);
wp_cache_flush();
$check('conversion is undoable through a revision', bdc_raw($conv) === $v1, substr(bdc_raw($conv), 0, 60) . ' rev=' . $conv_rev . ' revdoc=' . substr((string) get_metadata('post', $conv_rev, BDC_META, true), 0, 40));

// Drafts, hidden nodes, and password protection.
wp_set_current_user($admin);
$draft = $new_post($admin, 'draft', 'DRAFT-HIDDEN-TITLE');
$save($draft, $doc_with('zzqdraftword'));
$res = $http('/?s=zzqdraftword');
$check('anonymous search does not find a draft projection', !str_contains($res['body'], 'DRAFT-HIDDEN-TITLE'));
$hidden = $new_post($admin, 'publish', 'Hidden node');
$raw = str_replace('{"text":"Secret"}', '{"text":"zzqhiddenword","visibility":false}', $doc_with('Secret'));
$check('hidden node document saves', $save($hidden, $raw)['code'] === 200);
$check('a hidden node stays out of post_content', !str_contains(get_post($hidden)->post_content, 'zzqhiddenword'));
$pw = (int) wp_insert_post(['post_type' => 'post', 'post_status' => 'publish', 'post_author' => $admin, 'post_title' => 'Password post', 'post_password' => wp_generate_password(16), 'post_content' => '']);
$save($pw, $doc_with('zzqpasswordword'));
wp_set_current_user(0);
$res = $http("/?p=$pw");
$check('password post: anonymous reader sees no document text', $res['status'] === 200 && !str_contains($res['body'], 'zzqpasswordword'));
wp_set_current_user(0);
$found = new WP_Query(['s' => 'zzqpasswordword', 'fields' => 'ids', 'post_status' => 'publish']);
$check('password post: anonymous WP_Query search does not find it', !in_array($pw, $found->posts, true), (string) wp_json_encode($found->posts) . ' ' . $found->request);
$res = $http('/?s=zzqpasswordword');
$control = $http('/?s=zzqnothingmatchesthis');
$observe('password_post_title_in_search_page', str_contains($res['body'], 'Password post'));
$observe('password_post_title_in_no_result_control_page', str_contains($control['body'], 'Password post'));
$check('password post: search page does not leak the document text in results', !preg_match('/<p[^>]*>[^<]*zzqpasswordword/', $res['body']));
$res = $http('/?feed=rss2');
$check('password post: feed does not leak it', !str_contains($res['body'], 'zzqpasswordword'));
$res = $http("/?rest_route=/wp/v2/posts/$pw");
$check('password post: core REST does not leak it', !str_contains($res['body'], 'zzqpasswordword'));
update_option('bdc_naive_password', '1');
$res = $http("/?p=$pw");
$observe('renderer_without_password_guard_leaks_document', str_contains($res['body'], 'zzqpasswordword'));
delete_option('bdc_naive_password');
wp_set_current_user($admin);

// ---- 9. Export and import.
$ex = $new_post($admin, 'publish', 'Export');
$save($ex, $tricky);
$envelope = blixis_doc_export(bdc_raw($ex));
$json = (string) json_encode($envelope);
$back = blixis_doc_import(json_decode($json, true));
$check('export envelope round-trips byte-exact', $back === $tricky);
$envelope['raw'] .= ' ';
$check('tampered envelope is refused', blixis_doc_import($envelope) === null);
$save($ex, $v1);
$check('import goes through the guarded write', bdc_save($ex, $back, bdc_token_for($v1))['code'] === 200 && bdc_raw($ex) === $tricky);
require_once ABSPATH . 'wp-admin/includes/export.php';
ob_start();
@export_wp(['content' => 'post']);
$wxr = (string) ob_get_clean();
$observe('wxr_export_bytes', strlen($wxr));
$xml = @simplexml_load_string($wxr);
$found = null;
foreach ($xml ? $xml->channel->item : [] as $item) {
    if ((int) $item->children('wp', true)->post_id === $ex) {
        foreach ($item->children('wp', true)->postmeta as $m) {
            if ((string) $m->meta_key === BDC_META) {
                $found = (string) $m->meta_value;
            }
        }
    }
}
$check('core WXR export carries the protected document byte-exact', $found === $tricky, $found === null ? 'not found' : substr($found, 0, 80));

// ---- 10. Cost of keeping documents in post meta.
$ids = [];
$sized = blixis_doc_generate(['generated' => 'pad-to-bytes', 'bytes' => 262144]);
wp_set_current_user($admin);
for ($i = 0; $i < 20; $i++) {
    $id = $new_post($admin, 'publish', "Perf $i");
    update_post_meta($id, BDC_META, wp_slash($sized));
    $ids[] = $id;
}
wp_cache_flush();
$m0 = memory_get_usage();
$t0 = microtime(true);
new WP_Query(['post__in' => $ids, 'posts_per_page' => 20, 'update_post_term_cache' => false]);
$observe('wp_query_20_posts_256KiB_docs_ms_and_MiB', [round((microtime(true) - $t0) * 1000, 1), round((memory_get_usage() - $m0) / 1048576, 1)]);
wp_cache_flush();
$m0 = memory_get_usage();
$t0 = microtime(true);
new WP_Query(['post__in' => $ids, 'posts_per_page' => 20, 'update_post_term_cache' => false, 'update_post_meta_cache' => false]);
$observe('same_query_without_meta_cache_ms_and_MiB', [round((microtime(true) - $t0) * 1000, 1), round((memory_get_usage() - $m0) / 1048576, 1)]);
$observe('revisions_to_keep_default', wp_revisions_to_keep(get_post($ids[0])));

// ---- Cross-review seam: user text in the projection against core's shortcode pass.
$probe_runs = 0;
add_shortcode('blixis_probe', static function () use (&$probe_runs): string {
    $probe_runs++;
    return 'SHORTCODE-RAN';
});
$content_of = static function (int $id) use ($admin): string {
    global $post;
    wp_set_current_user($admin);
    $post = get_post($id);
    setup_postdata($post);
    $out = (string) apply_filters('the_content', get_post($id)->post_content);
    wp_reset_postdata();
    return $out;
};
$text_doc = json_encode(['schemaVersion' => 1, 'documentId' => 'seam', 'root' => ['s'], 'nodes' => [
    's' => ['id' => 's', 'type' => 'blixis/section', 'version' => 1, 'props' => new stdClass(), 'children' => ['h']],
    'h' => ['id' => 'h', 'type' => 'blixis/heading', 'version' => 1, 'props' => ['text' => '[blixis_probe] AT&amp;T', 'level' => 2], 'children' => []],
], 'themeRef' => ['theme' => 'blixis-base', 'tokensVersion' => 1]]);
$seam = $new_post($admin, 'publish', 'Seam');
update_post_meta($seam, BDC_META, wp_slash($text_doc));

$raw_text = "<!-- wp:html -->\n<section><h2>[blixis_probe]</h2></section>\n<!-- /wp:html -->";
wp_update_post(['ID' => $seam, 'post_content' => wp_slash($raw_text)]);
$probe_runs = 0;
$seam_out = $content_of($seam);
$observe('unescaped_projection_runs_shortcode_before_late_renderer', $probe_runs > 0);
$check('finding: an unescaped projection runs shortcodes although the late renderer discards the result', $probe_runs > 0);
$check('late renderer output carries no shortcode result', !str_contains($seam_out, 'SHORTCODE-RAN'), $seam_out);

$projection = bdc_project_content(json_decode($text_doc), 'html-block');
wp_update_post(['ID' => $seam, 'post_content' => wp_slash($projection)]);
$probe_runs = 0;
$seam_out = $content_of($seam);
$check('escaped projection: no shortcode runs with the renderer active', $probe_runs === 0, (string) $probe_runs);
$check('renderer: entity in user text stays literal', str_contains($seam_out, 'AT&amp;amp;T'), $seam_out);
$check('renderer: shortcode text reaches the page literally', str_contains($seam_out, '[blixis_probe]'), $seam_out);

delete_post_meta($seam, BDC_META);
$probe_runs = 0;
$fallback = $content_of($seam);
$check('escaped projection: no shortcode runs in fallback without a document', $probe_runs === 0, (string) $probe_runs);
$check('fallback: text decodes to the literal shortcode', str_contains(html_entity_decode($fallback, ENT_QUOTES), '[blixis_probe]'), $fallback);
$kses_projection = wp_kses_post($projection);
$observe('kses_projection', $kses_projection);
$check('escaped projection stays inert after kses, for authors without unfiltered_html', !str_contains($kses_projection, '[blixis_probe]') && str_contains(html_entity_decode($kses_projection, ENT_QUOTES), '[blixis_probe]'), $kses_projection);

echo "CONTRACT_RESULT pass=$pass fail=$fail\n";
