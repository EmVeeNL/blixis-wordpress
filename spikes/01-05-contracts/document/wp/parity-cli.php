<?php
// Throwaway proof for task 01-05. Local parity entry point: prints the PHP results as JSON.
declare(strict_types=1);
require __DIR__ . '/plugins/blixis-doc-contract-lib/validator.php';
require __DIR__ . '/plugins/blixis-doc-contract-lib/migrate.php';
require __DIR__ . '/plugins/blixis-doc-contract-lib/fixtures.php';
$bundle = blixis_doc_load_bundle($argv[1] ?? __DIR__ . '/bundle.json');
$results = blixis_doc_run_bundle($bundle);
echo json_encode(
    ['results' => $results, 'digest' => blixis_doc_results_digest($results), 'limits' => BLIXIS_DOC_LIMITS, 'checks' => blixis_doc_compare_bundle($bundle, $results)],
    JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_LINE_TERMINATORS | JSON_THROW_ON_ERROR
) . "\n";
