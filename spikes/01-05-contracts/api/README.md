# API permission and draft-security proofs

Throwaway proofs for [task 01-05](../../../docs/roadmap/phases/01-discovery-foundation/05-architecture-contracts.md). They are not product code and no product package may depend on them. The stable contract is [`docs/contracts/api`](../../../docs/contracts/api/README.md); the findings are in the [review note](../../../docs/architecture/reviews/01-05-api.md).

`wp/contract/` is a copy of the contract JSON, because files reach the disposable container as a tar stream from this directory only. `contract.test.ts` fails if the copies differ.

```bash
# From spikes/01-05-contracts
wordpress/run.sh api                 # WordPress 7.1.4, PHP 8.4
wordpress/run.sh api 7.0.8 8.5
node --test "api/**/*.test.ts"       # offline contract check
```

`wp/plugins/blixis-contract-fixtures.php` holds probes and deliberately naive routes that measure a hazard. Its `wp_is_application_passwords_available` filter exists only because the harness has no TLS.
