import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { contrastRatio, validateText } from "../src/index.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const root = resolve(repo, "plugins/blixis-blocks/inc/setup/presets");
const ratio = (a: string, b: string) => contrastRatio(a, b);
void test("all shipped token presets validate and meet WCAG contrast", () => {
  const files = readdirSync(root)
    .filter((file) => file.endsWith(".json"))
    .sort();
  assert.deepEqual(files, [
    "bold.json",
    "fresh.json",
    "minimal.json",
    "neutral.json",
    "night.json",
    "warm.json",
  ]);
  for (const file of files) {
    const config = JSON.parse(readFileSync(resolve(root, file), "utf8"));
    const bytes = JSON.stringify(config);
    const result = validateText(bytes);
    assert.equal(result.ok, true, `${file}: ${JSON.stringify(result.errors)}`);
    const php = spawnSync(
      "php",
      [
        "-r",
        `define('ABSPATH', '/'); require '${resolve(repo, "plugins/blixis-blocks/inc/tokens/validate.php")}'; echo json_encode(\\Blixis\\Blocks\\Tokens\\validate_bytes(file_get_contents($argv[1])));`,
        resolve(root, file),
      ],
      { encoding: "utf8" },
    );
    assert.equal(php.status, 0, `${file}: PHP validator exited ${php.status}: ${php.stderr}`);
    assert.equal(JSON.parse(php.stdout).ok, true, `${file}: PHP validator rejected preset`);
    for (const palette of [config.colors, ...(config.colorsDark ? [config.colorsDark] : [])]) {
      assert.ok(ratio(palette.muted, palette.surface)! >= 4.5, `${file} muted text contrast`);
      assert.ok(ratio(palette.foreground, palette.surface)! >= 4.5, `${file} body contrast`);
      assert.ok(ratio(palette.primary, palette.surface)! >= 4.5, `${file} link contrast`);
      assert.ok(
        Math.max(ratio("#ffffff", palette.accent) ?? 0, ratio("#111827", palette.accent) ?? 0) >=
          4.5,
        `${file} button contrast`,
      );
      assert.ok(ratio(palette.accent, palette.surface)! >= 3, `${file} interface contrast`);
    }
  }
});
