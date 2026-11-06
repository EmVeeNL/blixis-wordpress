// Builds the text bundle of docs/contracts/tokens/v1 used by the PHP code.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { CONTRACT, REPO_ROOT, SPIKE_TOKENS } from "./contract.ts";

export const BUNDLE_PATH = join(SPIKE_TOKENS, "wp/plugins/blixis-tokens-lib/contract-bundle.json");

export function buildBundle(): Record<string, string> {
  const out: Record<string, string> = {};
  const names = readdirSync(CONTRACT, { recursive: true, encoding: "utf8" }).sort();
  for (const name of names) {
    const path = join(CONTRACT, name);
    if (!/\.(json|css)$/.test(name)) continue;
    out[relative(CONTRACT, path).split("\\").join("/")] = readFileSync(path, "utf8");
  }
  return out;
}

export const THEMES_PATH = join(SPIKE_TOKENS, "wp/fixture-themes.json");
const CHILD_STYLE = `/*
Theme Name: Blixis Starter Proof
Template: blixis-base
Version: 0.0.0
Description: Disposable child theme for the 01-05 token proof.
*/
`;
const CHILD_SINGULAR = `<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} -->
<main class="wp-block-group">
<!-- wp:post-title /-->
<!-- wp:post-content /-->
</main>
<!-- /wp:group -->
`;

// Base is the real repository theme, so a change to it shows up in the WordPress proof.
export function buildThemes(): Record<string, string> {
  const out: Record<string, string> = {};
  const source = join(REPO_ROOT, "themes/blixis-base");
  for (const name of readdirSync(source, { recursive: true, encoding: "utf8" }).sort()) {
    if (name.includes(".")) {
      out[`blixis-base/${name}`] = readFileSync(join(source, name), "utf8");
    }
  }
  out["blixis-starter/style.css"] = CHILD_STYLE;
  out["blixis-starter/templates/singular.html"] = CHILD_SINGULAR;
  return out;
}
