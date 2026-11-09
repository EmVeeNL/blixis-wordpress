// Tasks 03-02 and 03-06: the shipped validators and generator against token contract v2,
// and the v1 to v2 migration. The v1 files stay as frozen migration inputs.
// The PHP side runs the Blixis Blocks code through tests/03-02/php-cli.php.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  contrastRatio,
  isColor,
  migrateConfig,
  previewProperties,
  toSrgb,
  tokenMap,
  type Config,
  type ValidationError,
  validateBytes,
} from "../src/index.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CONTRACT = join(ROOT, "docs/contracts/tokens/v2");
const LEGACY = join(ROOT, "docs/contracts/tokens/v1");
const ENCODER = new TextEncoder();

type PhpRow = {
  ok: boolean;
  errors: ValidationError[];
  canonical?: string;
  hash?: string;
  css?: string;
  cssKey?: string;
  variables?: Record<string, string>;
  variablesDark?: Record<string, string>;
  cssSchemes?: Record<string, string>;
  cssKeys?: Record<string, string>;
  themeJson?: unknown;
};
type RawCase = { name: string; base64: string; errors: ValidationError[] };

const read = (relative: string): Uint8Array => readFileSync(join(CONTRACT, relative));
const readJson = <T>(relative: string): T =>
  JSON.parse(readFileSync(join(CONTRACT, relative), "utf8")) as T;
const fixtures = (dir: "valid" | "invalid"): string[] =>
  readdirSync(join(CONTRACT, dir))
    .filter((name) => name.endsWith(".json") && name !== "expected.json")
    .sort();
const base64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

