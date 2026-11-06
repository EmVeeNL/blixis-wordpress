// Lists the license of every installed package and flags anything unexpected.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const allowed = new Set([
  "MIT",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "MPL-2.0",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "Python-2.0",
]);
const seen = new Map<string, string>();
const direct = JSON.parse(readFileSync("package.json", "utf8"));
const names = new Set([
  ...Object.keys(direct.dependencies),
  ...Object.keys(direct.devDependencies),
]);
function walk(dir: string): void {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (entry.startsWith("@")) {
      walk(path);
      continue;
    }
    const manifest = join(path, "package.json");
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, "utf8"));
    seen.set(
      `${pkg.name}@${pkg.version}`,
      typeof pkg.license === "string"
        ? pkg.license
        : JSON.stringify(pkg.license ?? pkg.licenses ?? "UNKNOWN"),
    );
    if (existsSync(join(path, "node_modules"))) walk(join(path, "node_modules"));
  }
}
walk("node_modules");
// pnpm keeps transitive packages in the workspace root's virtual store.
const store = join("..", "..", "..", "node_modules", ".pnpm");
if (existsSync(store)) {
  for (const entry of readdirSync(store)) {
    const modules = join(store, entry, "node_modules");
    if (existsSync(modules)) walk(modules);
  }
}
const counts: Record<string, number> = {};
for (const license of seen.values()) counts[license] = (counts[license] ?? 0) + 1;
console.log("Direct:");
for (const [id, license] of [...seen].sort(([a], [b]) => a.localeCompare(b))) {
  const name = id.slice(0, id.lastIndexOf("@"));
  if (names.has(name)) console.log(`  ${id}: ${license}`);
}
console.log(`All ${seen.size} installed packages:`, counts);
const flagged = [...seen].filter(([, license]) => !allowed.has(license));
console.log("Flagged:", flagged);
process.exit(flagged.length ? 1 : 0);
