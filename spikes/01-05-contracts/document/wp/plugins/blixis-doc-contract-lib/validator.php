<?php
// Throwaway proof for task 01-05. TypeScript twin: document/validator.ts. No WordPress calls here.
// Objects stay stdClass on purpose: associative decoding collapses {} and [] and turns "1" into 1.

declare(strict_types=1);

const BLIXIS_DOC_LIMITS = [
    'maxBytes' => 1048576,
    'maxJsonNesting' => 32,
    'maxNodes' => 2000,
    'maxDepth' => 16,
    'maxStringBytes' => 65536,
    'maxErrors' => 100,
];
const BLIXIS_DOC_CURRENT = 1;
const BLIXIS_DOC_BREAKPOINTS = ['sm', 'md', 'lg', 'xl'];
const BLIXIS_DOC_TOP = ['schemaVersion', 'documentId', 'root', 'nodes', 'themeRef'];
const BLIXIS_DOC_NODE = ['id', 'type', 'version', 'props', 'responsive', 'children', 'locked'];
const BLIXIS_DOC_FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];
const BLIXIS_DOC_FORBIDDEN_PROPS = ['html', 'innerhtml', 'outerhtml', 'dangerouslysetinnerhtml', 'script', 'style', 'css', 'class', 'classname', 'srcdoc'];
const BLIXIS_DOC_WP_OWNED = ['ID', 'id', 'title', 'slug', 'status', 'author', 'date', 'modified', 'excerpt', 'password', 'parent', 'menu_order', 'template', 'meta', 'guid', 'comment_status', 'ping_status', 'post_title', 'post_name', 'post_status', 'post_author', 'post_date', 'post_date_gmt', 'post_modified', 'post_modified_gmt', 'post_content', 'post_excerpt', 'post_password', 'post_parent', 'post_type'];
const BLIXIS_DOC_PRESERVE = ['unsupported_schema_version', 'unsupported_element_version', 'unknown_element_type'];
const BLIXIS_DOC_URL_SCHEMES = ['http', 'https', 'mailto', 'tel'];

function blixis_doc_is_int(mixed $v): bool
{
    if (is_int($v)) {
        return abs($v) <= 9007199254740991;
    }
    return is_float($v) && is_finite($v) && floor($v) === $v && abs($v) <= 9007199254740991.0;
}

function blixis_doc_raw_nesting(string $text): int
{
    $depth = 0;
    $max = 0;
    $in = false;
    $n = strlen($text);
    for ($i = 0; $i < $n; $i++) {
        $c = $text[$i];
        if ($in) {
            if ($c === '\\') {
                $i++;
            } elseif ($c === '"') {
                $in = false;
            }
        } elseif ($c === '"') {
            $in = true;
        } elseif ($c === '{' || $c === '[') {
            $max = max($max, ++$depth);
        } elseif ($c === '}' || $c === ']') {
            $depth--;
        }
    }
    return $max;
}

/** @return array{duplicate: bool, nulKey: bool} */
function blixis_doc_scan_keys(string $text): array
{
    $stack = [];
    $duplicate = false;
    $nul = false;
    $n = strlen($text);
    for ($i = 0; $i < $n; $i++) {
        $c = $text[$i];
        if ($c === '"') {
            $start = $i++;
            while ($text[$i] !== '"') {
                $i += $text[$i] === '\\' ? 2 : 1;
            }
            $next = $i + 1;
            while ($next < $n && strpos(" \t\r\n", $text[$next]) !== false) {
                $next++;
            }
            $top = count($stack) - 1;
            if ($next < $n && $text[$next] === ':' && $top >= 0 && is_array($stack[$top])) {
                $key = json_decode(substr($text, $start, $i - $start + 1));
                if (is_string($key)) {
                    if ($key !== '' && $key[0] === "\0") {
                        $nul = true;
                    }
                    if (isset($stack[$top]['k' . $key])) {
                        $duplicate = true;
                    }
                    $stack[$top]['k' . $key] = true;
                }
            }
        } elseif ($c === '{') {
            $stack[] = [];
        } elseif ($c === '[') {
            $stack[] = null;
        } elseif ($c === '}' || $c === ']') {
            array_pop($stack);
        }
    }
    return ['duplicate' => $duplicate, 'nulKey' => $nul];
}

function blixis_doc_pointer(string $part): string
{
    return str_replace(['~', '/'], ['~0', '~1'], $part);
}

