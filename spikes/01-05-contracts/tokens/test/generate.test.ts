// Determinism, byte parity with the PHP generator, and config/CSS/theme.json token parity.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BUNDLE_PATH, THEMES_PATH, buildBundle, buildThemes } from "../src/bundle.ts";
import {
  CONTRACT,
  listFixtures,
  readContractJson,
  readFixtureBytes,
  tokenMap,
} from "../src/contract.ts";
import {
  canonicalJson,
  configHash,
  cssCacheKey,
  cssVariables,
  fragmentCacheKey,
  generateCss,
  generateThemeJson,
  pageCacheKey,
  type RenderKeyInput,
} from "../src/generate.ts";
import { runPhp } from "../src/php.ts";
import { tailwindThemeCss } from "../src/tailwind.ts";
import { type Config, validateBytes } from "../src/validate.ts";

type Row = {
  ok: boolean;
  css: string;
  themeJson: string;
  hash: string;
  cssKey: string;
  canonical: string;
};
const valid = listFixtures("valid");

function config(name: string): Config {
  const result = validateBytes(readFixtureBytes("valid", name));
  if (!result.ok) throw new Error(name);
  return result.config;
}
const phpRows = runPhp<Row[]>(
  "validate",
  valid.map((name) => Buffer.from(readFixtureBytes("valid", name)).toString("base64")),
);

void test("the PHP bundles match docs/contracts/tokens/v1 and themes/blixis-base byte for byte", () => {
  assert.deepEqual(JSON.parse(readFileSync(BUNDLE_PATH, "utf8")), buildBundle());
  assert.deepEqual(JSON.parse(readFileSync(THEMES_PATH, "utf8")), buildThemes());
});