function php(inputs: Uint8Array[]): PhpRow[] {
  const result = spawnSync("php", [join(ROOT, "tests/03-02/php-cli.php")], {
    input: JSON.stringify(inputs.map(base64)),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`php exited ${result.status}: ${result.stderr}`);
  return JSON.parse(result.stdout) as PhpRow[];
}

const expected = readJson<Record<string, { errors: ValidationError[] }>>("invalid/expected.json");
const valid = fixtures("valid");
const invalid = fixtures("invalid");
const raw = readJson<RawCase[]>("raw-cases.json");

void test("shipped token maps equal the contract byte for byte", () => {
  const contract = readFileSync(join(CONTRACT, "token-map.json"), "utf8");
  for (const copy of [
    "packages/tokens/src/token-map.json",
    "plugins/blixis-blocks/inc/tokens/token-map.json",
  ]) {
    assert.equal(readFileSync(join(ROOT, copy), "utf8"), contract, copy);
  }
  assert.equal(tokenMap.contractVersion, 2);
});

void test("every invalid fixture has a manifest entry", () => {
  assert.deepEqual(Object.keys(expected).sort(), invalid);
  assert.ok(invalid.length >= 140, `only ${invalid.length} invalid fixtures`);
});

void test("valid fixtures pass in TypeScript and PHP", () => {
  const rows = php(valid.map((name) => read(`valid/${name}`)));
  valid.forEach((name, index) => {
    assert.deepEqual(validateBytes(read(`valid/${name}`)).errors, [], `ts ${name}`);
    assert.deepEqual(rows[index]?.errors, [], `php ${name}`);
  });
});

void test("invalid fixtures, including CSS injection, report the manifest errors in both", () => {
  const rows = php(invalid.map((name) => read(`invalid/${name}`)));
  invalid.forEach((name, index) => {
    assert.deepEqual(
      validateBytes(read(`invalid/${name}`)).errors,
      expected[name]?.errors,
      `ts ${name}`,
    );
    assert.deepEqual(rows[index]?.errors, expected[name]?.errors, `php ${name}`);
  });
});

void test("raw byte cases agree in both", () => {
  const rows = php(raw.map((item) => Buffer.from(item.base64, "base64")));
  raw.forEach((item, index) => {
    assert.deepEqual(
      validateBytes(Buffer.from(item.base64, "base64")).errors,
      item.errors,
      `ts ${item.name}`,
    );
    assert.deepEqual(rows[index]?.errors, item.errors, `php ${item.name}`);
  });
});

void test("PHP generates the golden stylesheets, hashes, and cache key", () => {
  const names = ["default", "generic-fonts", "colors-dark", "colors-dark-mixed-formats"];
  const rows = php(names.map((name) => read(`valid/${name}.json`)));
  names.forEach((name, index) => {
    assert.equal(
      rows[index]?.css,
      readFileSync(join(CONTRACT, `golden/${name}.tokens.css`), "utf8"),
      name,
    );
  });
  const keys = readJson<{ css: { default: string; hash: string; canonical: string } }>(
    "golden/cache-keys.json",
  );
  assert.equal(rows[0]?.cssKey, keys.css.default);
  assert.equal(rows[0]?.hash, keys.css.hash);
  assert.equal(rows[0]?.canonical, keys.css.canonical);
});

void test("preview properties equal the server's custom properties for every valid fixture", () => {
  const rows = php(valid.map((name) => read(`valid/${name}`)));
  valid.forEach((name, index) => {
    const result = validateBytes(read(`valid/${name}`));
    assert.ok(result.ok, name);
    assert.deepEqual(
      Object.fromEntries(previewProperties(result.config)),
      rows[index]?.variables,
      name,
    );
  });
});

void test("generated declarations cannot leave their rule", () => {
  const rows = php(valid.map((name) => read(`valid/${name}`)));
  for (const row of rows) {
    for (const [name, value] of Object.entries(row.variables ?? {})) {
      assert.match(name, /^--blixis-[a-z0-9-]+$/);
      assert.doesNotMatch(value, /[;{}<>\\]|\/\*|url\(|@import|expression\(/i, `${name}: ${value}`);
    }
  }
});

function prng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const FRAGMENTS = [
  "red",
  "#fff",
  "#FFFFFF",
  "1rem",
  "0",
  "0.5rem",
  "1e3px",
  "var(--x)",
  "url(x)",
  "</style>",
  ";",
  "}",
  "{",
  '"',
  "'",
  "\\",
  "\n",
  "\r",
  "\t",
  "\u0000",
  "\u0001",
  "\u007f",
  "\u0085",
  " ",
  " ",
  "﻿",
  "😀",
  "＃",
  "١",
  "/*",
  "*/",
  "@import",
  "expression(",
  "!important",
  "Local Sans",
  "A-B",
  " ",
  "  ",
  "none",
  "inset ",
  "0 0 0 0 #000",
  "ease",
  "cubic-bezier(0, 0, 1, 1)",
  "120ms",
  "-1ms",
  "48rem",
  "96rem",
  "rgb(0 0 0)",
  "rgb(256 0 0)",
  "rgb(10% 20% 30% / 50%)",
  "hsl(0 0% 0%)",
  "hsl(361 0% 0%)",
  "oklch(0.5 0.1 10)",
  "oklch(0.5 0.6 10)",
  "1em",
  "65ch",
  "90vw",
  "100%",
  " / 0.5",
  "rgb(",
  ")",
  "inset 0 1px 2px 0 rgb(0 0 0 / 0.1)",
];
const STRUCTURE: unknown[] = [null, true, false, 0, 1, 1.5, -1, [], {}, [1], { a: 1 }, "", "1"];

void test("property-based: 6000 mutated configs agree exactly in both validators", () => {
  const random = prng(0x03020302);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  const sources = ["default", "colors-dark", "colors-dark-mixed-formats", "v1"].map(
    (name) =>
      JSON.parse(
        name === "v1"
          ? readFileSync(join(LEGACY, "valid/default.json"), "utf8")
          : readFileSync(join(CONTRACT, `valid/${name}.json`), "utf8"),
      ) as Record<string, unknown>,
  );
  const source = sources[0] as Record<string, unknown>;
  const corpus: string[] = [];
  for (let i = 0; i < 4000; i += 1) {
    const copy = structuredClone(pick(sources));
    const edits = 1 + Math.floor(random() * 3);
    for (let e = 0; e < edits; e += 1) {
      const section = pick(Object.keys(copy));
      const holder = copy[section];
      const choice = random();
      if (typeof holder === "object" && holder !== null && !Array.isArray(holder)) {
        const keys = Object.keys(holder);
        const key = choice < 0.1 ? pick(FRAGMENTS) : pick(keys);
        const target = holder as Record<string, unknown>;
        if (choice < 0.15) Reflect.deleteProperty(target, pick(keys));
        else if (choice < 0.3) target[key] = pick(STRUCTURE);
        else target[key] = `${pick(FRAGMENTS)}${random() < 0.5 ? pick(FRAGMENTS) : ""}`;
      } else {
        copy[section] = pick(STRUCTURE);
      }
    }
    corpus.push(JSON.stringify(copy));
  }
  const text = JSON.stringify(source);
  const RAW = [
    "TRUE",
    "True",
    "NULL",
    "nUlL",
    "tRuE",
    "\\ud800",
    "\\udc00",
    "\\u0000",
    "\\uD83D\\uDE00",
    "1.0",
    "1e0",
    "1E0",
    "-0",
    "01",
    "+1",
    ".5",
    "1.",
    ",",
    ":",
    "{",
    "}",
    "[",
    "]",
    '"',
    "\\",
    " ",
    " ",
    "﻿",
    "\t",
    "\u000b",
    "\u000c",
  ];
  for (let i = 0; i < 2000; i += 1) {
    const at = Math.floor(random() * text.length);
    const remove = random() < 0.5 ? Math.floor(random() * 4) : 0;
    corpus.push(text.slice(0, at) + pick(RAW) + text.slice(at + remove));
  }
  const rows = php(corpus.map((item) => ENCODER.encode(item)));
  const differences: string[] = [];
  let accepted = 0;
  corpus.forEach((item, index) => {
    const ts = validateBytes(ENCODER.encode(item));
    if (ts.ok) accepted += 1;
    if (JSON.stringify(rows[index]?.errors) !== JSON.stringify(ts.errors))
      differences.push(item.slice(0, 120));
  });
  assert.deepEqual(differences.slice(0, 5), []);
  assert.ok(accepted > 0 && accepted < corpus.length, `accepted ${accepted}`);
});

// ---- Task 03-06 additions

void test("the derived contract files are up to date with scripts/build-contract.ts", () => {
  const result = spawnSync("node", ["scripts/build-contract.ts", "--check"], {
    cwd: join(ROOT, "packages/tokens"),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});

void test("dark mode CSS and theme.json goldens come out of PHP for every scheme", () => {
  const names = ["colors-dark", "colors-dark-mixed-formats"];
  const rows = php(names.map((name) => read(`valid/${name}.json`)));
  names.forEach((name, index) => {
    const text = (file: string): string => readFileSync(join(CONTRACT, `golden/${file}`), "utf8");
    assert.equal(rows[index]?.cssSchemes?.["system"], text(`${name}.tokens.css`), `${name} system`);
    assert.equal(
      rows[index]?.cssSchemes?.["light"],
      text(`${name}.light.tokens.css`),
      `${name} light`,
    );
    assert.equal(
      rows[index]?.cssSchemes?.["dark"],
      text(`${name}.dark.tokens.css`),
      `${name} dark`,
    );
  });
  const withDark = readFileSync(join(CONTRACT, "golden/colors-dark.tokens.css"), "utf8");
  assert.match(withDark, /color-scheme: light dark;/);
  assert.match(
    withDark,
    /@media \(prefers-color-scheme: dark\) \{\n {2}:root \{\n {4}--blixis-color-primary: #6ea8fe;/,
  );
  const dark = readFileSync(join(CONTRACT, "golden/colors-dark.dark.tokens.css"), "utf8");
  assert.doesNotMatch(dark, /prefers-color-scheme/);
  assert.match(dark, /--blixis-color-surface: #0b1220;[\s\S]*color-scheme: dark;/);
  const light = readFileSync(join(CONTRACT, "golden/colors-dark.light.tokens.css"), "utf8");
  assert.doesNotMatch(light, /prefers-color-scheme: dark/);
  assert.match(light, /--blixis-color-surface: #ffffff;[\s\S]*color-scheme: light;/);
  // Without a dark palette the scheme changes nothing: same bytes for all three.
  const plain = php([read("valid/default.json")])[0];
  assert.equal(plain?.cssSchemes?.["light"], plain?.cssSchemes?.["system"]);
  assert.equal(plain?.cssSchemes?.["dark"], plain?.cssSchemes?.["system"]);
  assert.doesNotMatch(plain?.cssSchemes?.["system"] ?? "", /color-scheme/);
  assert.equal(plain?.cssKeys?.["dark"], plain?.cssKeys?.["system"]);
});

void test("theme.json presets follow the custom properties only when a dark palette is set", () => {
  const rows = php([read("valid/colors-dark.json"), read("valid/default.json")]);
  type Theme = { settings: { color: { palette: { slug: string; color: string }[] } } };
  const palette = (row: PhpRow | undefined): { slug: string; color: string }[] =>
    (row?.themeJson as Theme | undefined)?.settings.color.palette ?? [];
  for (const entry of palette(rows[0])) {
    assert.equal(entry.color, `var(--blixis-color-${entry.slug})`);
  }
  for (const entry of palette(rows[1])) assert.match(entry.color, /^#[0-9a-f]{6}$/);
  assert.deepEqual(
    JSON.parse(readFileSync(join(CONTRACT, "golden/colors-dark.theme.json"), "utf8")),
    JSON.parse(JSON.stringify(rows[0]?.themeJson)),
  );
});

void test("cache keys carry the scheme only when it changes the output", () => {
  const keys = readJson<{ css: { dark: Record<string, string> } }>("golden/cache-keys.json").css
    .dark;
  const row = php([read("valid/colors-dark.json")])[0];
  assert.equal(row?.cssKeys?.["system"], keys["system"]);
  assert.equal(row?.cssKeys?.["light"], keys["light"]);
  assert.equal(row?.cssKeys?.["dark"], keys["dark"]);
  assert.match(keys["light"] ?? "", /:slight$/);
  assert.match(keys["dark"] ?? "", /:sdark$/);
  assert.doesNotMatch(keys["system"] ?? "", /:s(light|dark)$/);
});

void test("preview properties produce light or dark, and fall back without a dark palette", () => {
  const rows = php([read("valid/colors-dark.json"), read("valid/default.json")]);
  const withDark = validateBytes(read("valid/colors-dark.json"));
  const plain = validateBytes(read("valid/default.json"));
  assert.ok(withDark.ok && plain.ok);
  if (!withDark.ok || !plain.ok) return;
  assert.deepEqual(Object.fromEntries(previewProperties(withDark.config)), rows[0]?.variables);
  assert.deepEqual(
    Object.fromEntries(previewProperties(withDark.config, tokenMap, "dark")),
    rows[0]?.variablesDark,
  );
  assert.equal(
    previewProperties(withDark.config, tokenMap, "dark").get("--blixis-color-surface"),
    "#0b1220",
  );
  assert.deepEqual(
    Object.fromEntries(previewProperties(plain.config, tokenMap, "dark")),
    Object.fromEntries(previewProperties(plain.config)),
  );
});

const MIGRATIONS = readdirSync(join(CONTRACT, "migrations"))
  .filter((name) => name.endsWith(".input.json"))
  .sort();

void test("v1 configs migrate to the v2 golden form in both languages, and migration is pure", () => {
  assert.ok(MIGRATIONS.length >= 6);
  const inputs = MIGRATIONS.map((name) => read(`migrations/${name}`));
  const rows = php(inputs);
  MIGRATIONS.forEach((name, index) => {
    const golden = readFileSync(
      join(CONTRACT, `migrations/${name.replace(".input.json", ".v2.golden.json")}`),
      "utf8",
    ).trim();
    const result = validateBytes(inputs[index] as Uint8Array);
    assert.ok(result.ok, name);
    if (!result.ok) return;
    assert.equal(result.config["schemaVersion"], 2, name);
    assert.deepEqual(result.config, JSON.parse(golden), `ts ${name}`);
    assert.equal(rows[index]?.canonical, golden, `php ${name}`);
    // Round trip: the migrated form validates again and is unchanged.
    const again = validateBytes(ENCODER.encode(JSON.stringify(result.config)));
    assert.ok(again.ok && JSON.stringify(again.config) === JSON.stringify(result.config), name);
    // The pure step changes only the version and leaves its input alone.
    const before = structuredClone(result.config);
    const old: Config = { ...result.config, schemaVersion: 1 };
    assert.deepEqual(migrateConfig(old), before);
    assert.equal(old["schemaVersion"], 1);
    assert.deepEqual(migrateConfig(before), before);
  });
  assert.deepEqual(migrateConfig({ schemaVersion: 3, x: 1 }), { schemaVersion: 3, x: 1 });
});

void test("every v1 fixture still gets its v1 verdict through the migrating validators", () => {
  const legacyValid = readdirSync(join(LEGACY, "valid")).filter((name) => name.endsWith(".json"));
  const legacyInvalid = readdirSync(join(LEGACY, "invalid")).filter(
    // This v1 fixture says schemaVersion 2, which v2 now supports.
    (name) =>
      name.endsWith(".json") && name !== "expected.json" && name !== "version-unsupported.json",
  );
  const manifest = JSON.parse(
    readFileSync(join(LEGACY, "invalid/expected.json"), "utf8"),
  ) as Record<string, { errors: ValidationError[] }>;
  const bytes = [
    ...legacyValid.map((name) => readFileSync(join(LEGACY, "valid", name))),
    ...legacyInvalid.map((name) => readFileSync(join(LEGACY, "invalid", name))),
  ];
  const rows = php(bytes);
  bytes.forEach((item, index) => {
    const ts = validateBytes(item);
    const name =
      index < legacyValid.length ? legacyValid[index] : legacyInvalid[index - legacyValid.length];
    const want = index < legacyValid.length ? [] : (manifest[name ?? ""]?.errors ?? []);
    assert.deepEqual(ts.errors, want, `ts ${name}`);
    assert.deepEqual(rows[index]?.errors, want, `php ${name}`);
    if (ts.ok) assert.equal(ts.config["schemaVersion"], 2, `${name}`);
    if (index < legacyValid.length)
      assert.equal(
        rows[index]?.canonical,
        JSON.stringify(sorted(ts.ok ? ts.config : {})),
        `${name} canonical`,
      );
  });
});

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, sorted(item)]),
    );
  }
  return value;
}

void test("v1 rules are kept for v1 input: no new formats, units, or colorsDark", () => {
  const source = JSON.parse(readFileSync(join(CONTRACT, "valid/default.json"), "utf8")) as Config;
  const cases: Config[] = [
    {
      ...source,
      schemaVersion: 1,
      colors: { ...(source["colors"] as object), primary: "rgb(0 0 0)" },
    },
    { ...source, schemaVersion: 1, typeScale: { ...(source["typeScale"] as object), lg: "1em" } },
    { ...source, schemaVersion: 1, colorsDark: source["colors"] },
    {
      ...source,
      schemaVersion: 1,
      shadows: { sm: "0 1px 2px 0 rgb(0 0 0)", md: "none", lg: "none" },
    },
    {
      ...source,
      schemaVersion: 1,
      layout: { ...(source["layout"] as object), contentWidth: "65ch" },
    },
  ];
  const wanted = [
    "/colors/primary",
    "/typeScale/lg",
    "/colorsDark",
    "/shadows/sm",
    "/layout/contentWidth",
  ];
  const bytes = cases.map((item) => ENCODER.encode(JSON.stringify(item)));
  const rows = php(bytes);
  bytes.forEach((item, index) => {
    const ts = validateBytes(item);
    assert.equal(ts.ok, false, wanted[index] ?? "");
    assert.deepEqual(
      ts.errors.map((e) => e.path),
      [wanted[index]],
    );
    assert.deepEqual(rows[index]?.errors, ts.errors);
  });
});

void test("units and slider ranges are defined in the contract", () => {
  const sections = tokenMap.sections.filter((s) =>
    ["typeScale", "spacing", "radius", "layout", "motion"].includes(s.section),
  );
  const allowed: Record<string, string[]> = {
    typeScale: ["px", "rem", "em"],
    spacing: ["px", "rem", "em"],
    radius: ["px", "rem"],
    motion: ["ms"],
  };
  for (const section of sections) {
    for (const key of Object.keys(section.tokens)) {
      if (section.section === "motion" && key === "easing") continue;
      const field = tokenMap.fields[section.section]?.[key];
      assert.ok(field, `${section.section}.${key}`);
      if (field === undefined) continue;
      const want =
        section.section === "layout"
          ? key === "gutter"
            ? ["px", "rem"]
            : ["px", "rem", "%", "ch", "vw"]
          : allowed[section.section];
      assert.deepEqual(field.units, want, `${section.section}.${key} units`);
      assert.ok(field.units.includes(field.defaultUnit));
      assert.deepEqual(Object.keys(field.ranges).sort(), [...field.units].sort());
      for (const [unit, range] of Object.entries(field.ranges)) {
        assert.ok(
          range.min < range.max && range.step > 0 && range.step <= range.max - range.min,
          `${key} ${unit}`,
        );
      }
      // The grammar accepts exactly the listed units.
      const grammar = new RegExp(tokenMap.grammars[field.grammar] ?? "^$");
      for (const unit of ["px", "rem", "em", "%", "ch", "vw", "vh", "pt"]) {
        if (unit === "ms") continue;
        if (section.section === "motion") continue;
        assert.equal(
          grammar.test(`1${unit}`),
          field.units.includes(unit),
          `${section.section}.${key} 1${unit}`,
        );
      }
      // A mid-range value of every unit is accepted by the grammar.
      for (const [unit, range] of Object.entries(field.ranges)) {
        const mid = `${(range.min + range.max) / 2}${unit}`;
        assert.ok(grammar.test(mid), `${section.section}.${key} ${mid}`);
      }
    }
  }
  assert.ok(tokenMap.shadowControls["opacity"] && tokenMap.shadowControls["blur"]);
});

void test("the shipped default values sit inside their slider ranges", () => {
  const config = JSON.parse(readFileSync(join(CONTRACT, "valid/default.json"), "utf8")) as Record<
    string,
    Record<string, string>
  >;
  for (const [section, fields] of Object.entries(tokenMap.fields)) {
    for (const [key, field] of Object.entries(fields)) {
      const value = config[section]?.[key] ?? "";
      const match = /^([0-9.]+)([a-z%]+)$/.exec(value);
      if (match === null) continue;
      const range = field.ranges[match[2] ?? ""];
      assert.ok(range, `${section}.${key} ${value}`);
      const number = Number(match[1]);
      assert.ok(
        number >= (range?.min ?? 0) && number <= (range?.max ?? 0),
        `${section}.${key} ${value}`,
      );
    }
  }
});

// ---- Colour formats and contrast

const COLOR_VALID = [
  "#fff",
  "#FFFFFF",
  "#ffffff80",
  "rgb(0 0 0)",
  "rgb(255 255 255)",
  "rgb(100% 50% 0%)",
  "rgb(12.5 0 0 / 0.5)",
  "rgb(0 0 0 / 50%)",
  "rgb(0 0 0 / 1)",
  "rgb(0 0 0 / 0)",
  "hsl(0 0% 0%)",
  "hsl(360 100% 100%)",
  "hsl(222 97% 54% / 0.5)",
  "hsl(0.5 0.5% 0.5%)",
  "oklch(0 0 0)",
  "oklch(1 0.5 360)",
  "oklch(100% 0 0)",
  "oklch(55.5% 0.2 262 / 90%)",
  "oklch(0.999999 0.000001 0.5)",
];
const COLOR_INVALID = [
  "",
  "red",
  "#ff",
  "#abcd",
  "#12345",
  "#ggg",
  "rgb(0, 0, 0)",
  "rgb(256 0 0)",
  "rgb(255.01 0 0)",
  "rgb(0 0 0 / 1.01)",
  "rgb(0 0 0 / 100.1%)",
  "rgb(10% 0 0)",
  "rgb(0 0 0 /0.5)",
  "rgb(0 0 0/ 0.5)",
  "rgb( 0 0 0)",
  "rgb(0 0 0 )",
  "rgb(0 0 0)x",
  "RGB(0 0 0)",
  "rgba(0 0 0 / 1)",
  "rgb(.5 0 0)",
  "rgb(1. 0 0)",
  "rgb(00 0 0)",
  "rgb(1000 0 0)",
  "rgb(-0 0 0)",
  "rgb(+1 0 0)",
  "hsl(361 0% 0%)",
  "hsl(0 101% 0%)",
  "hsl(0 0 0)",
  "hsl(0deg 0% 0%)",
  "hsl(0% 0% 0%)",
  "oklch(1.01 0 0)",
  "oklch(101% 0 0)",
  "oklch(0 0.51 0)",
  "oklch(0 10% 0)",
  "oklch(0 0 361)",
  "oklch(0 0 0 / 2)",
  "oklab(0 0 0)",
  "oklch(0 0 0\n)",
  "oklch(0 0 0)\n",
  "oklch(0 0 0);",
  "oklch(0 0 0) url(x)",
  "oklch(var(--l) 0 0)",
  "color(srgb 1 0 0)",
  "color-mix(in srgb, red, blue)",
];

void test("colour grammar and ranges agree in TypeScript and PHP for every format", () => {
  const all = [...COLOR_VALID, ...COLOR_INVALID];
  const rows = phpContrast(all.map((color) => [color, "#ffffff"]));
  all.forEach((color, index) => {
    const wanted = index < COLOR_VALID.length;
    assert.equal(isColor(color), wanted, `ts ${JSON.stringify(color)}`);
    assert.equal(rows[index]?.valid, wanted, `php ${JSON.stringify(color)}`);
    if (wanted) {
      assert.ok(toSrgb(color) !== null, `ts srgb ${JSON.stringify(color)}`);
      assert.ok(rows[index]?.srgb !== null, `php srgb ${JSON.stringify(color)}`);
    }
  });
});

type ContrastRow = { valid: boolean; ratio: number | null; srgb: number[] | null };
function phpContrast(pairs: string[][]): ContrastRow[] {
  const result = spawnSync("php", [join(ROOT, "tests/03-02/php-contrast.php")], {
    input: JSON.stringify(pairs),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`php exited ${result.status}: ${result.stderr}`);
  return JSON.parse(result.stdout) as ContrastRow[];
}

// [foreground, background, expected ratio, tolerance]. Black on white is 21 by definition; the
// grey pairs are the published WCAG reference values; oklch(0.5 0 0) has relative luminance
// 0.5^3 = 0.125 so its ratio over white is 1.05 / 0.175 = 6.
const VECTORS: [string, string, number, number][] = [
  ["#000000", "#ffffff", 21, 1e-9],
  ["#ffffff", "#000000", 21, 1e-9],
  ["#ffffff", "#ffffff", 1, 1e-9],
  ["#767676", "#ffffff", 4.5422, 1e-3],
  ["#777777", "#ffffff", 4.4781, 1e-3],
  ["#fff", "#000", 21, 1e-9],
  ["rgb(0 0 0)", "rgb(255 255 255)", 21, 1e-9],
  ["rgb(0% 0% 0%)", "rgb(100% 100% 100%)", 21, 1e-9],
  ["hsl(0 0% 0%)", "hsl(0 0% 100%)", 21, 1e-9],
  ["#008000", "#ffffff", 5.1374, 1e-3],
  ["hsl(120 100% 25.098%)", "#ffffff", 5.1374, 1e-2],
  ["oklch(0 0 0)", "oklch(1 0 0)", 21, 1e-6],
  ["oklch(0.5 0 0)", "#ffffff", 6, 1e-6],
  ["oklch(50% 0 120)", "#ffffff", 6, 1e-6],
  // Translucent foreground over an opaque background: 50% black on white is mid grey (127.5).
  ["rgb(0 0 0 / 0.5)", "#ffffff", 3.97665, 1e-4],
  ["#00000080", "#ffffff", 4.00411, 1e-4],
  // A translucent background is composited over white first.
  ["#000000", "rgb(0 0 0 / 0)", 21, 1e-9],
  // Out-of-gamut oklch is clipped to sRGB: this chroma is far outside, red channel clips to 1.
  ["oklch(0.7 0.5 30)", "#000000", 6.2, 2],
];

void test("contrast helper matches reference vectors and PHP", () => {
  const rows = phpContrast(VECTORS.map(([fg, bg]) => [fg, bg]));
  VECTORS.forEach(([fg, bg, want, tolerance], index) => {
    const ts = contrastRatio(fg, bg);
    assert.ok(
      ts !== null && Math.abs(ts - want) <= tolerance,
      `ts ${fg} on ${bg}: ${ts} vs ${want}`,
    );
    const php = rows[index]?.ratio;
    assert.ok(
      typeof php === "number" && Math.abs(php - (ts ?? 0)) < 1e-9,
      `php ${fg} on ${bg}: ${php} vs ${ts}`,
    );
  });
  assert.equal(contrastRatio("red", "#fff"), null);
  assert.equal(contrastRatio("#fff", "rgb(256 0 0)"), null);
});

void test("oklch outside the sRGB gamut is clipped into [0, 1]; conversions agree across formats", () => {
  const wild = toSrgb("oklch(0.7 0.5 30)");
  assert.ok(wild !== null);
  for (const channel of wild ?? []) assert.ok(channel >= 0 && channel <= 1);
  assert.ok(((wild ?? [])[0] ?? 0) > 0.999999);
  const close = (a: string, b: string): void => {
    const x = toSrgb(a) ?? [];
    const y = toSrgb(b) ?? [];
    x.forEach((value, index) =>
      assert.ok(Math.abs(value - (y[index] ?? 99)) < 2e-3, `${a} vs ${b}`),
    );
  };
  close("#ff0000", "hsl(0 100% 50%)");
  close("#00ff00", "hsl(120 100% 50%)");
  close("#0000ff", "hsl(240 100% 50%)");
  close("#808080", "rgb(50.196% 50.196% 50.196%)");
  close("#ffffff", "oklch(1 0 0)");
  close("#ff0000", "oklch(0.62796 0.25768 29.2339)");
  const pairs = [
    "hsl(222 97% 54%)",
    "oklch(0.55 0.22 262)",
    "rgb(21 93 252 / 0.4)",
    "oklch(0.9 0.4 90)",
  ];
  const rows = phpContrast(pairs.map((color) => [color, "#ffffff"]));
  pairs.forEach((color, index) => {
    (toSrgb(color) ?? []).forEach((value, at) => {
      assert.ok(Math.abs(value - (rows[index]?.srgb?.[at] ?? 99)) < 1e-9, color);
    });
  });
});

void test("contrast over every colour in every valid fixture agrees in both languages", () => {
  const colors = new Set<string>();
  for (const name of valid) {
    const result = validateBytes(read(`valid/${name}`));
    if (!result.ok) continue;
    for (const key of ["colors", "colorsDark"]) {
      Object.values((result.config[key] ?? {}) as Record<string, string>).forEach((v) =>
        colors.add(v),
      );
    }
  }
  const list = [...colors];
  const pairs = list.flatMap((fg) => list.map((bg) => [fg, bg] as string[]));
  const rows = phpContrast(pairs);
  pairs.forEach(([fg, bg], index) => {
    const ts = contrastRatio(fg ?? "", bg ?? "");
    assert.ok(ts !== null && ts >= 1 && ts <= 21 + 1e-9, `${fg} ${bg}`);
    assert.ok(Math.abs((rows[index]?.ratio ?? 99) - (ts ?? 0)) < 1e-9, `${fg} on ${bg}`);
  });
  assert.ok(list.length > 15);
});

void test("hex colours are normalized and functional colours keep the entered text", () => {
  const rows = php([read("valid/color-mixed-formats.json")]);
  const result = validateBytes(read("valid/color-mixed-formats.json"));
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.deepEqual(result.config["colors"], {
    accent: "#00ccff",
    foreground: "hsl(220 43% 11%)",
    muted: "oklch(0.55 0.04 255)",
    primary: "#155dfc",
    surface: "rgb(255 255 255)",
  });
  assert.equal(rows[0]?.variables?.["--blixis-color-muted"], "oklch(0.55 0.04 255)");
  assert.equal(rows[0]?.variables?.["--blixis-color-surface"], "rgb(255 255 255)");
});