/** @return array<int, string> Object keys as strings. get_object_vars() would turn "1" into 1. */
function blixis_doc_keys(stdClass $o): array
{
    return array_map('strval', array_keys(get_object_vars($o)));
}

function blixis_doc_has(stdClass $o, string $k): bool
{
    return property_exists($o, $k);
}

function blixis_doc_deep_equal(mixed $a, mixed $b): bool
{
    if (is_array($a)) {
        if (!is_array($b) || count($a) !== count($b)) {
            return false;
        }
        foreach ($a as $i => $item) {
            if (!blixis_doc_deep_equal($item, $b[$i])) {
                return false;
            }
        }
        return true;
    }
    if ($a instanceof stdClass) {
        if (!$b instanceof stdClass) {
            return false;
        }
        $keys = blixis_doc_keys($a);
        if (count($keys) !== count(blixis_doc_keys($b))) {
            return false;
        }
        foreach ($keys as $k) {
            if (!blixis_doc_has($b, $k) || !blixis_doc_deep_equal($a->{$k}, $b->{$k})) {
                return false;
            }
        }
        return true;
    }
    if ((is_int($a) || is_float($a)) && (is_int($b) || is_float($b))) {
        return (float) $a === (float) $b;
    }
    return $a === $b;
}

function blixis_doc_is_safe_url(string $url): bool
{
    if ($url === '') {
        return true;
    }
    if (preg_match('/[\x00-\x20\x7f]/', $url) === 1 || str_contains($url, '\\') || str_starts_with($url, '//')) {
        return false;
    }
    if ($url[0] === '/' || $url[0] === '#' || $url[0] === '?') {
        return true;
    }
    if (preg_match('/^([a-zA-Z][a-zA-Z0-9+.\-]*):/', $url, $m) === 1) {
        return in_array(strtolower($m[1]), BLIXIS_DOC_URL_SCHEMES, true);
    }
    $first = preg_split('/[\/?]/', $url, 2)[0] ?? '';
    return !str_contains($first, ':');
}

function blixis_doc_has_markup(string $t): bool
{
    // A preg failure returns false, so anything but 0 counts as markup: fail closed.
    return preg_match('/<(?:\/?[a-zA-Z][a-zA-Z0-9\-]*(?:\s+[a-zA-Z_:@][^<>]*|\s*\/?)?>|[!?][^<>]*>)/', $t) !== 0
        || preg_match('/<(?:script|style|iframe|object|embed|svg|math)\b/i', $t) !== 0;
}

final class Blixis_Doc_Run
{
    /** @var array<int, array{code: string, path: string}> */
    public array $errors = [];

    public function add(string $code, string $path): void
    {
        $this->errors[] = ['code' => $code, 'path' => $path];
    }

    public function walk_forbidden(mixed $value, string $path): void
    {
        if (is_array($value)) {
            foreach ($value as $i => $item) {
                $this->walk_forbidden($item, "$path/$i");
            }
        } elseif ($value instanceof stdClass) {
            foreach (blixis_doc_keys($value) as $k) {
                $child = $path . '/' . blixis_doc_pointer($k);
                if (in_array($k, BLIXIS_DOC_FORBIDDEN_KEYS, true)) {
                    $this->add('forbidden_key', $child);
                } else {
                    $this->walk_forbidden($value->{$k}, $child);
                }
            }
        }
    }

    public function text(mixed $v, string $path): void
    {
        if (!is_string($v)) {
            $this->add('invalid_prop_value', $path);
        } elseif (strlen($v) > BLIXIS_DOC_LIMITS['maxStringBytes']) {
            $this->add('string_too_long', $path);
        } elseif (blixis_doc_has_markup($v)) {
            $this->add('html_in_text', $path);
        }
    }

