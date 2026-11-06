<?php
// Throwaway proof for task 01-05. Runs the shared fixture bundle through the PHP code.
// TypeScript twin of the generators: document/fixtures.ts.

declare(strict_types=1);

/**
 * Reads the bundle. Files are stored as lists, content first, and become name => base64 maps here.
 *
 * @return array<string, mixed>
 */
function blixis_doc_load_bundle(string $path): array
{
    $bundle = json_decode((string) file_get_contents($path), true, 64, JSON_THROW_ON_ERROR);
    foreach (['valid', 'invalid', 'migrationFiles'] as $part) {
        $bundle[$part] = array_column($bundle[$part], 'b64', 'name');
    }
    return $bundle;
}

/** @param array<string, mixed> $c */
function blixis_doc_generate(array $c): string
{
    $theme = '"themeRef":{"theme":"blixis-base","tokensVersion":1}';
    $wrap = static fn (array $root, array $nodes): string => '{"schemaVersion":1,"documentId":"fixture","root":' . json_encode($root) . ',"nodes":{' . implode(',', $nodes) . '},' . $theme . '}';
    $node = static fn (string $id, string $type, string $props, array $children): string => '"' . $id . '":{"id":"' . $id . '","type":"' . $type . '","version":1,"props":' . $props . ',"children":' . json_encode($children) . '}';
    switch ($c['generated']) {
        case 'flat-nodes':
            $ids = [];
            for ($i = 0; $i < $c['count']; $i++) {
                $ids[] = "n$i";
            }
            return $wrap($ids, array_map(static fn (string $id): string => $node($id, 'blixis/section', '{}', []), $ids));
        case 'pad-to-bytes':
            $empty = '{"schemaVersion":1,"documentId":"fixture","root":[],"nodes":{},' . $theme . '}';
            return $empty . str_repeat(' ', $c['bytes'] - strlen($empty));
        case 'long-string':
            $size = $c['bytes'];
            $value = ($size % 2 === 1 ? 'a' : '') . str_repeat('é', intdiv($size, 2));
            return $wrap(['s'], [$node('s', 'blixis/section', '{}', ['p']), $node('p', 'blixis/paragraph', '{"text":"' . $value . '"}', [])]);
        case 'deep-chain':
            $nodes = [];
            $depth = $c['depth'];
            for ($i = 1; $i <= $depth; $i++) {
                $type = $i % 2 === 1 ? 'blixis/section' : 'blixis/container';
                $nodes[] = $node("n$i", $type, '{}', $i < $depth ? ['n' . ($i + 1)] : []);
            }
            return $wrap(['n1'], $nodes);
        case 'json-nesting':
            $inner = $c['depth'] - 1;
            return '{"schemaVersion":1,"x":' . str_repeat('[', $inner) . str_repeat(']', $inner) . '}';
        case 'text-repeat':
            return $wrap(['s'], [$node('s', 'blixis/section', '{}', ['p']), $node('p', 'blixis/paragraph', '{"text":"' . str_repeat($c['unit'], $c['count']) . '"}', [])]);
        case 'hex':
            return (string) hex2bin($c['hex']);
    }
    throw new InvalidArgumentException('Unknown generator');
}

/**
 * Every fixture through validator and migrator. Results use one key order so the TypeScript and
 * PHP result digests can be compared byte for byte.
 *
 * @param array<string, mixed> $bundle
 * @return array<string, mixed>
 */
