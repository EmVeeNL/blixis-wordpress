// The WordPress harness only ships tokens/wp, so the contract is bundled into the plugin.
// Run with: node tokens/scripts/sync-bundle.ts (from spikes/01-05-contracts).
import { writeFileSync } from "node:fs";
import { BUNDLE_PATH, THEMES_PATH, buildBundle, buildThemes } from "../src/bundle.ts";

const bundle = buildBundle();
writeFileSync(BUNDLE_PATH, `${JSON.stringify(bundle, null, 1)}\n`);
writeFileSync(THEMES_PATH, `${JSON.stringify(buildThemes(), null, 1)}\n`);
console.log(`bundled ${Object.keys(bundle).length} files`);