    /** @param array<string, mixed> $d */
    public function value(array $d, mixed $v, string $path): void
    {
        switch ($d['kind']) {
            case 'text':
                $this->text($v, $path);
                return;
            case 'textList':
                if (!is_array($v) || count($v) > 200) {
                    $this->add('invalid_prop_value', $path);
                    return;
                }
                foreach ($v as $i => $item) {
                    $this->text($item, "$path/$i");
                }
                return;
            case 'items':
                if (!is_array($v) || count($v) > 200) {
                    $this->add('invalid_prop_value', $path);
                    return;
                }
                foreach ($v as $i => $item) {
                    $ip = "$path/$i";
                    if (!$item instanceof stdClass) {
                        $this->add('invalid_prop_value', $ip);
                        continue;
                    }
                    foreach (blixis_doc_keys($item) as $k) {
                        if (in_array($k, BLIXIS_DOC_FORBIDDEN_KEYS, true)) {
                            continue;
                        }
                        $child = $ip . '/' . blixis_doc_pointer($k);
                        if (in_array($k, $d['fields'], true)) {
                            $this->text($item->{$k}, $child);
                        } else {
                            $this->unknown_prop($k, $child);
                        }
                    }
                }
                return;
            case 'token':
                if (!is_string($v) || preg_match('/^[A-Za-z0-9][A-Za-z0-9_.:\/\-]{0,63}$/D', $v) !== 1) {
                    $this->add('invalid_prop_value', $path);
                }
                return;
            case 'iconId':
                if (!is_string($v) || preg_match('/^[a-z0-9\-]+:[a-z0-9\-]+$/D', $v) !== 1) {
                    $this->add('invalid_prop_value', $path);
                }
                return;
            case 'url':
                if (!is_string($v)) {
                    $this->add('invalid_prop_value', $path);
                } elseif (strlen($v) > 2048 || !blixis_doc_is_safe_url($v)) {
                    $this->add('unsafe_url', $path);
                }
                return;
            case 'bool':
                if (!is_bool($v)) {
                    $this->add('invalid_prop_value', $path);
                }
                return;
            case 'ref':
                if ($v !== null && !(blixis_doc_is_int($v) && $v > 0)) {
                    $this->add('invalid_prop_value', $path);
                }
                return;
            case 'int':
                if (!blixis_doc_is_int($v) || $v < $d['min'] || $v > $d['max']) {
                    $this->add('invalid_prop_value', $path);
                }
                return;
            case 'enum':
                if (!is_string($v) || !in_array($v, $d['values'], true)) {
                    $this->add('invalid_prop_value', $path);
                }
                return;
        }
    }

    public function forbidden_name(string $k): bool
    {
        return in_array(strtolower($k), BLIXIS_DOC_FORBIDDEN_PROPS, true) || preg_match('/^on[a-z]+$/iD', $k) === 1;
    }

    public function unknown_prop(string $k, string $path): void
    {
        $this->add($this->forbidden_name($k) ? 'forbidden_prop' : 'unknown_prop', $path);
    }

    /** @param array<string, mixed> $el */
    public function props(array $el, stdClass $props, string $path): void
    {
        foreach (blixis_doc_keys($props) as $k) {
            if (in_array($k, BLIXIS_DOC_FORBIDDEN_KEYS, true)) {
                continue;
            }
            $child = $path . '/' . blixis_doc_pointer($k);
            if (isset($el['props'][$k])) {
                $this->value($el['props'][$k], $props->{$k}, $child);
            } elseif ($k === 'visibility') {
                $this->value(['kind' => 'bool'], $props->{$k}, $child);
            } elseif (in_array($k, $el['responsive'], true)) {
                $this->value(['kind' => 'token'], $props->{$k}, $child);
            } else {
                $this->unknown_prop($k, $child);
            }
        }
    }

    /** @param array<string, mixed> $el */
    public function responsive(array $el, stdClass $r, string $path): void
    {
        foreach (blixis_doc_keys($r) as $bp) {
            if (in_array($bp, BLIXIS_DOC_FORBIDDEN_KEYS, true)) {
                continue;
            }
            $bpp = $path . '/' . blixis_doc_pointer($bp);
            if (!in_array($bp, BLIXIS_DOC_BREAKPOINTS, true)) {
                $this->add('unknown_breakpoint', $bpp);
                continue;
            }
            $over = $r->{$bp};
            if (!$over instanceof stdClass) {
                $this->add('invalid_responsive', $bpp);
                continue;
            }
            foreach (blixis_doc_keys($over) as $k) {
                if (in_array($k, BLIXIS_DOC_FORBIDDEN_KEYS, true)) {
                    continue;
                }
                $child = $bpp . '/' . blixis_doc_pointer($k);
                if (in_array($k, $el['responsive'], true)) {
                    $d = $el['props'][$k] ?? ($k === 'visibility' ? ['kind' => 'bool'] : ['kind' => 'token']);
                    $this->value($d, $over->{$k}, $child);
                } elseif ($this->forbidden_name($k)) {
                    $this->add('forbidden_prop', $child);
                } else {
                    $this->add('unknown_responsive_prop', $child);
                }
            }
        }
    }
}

/**
 * @param array<int, string> $preserved
 * @return array{status: string, codes: array<int, string>, errors: array<int, array{code: string, path: string}>, truncated: bool, preserved: array<int, string>}
 */