void test("theme bundles include dotted asset directories but exclude installed dependencies", () => {
  const fixture = mkdtempSync(join(tmpdir(), "blixis-theme-bundle-"));
  try {
    mkdirSync(join(fixture, "assets.v1"));
    mkdirSync(join(fixture, "node_modules", ".bin"), { recursive: true });
    writeFileSync(join(fixture, "assets.v1", "style.css"), ".fixture{}");
    writeFileSync(join(fixture, "node_modules", ".bin", "compiler"), "dependency");
    const bundle = buildThemes(fixture);
    assert.equal(bundle["blixis-base/assets.v1/style.css"], ".fixture{}");
    assert.ok(!Object.keys(bundle).some((name) => name.includes("node_modules")));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

void test("CSS is byte-identical across TypeScript and PHP for every valid fixture", () => {
  valid.forEach((name, index) => {
    const row = phpRows[index] as Row;
    const local = config(name);
    assert.equal(generateCss(local), row.css, name);
    assert.equal(canonicalJson(generateThemeJson(local)), row.themeJson, name);
    assert.equal(canonicalJson(local), row.canonical, name);
    assert.equal(configHash(local), row.hash, name);
    assert.equal(cssCacheKey(local), row.cssKey, name);
  });
});

void test("goldens match both generators", () => {
  for (const name of ["default", "generic-fonts"]) {
    const css = readFileSync(join(CONTRACT, "golden", `${name}.tokens.css`), "utf8");
    assert.equal(generateCss(config(`${name}.json`)), css, name);
    const index = valid.indexOf(`${name}.json`);
    assert.equal((phpRows[index] as Row).css, css, name);
    const themeJson = readContractJson<unknown>(`golden/${name}.theme.json`);
    assert.equal(canonicalJson(themeJson), (phpRows[index] as Row).themeJson, name);
  }
  assert.equal(readFileSync(join(CONTRACT, "golden/tailwind.css"), "utf8"), tailwindThemeCss());
});

void test("generation is deterministic and independent of input spelling and key order", () => {
  const original = generateCss(config("default.json"));
  assert.equal(generateCss(config("default.json")), original);
  assert.equal(generateCss(config("reordered-keys.json")), original);
  assert.equal(generateCss(config("version-float-spelling.json")), original);
  assert.equal(configHash(config("mixed-case-colors.json")), configHash(config("default.json")));
});

void test("short hex and upper case normalize; a different value changes the hash", () => {
  assert.equal(
    (config("short-hex.json")["colors"] as Record<string, string>)["surface"],
    "#ffffff",
  );
  assert.equal(configHash(config("short-hex.json")), configHash(config("default.json")));
  assert.notEqual(configHash(config("alpha-hex.json")), configHash(config("default.json")));
});

void test("generated CSS has one declaration per runtime token and nothing else", () => {
  for (const name of valid) {
    const local = config(name);
    const css = generateCss(local);
    const declared = [...css.matchAll(/^  (--blixis-[a-z0-9-]+): (.+);$/gm)].map((m) => [
      m[1],
      m[2],
    ]);
    assert.deepEqual(declared, [...cssVariables(local)], name);
    assert.ok(
      !/(?:url|expression|var|@import|<\/style|\\)/.test(css.replace(/cubic-bezier\([^)]*\)/, "")),
      name,
    );
    assert.equal((css.match(/\{/g) ?? []).length, 3, `${name} blocks`);
  }
});

void test("reduced motion zeroes durations in the generated CSS", () => {
  const css = generateCss(config("default.json"));
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{\n  :root \{\n    --blixis-motion-duration-fast: 0ms;/,
  );
});

void test("token parity: every config value appears in both CSS and theme.json", () => {
  type Preset = Record<string, string>;
  for (const name of valid) {
    const local = config(name);
    const vars = cssVariables(local);
    const theme = generateThemeJson(local) as {
      settings: {
        color: { palette: Preset[] };
        typography: { fontFamilies: Preset[]; fontSizes: Preset[] };
        spacing: { spacingSizes: Preset[] };
        border: { radiusSizes: Preset[] };
        shadow: { presets: Preset[] };
        layout: { contentSize: string; wideSize: string };
        custom: { blixis: { layout: { gutter: string }; motion: Record<string, string> } };
      };
    };
    const s = theme.settings;
    const pairs: [string, Preset[], string][] = [
      ["colors", s.color.palette, "color"],
      ["fonts", s.typography.fontFamilies, "fontFamily"],
      ["typeScale", s.typography.fontSizes, "size"],
      ["spacing", s.spacing.spacingSizes, "size"],
      ["radius", s.border.radiusSizes, "size"],
      ["shadows", s.shadow.presets, "shadow"],
    ];
    let checked = 0;
    for (const [sectionName, presets, field] of pairs) {
      const section = tokenMap.sections.find((part) => part.section === sectionName);
      for (const [key, variable] of Object.entries(section?.tokens ?? {})) {
        const preset = presets.find((item) => item["slug"] === key);
        assert.equal(preset?.[field], vars.get(variable ?? ""), `${name} ${sectionName}.${key}`);
        checked += 1;
      }
    }
    assert.equal(s.layout.contentSize, vars.get("--blixis-layout-content-width"));
    assert.equal(s.layout.wideSize, vars.get("--blixis-layout-wide-width"));
    assert.equal(s.custom.blixis.layout.gutter, vars.get("--blixis-layout-gutter"));
    assert.equal(s.custom.blixis.motion["durationFast"], vars.get("--blixis-motion-duration-fast"));
    assert.equal(s.custom.blixis.motion["durationBase"], vars.get("--blixis-motion-duration-base"));
    assert.equal(s.custom.blixis.motion["durationSlow"], vars.get("--blixis-motion-duration-slow"));
    assert.equal(s.custom.blixis.motion["easing"], vars.get("--blixis-motion-easing"));
    assert.equal(checked + 3 + 4, vars.size, `${name} coverage`);
  }
});

void test("breakpoints never reach runtime CSS or theme.json", () => {
  const local = config("default.json");
  assert.ok(!generateCss(local).includes("breakpoint"));
  assert.ok(!JSON.stringify(generateThemeJson(local)).includes("breakpoint"));
});

void test("cache keys match goldens in both languages and never exist for non-public content", () => {
  type KeyCase = {
    name: string;
    input: RenderKeyInput;
    fragment: string | null;
    page: string | null;
  };
  const golden = readContractJson<{ css: { default: string }; render: KeyCase[] }>(
    "golden/cache-keys.json",
  );
  assert.equal(cssCacheKey(config("default.json")), golden.css.default);
  const php = runPhp<{ fragment: string | null; page: string | null }[]>(
    "cache-keys",
    golden.render.map((item) => item.input),
  );
  const published = golden.render.find((item) => item.name === "published");
  golden.render.forEach((item, index) => {
    assert.equal(fragmentCacheKey(item.input), item.fragment, item.name);
    assert.equal(pageCacheKey(item.input), item.page, item.name);
    assert.deepEqual(php[index], { fragment: item.fragment, page: item.page }, item.name);
    if (["draft", "private", "pending", "future", "password-protected"].includes(item.name)) {
      assert.equal(item.fragment, null, item.name);
      assert.equal(item.page, null, item.name);
    }
    if (item.name === "config-changed") {
      assert.equal(
        item.fragment,
        published?.fragment,
        "a token change must not evict HTML fragments",
      );
      assert.notEqual(item.page, published?.page, "a token change must evict pages");
    }
    if (/^(document|renderer|registry)/.test(item.name)) {
      assert.notEqual(item.fragment, published?.fragment, item.name);
      assert.notEqual(item.page, published?.page, item.name);
    }
  });
});