function blixis_doc_run_bundle(array $bundle): array
{
    $registry = $bundle['registry'];
    $out = ['validate' => [], 'url' => [], 'preserve' => [], 'migrate' => []];
    $shape = static fn (array $r): array => ['status' => $r['status'], 'codes' => $r['codes'], 'errors' => $r['errors'], 'truncated' => $r['truncated'], 'preserved' => $r['preserved']];

    foreach ($bundle['valid'] as $name => $b64) {
        $out['validate']["valid/$name"] = $shape(blixis_doc_validate((string) base64_decode($b64), $registry));
    }
    foreach ($bundle['validGenerated'] as $c) {
        $out['validate']["valid/{$c['name']}"] = $shape(blixis_doc_validate(blixis_doc_generate($c), $registry));
    }
    foreach ($bundle['invalid'] as $name => $b64) {
        $out['validate']["invalid/$name"] = $shape(blixis_doc_validate((string) base64_decode($b64), $registry));
    }
    foreach ($bundle['invalidGenerated'] as $c) {
        $out['validate']["invalid/{$c['name']}"] = $shape(blixis_doc_validate(blixis_doc_generate($c), $registry));
    }
    foreach (['safe', 'unsafe'] as $kind) {
        foreach ($bundle['urlCases'][$kind] as $url) {
            $out['url'][] = [$url, blixis_doc_is_safe_url($url)];
        }
    }
    $file = static fn (string $name): string => (string) base64_decode($bundle['migrationFiles'][$name]);
    foreach ($bundle['preserve'] as $c) {
        $out['preserve'][$c['name']] = $shape(blixis_doc_validate($file($c['incoming']), $registry, $file($c['stored'])));
    }
    foreach ($bundle['migrate'] as $c) {
        $r = blixis_doc_migrate(json_decode($file($c['input'])), $c['target']);
        $out['migrate'][$c['name']] = ['ok' => $r['ok'], 'code' => $r['code'], 'canonical' => $r['output'] === null ? null : blixis_doc_canonical($r['output'])];
    }
    return $out;
}

/**
 * Compares results to the manifests.
 *
 * @param array<string, mixed> $bundle
 * @param array<string, mixed> $results
 * @return array<int, array{0: string, 1: bool, 2: string}>
 */
function blixis_doc_compare_bundle(array $bundle, array $results): array
{
    $checks = [];
    $expect = static function (string $key, string $status, array $codes) use (&$checks, $results): void {
        $r = $results['validate'][$key];
        $checks[] = [$key, $r['status'] === $status && $r['codes'] === $codes, $r['status'] . ' ' . implode(',', $r['codes'])];
    };
    foreach ($bundle['valid'] as $name => $_) {
        $expect("valid/$name", 'valid', []);
    }
    foreach ($bundle['validGenerated'] as $c) {
        $expect("valid/{$c['name']}", 'valid', []);
    }
    foreach ($bundle['invalidCases'] as $c) {
        $expect("invalid/{$c['file']}", $c['status'], $c['codes']);
    }
    foreach ($bundle['invalidGenerated'] as $c) {
        $expect("invalid/{$c['name']}", $c['status'], $c['codes']);
    }
    foreach ($bundle['preserve'] as $c) {
        $r = $results['preserve'][$c['name']];
        $checks[] = ["preserve/{$c['name']}", $r['status'] === $c['status'] && $r['codes'] === $c['codes'] && $r['preserved'] === $c['preserved'], $r['status']];
    }
    foreach ($bundle['urlCases']['safe'] as $url) {
        $checks[] = ['url safe ' . json_encode($url), blixis_doc_is_safe_url($url), ''];
    }
    foreach ($bundle['urlCases']['unsafe'] as $url) {
        $checks[] = ['url unsafe ' . json_encode($url), !blixis_doc_is_safe_url($url), ''];
    }
    foreach ($bundle['migrate'] as $c) {
        $r = $results['migrate'][$c['name']];
        if (isset($c['golden'])) {
            $golden = blixis_doc_canonical(json_decode((string) base64_decode($bundle['migrationFiles'][$c['golden']])));
            $checks[] = ["migrate/{$c['name']}", $r['ok'] && $r['canonical'] === $golden, (string) $r['code']];
        } else {
            $checks[] = ["migrate/{$c['name']}", !$r['ok'] && $r['code'] === $c['code'], (string) $r['code']];
        }
    }
    return $checks;
}

/** @param array<string, mixed> $results */
function blixis_doc_results_digest(array $results): string
{
    return hash('sha256', (string) json_encode($results, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_LINE_TERMINATORS));
}