function blixis_doc_finish(Blixis_Doc_Run $run, array $preserved = []): array
{
    $errors = $run->errors;
    usort($errors, static fn (array $a, array $b): int => strcmp($a['path'], $b['path']) ?: strcmp($a['code'], $b['code']));
    $unique = [];
    foreach ($errors as $e) {
        $last = end($unique);
        if ($last === false || $last['code'] !== $e['code'] || $last['path'] !== $e['path']) {
            $unique[] = $e;
        }
    }
    $blocking = false;
    $codes = [];
    foreach ($unique as $e) {
        $codes[$e['code']] = true;
        if (!in_array($e['code'], BLIXIS_DOC_PRESERVE, true)) {
            $blocking = true;
        }
    }
    $codes = array_map('strval', array_keys($codes));
    sort($codes, SORT_STRING);
    usort($preserved, 'strcmp');
    return [
        'status' => $unique === [] ? 'valid' : ($blocking ? 'rejected' : 'preserve'),
        'codes' => $codes,
        'errors' => array_slice($unique, 0, BLIXIS_DOC_LIMITS['maxErrors']),
        'truncated' => count($unique) > BLIXIS_DOC_LIMITS['maxErrors'],
        'preserved' => $preserved,
    ];
}

/** @return array{status: string, codes: array<int, string>, errors: array<int, array{code: string, path: string}>, truncated: bool, preserved: array<int, string>} */
function blixis_doc_fatal(string $code, string $path = ''): array
{
    $run = new Blixis_Doc_Run();
    $run->add($code, $path);
    return blixis_doc_finish($run);
}

/**
 * @param array<string, array<string, mixed>> $registry
 * @return array{status: string, codes: array<int, string>, errors: array<int, array{code: string, path: string}>, truncated: bool, preserved: array<int, string>}
 */
