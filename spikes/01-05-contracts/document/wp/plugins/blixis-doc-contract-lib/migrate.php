<?php
// Throwaway proof for task 01-05. TypeScript twin: document/migrate.ts. No WordPress calls here.
// Schema v2 is HYPOTHETICAL. It exists only to exercise the migration boundary.

declare(strict_types=1);

function blixis_doc_canonical(mixed $v): string
{
    if (is_array($v)) {
        return '[' . implode(',', array_map('blixis_doc_canonical', $v)) . ']';
    }
    if ($v instanceof stdClass) {
        $keys = blixis_doc_keys($v);
        usort($keys, 'strcmp');
        $parts = [];
        foreach ($keys as $k) {
            $parts[] = blixis_doc_canonical($k) . ':' . blixis_doc_canonical($v->{$k});
        }
        return '{' . implode(',', $parts) . '}';
    }
    if (is_float($v) && floor($v) === $v && abs($v) < 9007199254740992.0) {
        return (string) (int) $v;
    }
    return (string) json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_LINE_TERMINATORS);
}

function blixis_doc_migrate_v1_to_v2(stdClass $doc): stdClass
{
    $theme = $doc->themeRef ?? null;
    if (!$theme instanceof stdClass || !(is_int($theme->tokensVersion ?? null) || is_float($theme->tokensVersion ?? null))) {
        throw new RuntimeException('themeRef.tokensVersion is required');
    }
    if (!($doc->nodes ?? null) instanceof stdClass) {
        throw new RuntimeException('nodes must be an object');
    }
    $nodes = new stdClass();
    foreach (blixis_doc_keys($doc->nodes) as $id) {
        $node = $doc->nodes->{$id};
        if (!$node instanceof stdClass) {
            throw new RuntimeException('node must be an object');
        }
        $next = new stdClass();
        foreach (blixis_doc_keys($node) as $k) {
            $next->{$k === 'responsive' ? 'overrides' : $k} = $node->{$k};
        }
        $nodes->{$id} = $next;
    }
    return (object) [
        'schemaVersion' => 2,
        'documentId' => $doc->documentId ?? null,
        'root' => $doc->root ?? null,
        'nodes' => $nodes,
        'themeRef' => (object) ['theme' => $theme->theme ?? null, 'tokens' => (object) ['version' => $theme->tokensVersion]],
    ];
}

function blixis_doc_migrate_v2_to_v1(stdClass $doc): stdClass
{
    $nodes = new stdClass();
    foreach (blixis_doc_keys($doc->nodes) as $id) {
        $next = new stdClass();
        foreach (blixis_doc_keys($doc->nodes->{$id}) as $k) {
            $next->{$k === 'overrides' ? 'responsive' : $k} = $doc->nodes->{$id}->{$k};
        }
        $nodes->{$id} = $next;
    }
    return (object) [
        'schemaVersion' => 1,
        'documentId' => $doc->documentId,
        'root' => $doc->root,
        'nodes' => $nodes,
        'themeRef' => (object) ['theme' => $doc->themeRef->theme, 'tokensVersion' => $doc->themeRef->tokens->version],
    ];
}

/** @return array{ok: bool, code: ?string, output: ?stdClass} */
function blixis_doc_migrate(mixed $doc, int $target): array
{
    if (!$doc instanceof stdClass || !blixis_doc_is_int($doc->schemaVersion ?? null)) {
        return ['ok' => false, 'code' => 'invalid_schema_version', 'output' => null];
    }
    $version = (int) $doc->schemaVersion;
    if ($version > $target) {
        return ['ok' => false, 'code' => 'unsupported_schema_version', 'output' => null];
    }
    $steps = [1 => 'blixis_doc_migrate_v1_to_v2'];
    $current = $doc;
    while ($version < $target) {
        if (!isset($steps[$version])) {
            return ['ok' => false, 'code' => 'no_migration_path', 'output' => null];
        }
        try {
            $current = $steps[$version]($current);
        } catch (Throwable) {
            return ['ok' => false, 'code' => 'migration_failed', 'output' => null];
        }
        $version++;
    }
    return ['ok' => true, 'code' => null, 'output' => $current];
}

/** @return array{format: string, exportVersion: int, raw: string, sha256: string} */
function blixis_doc_export(string $bytes): array
{
    return ['format' => 'blixis-document-export', 'exportVersion' => 1, 'raw' => $bytes, 'sha256' => hash('sha256', $bytes)];
}

/** @param array<string, mixed> $envelope */
function blixis_doc_import(array $envelope): ?string
{
    $raw = $envelope['raw'] ?? null;
    return is_string($raw) && ($envelope['format'] ?? '') === 'blixis-document-export' && hash('sha256', $raw) === ($envelope['sha256'] ?? '') ? $raw : null;
}