function blixis_doc_validate(string $bytes, array $registry, ?string $stored = null, int $reader = BLIXIS_DOC_CURRENT): array
{
    if (strlen($bytes) > BLIXIS_DOC_LIMITS['maxBytes']) {
        return blixis_doc_fatal('document_too_large');
    }
    if (blixis_doc_raw_nesting($bytes) > BLIXIS_DOC_LIMITS['maxJsonNesting']) {
        return blixis_doc_fatal('json_nesting_exceeded');
    }
    $doc = json_decode($bytes, false, 64);
    if (json_last_error() !== JSON_ERROR_NONE) {
        return blixis_doc_fatal('invalid_json');
    }
    $keys = blixis_doc_scan_keys($bytes);
    if ($keys['nulKey']) {
        return blixis_doc_fatal('invalid_json');
    }
    if ($keys['duplicate']) {
        return blixis_doc_fatal('duplicate_key');
    }
    if (!$doc instanceof stdClass) {
        return blixis_doc_fatal('not_object');
    }

    $run = new Blixis_Doc_Run();
    $run->walk_forbidden($doc, '');

    if (!blixis_doc_has($doc, 'schemaVersion')) {
        $run->add('missing_field', '/schemaVersion');
    } elseif (!blixis_doc_is_int($doc->schemaVersion) || $doc->schemaVersion < 1) {
        $run->add('invalid_schema_version', '/schemaVersion');
    } elseif ($doc->schemaVersion > $reader) {
        return blixis_doc_fatal('unsupported_schema_version', '/schemaVersion');
    }

    foreach (blixis_doc_keys($doc) as $k) {
        if (in_array($k, BLIXIS_DOC_FORBIDDEN_KEYS, true) || in_array($k, BLIXIS_DOC_TOP, true)) {
            continue;
        }
        $run->add(in_array($k, BLIXIS_DOC_WP_OWNED, true) ? 'wp_owned_field' : 'unknown_top_level_field', '/' . blixis_doc_pointer($k));
    }
    foreach (['documentId', 'root', 'nodes', 'themeRef'] as $k) {
        if (!blixis_doc_has($doc, $k)) {
            $run->add('missing_field', "/$k");
        }
    }
    if (blixis_doc_has($doc, 'documentId') && (!is_string($doc->documentId) || preg_match('/^[A-Za-z0-9][A-Za-z0-9_\-]{0,127}$/D', $doc->documentId) !== 1)) {
        $run->add('invalid_document_id', '/documentId');
    }
    if (blixis_doc_has($doc, 'themeRef')) {
        $ref = $doc->themeRef;
        $ok = $ref instanceof stdClass
            && array_diff(blixis_doc_keys($ref), ['theme', 'tokensVersion']) === []
            && is_string($ref->theme ?? null)
            && preg_match('/^[a-z0-9][a-z0-9\-]{0,63}$/D', $ref->theme) === 1
            && blixis_doc_is_int($ref->tokensVersion ?? null)
            && $ref->tokensVersion >= 1;
        if (!$ok) {
            $run->add('invalid_theme_ref', '/themeRef');
        }
    }

    $root = blixis_doc_has($doc, 'root') ? $doc->root : null;
    $nodes = blixis_doc_has($doc, 'nodes') ? $doc->nodes : null;
    if (blixis_doc_has($doc, 'root') && !is_array($root)) {
        $run->add('invalid_root', '/root');
    }
    if (blixis_doc_has($doc, 'nodes') && !$nodes instanceof stdClass) {
        $run->add('invalid_nodes', '/nodes');
    }
    if (!is_array($root) || !$nodes instanceof stdClass) {
        return blixis_doc_finish($run);
    }

    $all = array_values(array_diff(blixis_doc_keys($nodes), BLIXIS_DOC_FORBIDDEN_KEYS));
    usort($all, 'strcmp');
    if (count($all) > BLIXIS_DOC_LIMITS['maxNodes']) {
        return blixis_doc_fatal('too_many_nodes', '/nodes');
    }

    $stored_nodes = null;
    if ($stored !== null) {
        $decoded = json_decode($stored, false, 64);
        if ($decoded instanceof stdClass && ($decoded->nodes ?? null) instanceof stdClass) {
            $stored_nodes = $decoded->nodes;
        }
    }
    $preserved = [];
    $children = [];
    $type_of = [];

    foreach ($all as $id) {
        $path = '/nodes/' . blixis_doc_pointer($id);
        $node = $nodes->{$id};
        $key = 'k' . $id;
        if (preg_match('/^[A-Za-z][A-Za-z0-9_\-]{0,63}$/D', $id) !== 1) {
            $run->add('invalid_node_id', $path);
        }
        if (!$node instanceof stdClass) {
            $run->add('invalid_node', $path);
            $children[$key] = [];
            continue;
        }
        foreach (blixis_doc_keys($node) as $k) {
            if (!in_array($k, BLIXIS_DOC_FORBIDDEN_KEYS, true) && !in_array($k, BLIXIS_DOC_NODE, true)) {
                $run->add('unknown_node_field', $path . '/' . blixis_doc_pointer($k));
            }
        }
        foreach (['id', 'type', 'version', 'props', 'children'] as $k) {
            if (!blixis_doc_has($node, $k)) {
                $run->add('missing_field', "$path/$k");
            }
        }
        if (blixis_doc_has($node, 'id') && $node->id !== $id) {
            $run->add('id_key_mismatch', "$path/id");
        }
        if (blixis_doc_has($node, 'locked') && !is_bool($node->locked)) {
            $run->add('invalid_node_field', "$path/locked");
        }

        $list = [];
        if (blixis_doc_has($node, 'children')) {
            if (is_array($node->children)) {
                foreach ($node->children as $i => $child) {
                    if (is_string($child)) {
                        $list[] = $child;
                    } else {
                        $run->add('invalid_children', "$path/children/$i");
                    }
                }
            } else {
                $run->add('invalid_children', "$path/children");
            }
        }
        $children[$key] = $list;

        $has_type = blixis_doc_has($node, 'type');
        $has_version = blixis_doc_has($node, 'version');
        $type = $node->type ?? null;
        $version = $node->version ?? null;
        if (blixis_doc_has($node, 'props') && !$node->props instanceof stdClass) {
            $run->add('non_object_props', "$path/props");
        }
        if (blixis_doc_has($node, 'responsive') && !$node->responsive instanceof stdClass) {
            $run->add('invalid_responsive', "$path/responsive");
        }
        if ($has_type && (!is_string($type) || preg_match('/^[a-z0-9\-]+\/[a-z0-9\-]+$/D', $type) !== 1)) {
            $run->add('invalid_type', "$path/type");
            continue;
        }
        if ($has_version && (!blixis_doc_is_int($version) || $version < 1)) {
            $run->add('invalid_version', "$path/version");
            continue;
        }
        if (!$has_type || !$has_version) {
            continue;
        }

        $element = $registry[$type] ?? null;
        if ($element === null || $element['version'] !== (int) $version) {
            $carried = $stored_nodes !== null && blixis_doc_has($stored_nodes, $id) && blixis_doc_deep_equal($stored_nodes->{$id}, $node);
            if ($carried) {
                $preserved[] = $id;
            } elseif ($element === null) {
                $run->add('unknown_element_type', "$path/type");
            } else {
                $run->add('unsupported_element_version', "$path/version");
            }
            continue;
        }
        $type_of[$key] = $type;
        if (($node->props ?? null) instanceof stdClass) {
            $run->props($element, $node->props, "$path/props");
        }
        if (($node->responsive ?? null) instanceof stdClass) {
            $run->responsive($element, $node->responsive, "$path/responsive");
        }
    }

    // Graph: references and parents. Keys carry a "k" prefix so "1" stays a string in PHP arrays.
    $known = array_fill_keys(array_map(static fn (string $id): string => 'k' . $id, $all), true);
    $parents = [];
    $add_parent = static function (string $id) use (&$parents, $run): void {
        $key = 'k' . $id;
        $parents[$key] = ($parents[$key] ?? 0) + 1;
        if ($parents[$key] === 2) {
            $run->add('multiple_parents', '/nodes/' . blixis_doc_pointer($id));
        }
    };
    $roots = [];
    $seen = [];
    foreach ($root as $i => $id) {
        if (!is_string($id)) {
            $run->add('invalid_root', "/root/$i");
            continue;
        }
        if (isset($seen['k' . $id])) {
            $run->add('duplicate_root', "/root/$i");
            continue;
        }
        $seen['k' . $id] = true;
        if (!isset($known['k' . $id])) {
            $run->add('missing_reference', "/root/$i");
            continue;
        }
        $roots[] = $id;
        $add_parent($id);
        $t = $type_of['k' . $id] ?? null;
        if ($t !== null && !in_array('root', $registry[$t]['allowedParents'], true)) {
            $run->add('invalid_nesting', "/root/$i");
        }
    }
    $resolved = [];
    foreach ($all as $id) {
        $list = [];
        $pt = $type_of['k' . $id] ?? null;
        foreach ($children['k' . $id] ?? [] as $i => $child) {
            $path = '/nodes/' . blixis_doc_pointer($id) . "/children/$i";
            if (!isset($known['k' . $child])) {
                $run->add('missing_reference', $path);
                continue;
            }
            $list[] = $child;
            $add_parent($child);
            $ct = $type_of['k' . $child] ?? null;
            if (
                $pt !== null && $ct !== null
                && (!in_array($ct, $registry[$pt]['allowedChildren'], true) || !in_array($pt, $registry[$ct]['allowedParents'], true))
            ) {
                $run->add('invalid_nesting', $path);
            }
        }
        $resolved['k' . $id] = $list;
    }

    // Graph: cycles, with an explicit stack.
    $color = [];
    foreach ($all as $start) {
        if (isset($color['k' . $start])) {
            continue;
        }
        $stack = [[$start, 0]];
        $color['k' . $start] = 1;
        while ($stack !== []) {
            $top = count($stack) - 1;
            [$cur, $pos] = $stack[$top];
            $stack[$top][1] = $pos + 1;
            $next = $resolved['k' . $cur][$pos] ?? null;
            if ($next === null) {
                $color['k' . $cur] = 2;
                array_pop($stack);
            } elseif (($color['k' . $next] ?? 0) === 1) {
                $run->add('cycle', '/nodes/' . blixis_doc_pointer($cur) . '/children');
            } elseif (!isset($color['k' . $next])) {
                $color['k' . $next] = 1;
                $stack[] = [$next, 0];
            }
        }
    }

    // Graph: reachability and depth, breadth first.
    $reached = [];
    foreach ($roots as $id) {
        $reached['k' . $id] = true;
    }
    $level = $roots;
    $depth = 1;
    while ($level !== []) {
        $next_level = [];
        foreach ($level as $id) {
            if ($depth === BLIXIS_DOC_LIMITS['maxDepth'] + 1) {
                $run->add('depth_exceeded', '/nodes/' . blixis_doc_pointer($id));
            }
            foreach ($resolved['k' . $id] ?? [] as $child) {
                if (!isset($reached['k' . $child])) {
                    $reached['k' . $child] = true;
                    $next_level[] = $child;
                }
            }
        }
        $level = $next_level;
        $depth++;
    }
    foreach ($all as $id) {
        if (!isset($reached['k' . $id])) {
            $run->add('orphan_node', '/nodes/' . blixis_doc_pointer($id));
        }
    }

    return blixis_doc_finish($run, $preserved);
}
