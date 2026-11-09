// Writes the hand-specified token contract v2 fixtures added by task 03-06 and the golden
// files derived from the PHP generator. The v1-derived fixtures were copied once with the
// version number changed; this script owns everything new.
//
//   node scripts/gen-fixtures.ts
//
// Expected errors below are specified here by hand, not taken from either validator. Goldens
// come from the shipped PHP code (the only production generator) and must be reviewed: a
// changed golden is a contract change. Needs php on the path. Run from packages/tokens.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const V1 = join(ROOT, "docs/contracts/tokens/v1");
const V2 = join(ROOT, "docs/contracts/tokens/v2");
type Json = Record<string, any>; // oxlint-disable-line typescript/no-explicit-any

const base = JSON.parse(readFileSync(join(V2, "valid/default.json"), "utf8")) as Json;
const clone = (): Json => structuredClone(base);
const write = (path: string, text: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
const line = (value: unknown): string => `${JSON.stringify(value)}\n`;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

// ---- valid
const withColors = (colors: Record<string, string>, extra: Json = {}): Json => ({
  ...clone(),
  colors: { ...base["colors"], ...colors },
  ...extra,
});
const DARK_HEX = {
  primary: "#6ea8fe",
  surface: "#0b1220",
  foreground: "#e5e7eb",
  muted: "#94a3b8",
  accent: "#22d3ee",
};
const valid: Record<string, Json> = {
  "color-rgb": withColors({
    primary: "rgb(21 93 252)",
    surface: "rgb(100% 100% 100%)",
    foreground: "rgb(16 24 40 / 0.9)",
    muted: "rgb(100.5 116 139 / 50%)",
    accent: "rgb(0 0 0)",
  }),
  "color-hsl": withColors({
    primary: "hsl(222 97% 54%)",
    surface: "hsl(0 0% 100%)",
    foreground: "hsl(220 43% 11% / 0.95)",
    muted: "hsl(360 16.5% 47%)",
    accent: "hsl(0 0% 0% / 100%)",
  }),
  "color-oklch": withColors({
    primary: "oklch(0.55 0.22 262)",
    surface: "oklch(100% 0 0)",
    foreground: "oklch(0.2 0.03 260 / 0.98)",
    muted: "oklch(0.55 0.04 255)",
    accent: "oklch(0.75 0.5 360)",
  }),
  "color-mixed-formats": withColors({
    primary: "#155DFC",
    surface: "rgb(255 255 255)",
    foreground: "hsl(220 43% 11%)",
    muted: "oklch(0.55 0.04 255)",
    accent: "#0cf",
  }),
  "colors-dark": { ...clone(), colorsDark: DARK_HEX },
  "colors-dark-mixed-formats": {
    ...clone(),
    colors: { ...base["colors"], primary: "oklch(0.55 0.22 262)" },
    colorsDark: {
      primary: "oklch(0.75 0.14 262)",
      surface: "rgb(11 18 32)",
      foreground: "hsl(220 14% 91%)",
      muted: "#94A3B8",
      accent: "oklch(0.8 0.12 200 / 0.9)",
    },
  },
  "units-em": {
    ...clone(),
    typeScale: { ...base["typeScale"], base: "1em", lg: "1.125em", xs: "12px" },
    spacing: { ...base["spacing"], md: "1em", lg: "1.5em", xl: "40px" },
  },
  "units-width": {
    ...clone(),
    layout: { contentWidth: "65ch", wideWidth: "90vw", gutter: "24px" },
  },
  "units-width-percent": {
    ...clone(),
    layout: { contentWidth: "100%", wideWidth: "1152px", gutter: "1.5rem" },
  },
  "shadow-color-formats": {
    ...clone(),
    shadows: {
      sm: "0 1px 2px 0 rgb(0 0 0 / 0.1)",
      md: "0 4px 6px -1px hsl(220 40% 10% / 0.2), inset 0 2px 4px -2px oklch(0.2 0.02 260 / 25%)",
      lg: "0 10px 15px -3px #0000001a, 0 4px 6px -4px rgb(0% 0% 0% / 0.1)",
    },
  },
};
for (const [name, config] of Object.entries(valid)) {
  config["schemaVersion"] = 2;
  write(join(V2, "valid", `${name}.json`), line(config));
}

// ---- invalid: [name, config, expected errors]
type Expected = { code: string; path: string }[];
const color = (path: string): Expected => [{ code: "token.color.invalid", path }];
const length = (path: string): Expected => [{ code: "token.length.invalid", path }];
const withPrimary = (value: string): Json => withColors({ primary: value });
const withDark = (dark: unknown): Json => ({ ...clone(), colorsDark: dark });
const invalid: [string, Json, Expected][] = [
  ["color-rgb-comma", withPrimary("rgb(21, 93, 252)"), color("/colors/primary")],
  ["color-rgb-out-of-range", withPrimary("rgb(256 0 0)"), color("/colors/primary")],
  ["color-rgb-mixed-percent", withPrimary("rgb(10% 20 30)"), color("/colors/primary")],
  ["color-rgb-percent-out-of-range", withPrimary("rgb(101% 0% 0%)"), color("/colors/primary")],
  ["color-rgb-negative", withPrimary("rgb(-1 0 0)"), color("/colors/primary")],
  ["color-rgb-uppercase-function", withPrimary("RGB(0 0 0)"), color("/colors/primary")],
  ["color-rgba-function", withPrimary("rgba(0 0 0 / 0.5)"), color("/colors/primary")],
  ["color-rgb-alpha-out-of-range", withPrimary("rgb(0 0 0 / 1.5)"), color("/colors/primary")],
  [
    "color-rgb-alpha-percent-out-of-range",
    withPrimary("rgb(0 0 0 / 101%)"),
    color("/colors/primary"),
  ],
  ["color-rgb-double-space", withPrimary("rgb(0  0 0)"), color("/colors/primary")],
  ["color-rgb-missing-channel", withPrimary("rgb(0 0)"), color("/colors/primary")],
  ["color-rgb-calc", withPrimary("rgb(calc(1) 0 0)"), color("/colors/primary")],
  ["color-rgb-var", withPrimary("rgb(var(--x) 0 0)"), color("/colors/primary")],
  ["color-rgb-breakout", withPrimary("rgb(0 0 0);}"), color("/colors/primary")],
  ["color-rgb-trailing-newline", withPrimary("rgb(0 0 0)\n"), color("/colors/primary")],
  ["color-rgb-exponent", withPrimary("rgb(1e2 0 0)"), color("/colors/primary")],
  ["color-rgb-leading-zero", withPrimary("rgb(01 0 0)"), color("/colors/primary")],
  ["color-hsl-comma", withPrimary("hsl(222, 97%, 54%)"), color("/colors/primary")],
  ["color-hsl-hue-out-of-range", withPrimary("hsl(361 50% 50%)"), color("/colors/primary")],
  ["color-hsl-no-percent", withPrimary("hsl(10 50 50)"), color("/colors/primary")],
  ["color-hsl-saturation-out-of-range", withPrimary("hsl(10 101% 50%)"), color("/colors/primary")],
  ["color-hsl-lightness-out-of-range", withPrimary("hsl(10 50% 100.1%)"), color("/colors/primary")],
  ["color-hsl-deg-unit", withPrimary("hsl(10deg 50% 50%)"), color("/colors/primary")],
  ["color-hsl-percent-hue", withPrimary("hsl(10% 50% 50%)"), color("/colors/primary")],
  ["color-hsla-function", withPrimary("hsla(10 50% 50% / 0.5)"), color("/colors/primary")],
  [
    "color-oklch-lightness-out-of-range",
    withPrimary("oklch(1.1 0.1 10)"),
    color("/colors/primary"),
  ],
  [
    "color-oklch-lightness-percent-out-of-range",
    withPrimary("oklch(101% 0.1 10)"),
    color("/colors/primary"),
  ],
  ["color-oklch-chroma-out-of-range", withPrimary("oklch(0.5 0.6 10)"), color("/colors/primary")],
  ["color-oklch-chroma-percent", withPrimary("oklch(0.5 10% 10)"), color("/colors/primary")],
  ["color-oklch-hue-out-of-range", withPrimary("oklch(0.5 0.1 361)"), color("/colors/primary")],
  ["color-oklch-none-keyword", withPrimary("oklch(none 0 0)"), color("/colors/primary")],
  ["color-oklch-hue-unit", withPrimary("oklch(0.5 0.1 10deg)"), color("/colors/primary")],
  ["color-oklab-function", withPrimary("oklab(0.5 0.1 0.1)"), color("/colors/primary")],
  ["color-hex-four-digits", withPrimary("#abcd"), color("/colors/primary")],
  [
    "shadow-rgb-out-of-range",
    { ...clone(), shadows: { ...base["shadows"], sm: "0 1px 2px 0 rgb(256 0 0)" } },
    [{ code: "token.shadow.invalid", path: "/shadows/sm" }],
  ],
  [
    "shadow-em-unit",
    { ...clone(), shadows: { ...base["shadows"], sm: "0 1em 2px 0 #000" } },
    [{ code: "token.shadow.invalid", path: "/shadows/sm" }],
  ],
  [
    "shadow-rgb-comma",
    { ...clone(), shadows: { ...base["shadows"], sm: "0 1px 2px 0 rgb(0, 0, 0)" } },
    [{ code: "token.shadow.invalid", path: "/shadows/sm" }],
  ],
  [
    "colors-dark-missing-key",
    withDark({ primary: "#fff", surface: "#000", foreground: "#fff", muted: "#999" }),
    [{ code: "field.required", path: "/colorsDark/accent" }],
  ],
  [
    "colors-dark-unknown-key",
    withDark({ ...DARK_HEX, brand: "#fff" }),
    [{ code: "field.unknown", path: "/colorsDark/brand" }],
  ],
  ["colors-dark-not-object", withDark("dark"), [{ code: "field.wrong_type", path: "/colorsDark" }]],
  ["colors-dark-null", withDark(null), [{ code: "field.wrong_type", path: "/colorsDark" }]],
  [
    "colors-dark-empty-object",
    withDark({}),
    ["accent", "foreground", "muted", "primary", "surface"].map((key) => ({
      code: "field.required",
      path: `/colorsDark/${key}`,
    })),
  ],
  [
    "colors-dark-invalid-color",
    withDark({ ...DARK_HEX, surface: "black" }),
    color("/colorsDark/surface"),
  ],
  [
    "colors-dark-out-of-range",
    withDark({ ...DARK_HEX, accent: "oklch(2 0 0)" }),
    color("/colorsDark/accent"),
  ],
  [
    "colors-dark-wrong-type",
    withDark({ ...DARK_HEX, muted: 5 }),
    [{ code: "field.wrong_type", path: "/colorsDark/muted" }],
  ],
  [
    "unit-em-radius",
    { ...clone(), radius: { ...base["radius"], md: "1em" } },
    length("/radius/md"),
  ],
  [
    "unit-em-gutter",
    { ...clone(), layout: { ...base["layout"], gutter: "1em" } },
    length("/layout/gutter"),
  ],
  [
    "unit-em-content-width",
    { ...clone(), layout: { ...base["layout"], contentWidth: "40em" } },
    length("/layout/contentWidth"),
  ],
  [
    "unit-percent-gutter",
    { ...clone(), layout: { ...base["layout"], gutter: "5%" } },
    length("/layout/gutter"),
  ],
  [
    "unit-ch-spacing",
    { ...clone(), spacing: { ...base["spacing"], md: "2ch" } },
    length("/spacing/md"),
  ],
  [
    "unit-vw-type-scale",
    { ...clone(), typeScale: { ...base["typeScale"], lg: "2vw" } },
    length("/typeScale/lg"),
  ],
  [
    "unit-percent-type-scale",
    { ...clone(), typeScale: { ...base["typeScale"], lg: "120%" } },
    length("/typeScale/lg"),
  ],
  [
    "unit-ch-radius",
    { ...clone(), radius: { ...base["radius"], sm: "1ch" } },
    length("/radius/sm"),
  ],
  [
    "unit-uppercase-em",
    { ...clone(), typeScale: { ...base["typeScale"], lg: "1EM" } },
    length("/typeScale/lg"),
  ],
  [
    "unit-vh-width",
    { ...clone(), layout: { ...base["layout"], wideWidth: "80vh" } },
    length("/layout/wideWidth"),
  ],
  [
    "unit-ch-negative",
    { ...clone(), layout: { ...base["layout"], contentWidth: "-65ch" } },
    length("/layout/contentWidth"),
  ],
];
const expected = JSON.parse(readFileSync(join(V2, "invalid/expected.json"), "utf8")) as Record<
  string,
  { errors: Expected }
>;
// v1 fixtures whose meaning changed in v2 are rewritten in place (see the contract notes).
expected["color-rgb-function.json"] = { errors: color("/colors/primary") };
expected["version-unsupported.json"] = {
  errors: [{ code: "schema.version_unsupported", path: "/schemaVersion" }],
};
for (const [name, config, errors] of invalid) {
  config["schemaVersion"] = 2;
  write(join(V2, "invalid", `${name}.json`), line(config));
  expected[`${name}.json`] = { errors };
}
write(
  join(V2, "invalid/expected.json"),
  `${JSON.stringify(Object.fromEntries(Object.entries(expected).sort(([a], [b]) => (a < b ? -1 : 1))), null, 2)}\n`,
);

// ---- migrations: v1 inputs and their normalized v2 results (from the PHP code)
const migrationInputs = [
  "default",
  "generic-fonts",
  "mixed-case-colors",
  "short-hex",
  "alpha-hex",
  "shadow-inset-four-layers",
];
for (const name of migrationInputs) {
  write(
    join(V2, "migrations", `v1-${name}.input.json`),
    readFileSync(join(V1, "valid", `${name}.json`), "utf8"),
  );
}

// ---- goldens from PHP
type Row = {
  ok: boolean;
  css: string;
  themeJson: unknown;
  canonical: string;
  hash: string;
  cssKeys: Record<string, string>;
  cssSchemes: Record<string, string>;
};
function php(inputs: string[]): Row[] {
  const result = spawnSync("php", [join(ROOT, "tests/03-02/php-cli.php")], {
    input: JSON.stringify(inputs.map((text) => Buffer.from(text).toString("base64"))),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout) as Row[];
}
const goldenNames = ["default", "generic-fonts", "colors-dark", "colors-dark-mixed-formats"];
const rows = php(
  goldenNames.map((name) => readFileSync(join(V2, "valid", `${name}.json`), "utf8")),
);
goldenNames.forEach((name, index) => {
  const row = rows[index];
  if (row === undefined || !row.ok) throw new Error(`golden input ${name} is not valid`);
  write(join(V2, "golden", `${name}.tokens.css`), row.cssSchemes["system"] ?? "");
  write(
    join(V2, "golden", `${name}.theme.json`),
    `${JSON.stringify(canonical(row.themeJson), null, 2)}\n`,
  );
  if (name.startsWith("colors-dark")) {
    write(join(V2, "golden", `${name}.light.tokens.css`), row.cssSchemes["light"] ?? "");
    write(join(V2, "golden", `${name}.dark.tokens.css`), row.cssSchemes["dark"] ?? "");
  }
});
const migrated = php(
  migrationInputs.map((name) => readFileSync(join(V1, "valid", `${name}.json`), "utf8")),
);
migrationInputs.forEach((name, index) => {
  const row = migrated[index];
  if (row === undefined || !row.ok) throw new Error(`migration input ${name} is not valid`);
  write(join(V2, "migrations", `v1-${name}.v2.golden.json`), `${row.canonical}\n`);
});
const keysPath = join(V2, "golden/cache-keys.json");
const keys = JSON.parse(readFileSync(join(V1, "golden/cache-keys.json"), "utf8")) as Json;
const first = rows[0];
const dark = rows[2];
if (first === undefined || dark === undefined) throw new Error("missing rows");
keys["css"] = {
  default: first.cssKeys["system"],
  hash: first.hash,
  canonical: first.canonical,
  dark: {
    system: dark.cssKeys["system"],
    light: dark.cssKeys["light"],
    dark: dark.cssKeys["dark"],
    hash: dark.hash,
  },
};
for (const entry of keys["render"] as Json[]) {
  if (entry["input"].configHash === "d0971b71c5fc554c") entry["input"].configHash = first.hash;
  entry["page"] = String(entry["page"]).replace("d0971b71c5fc554c", first.hash);
}
write(keysPath, `${JSON.stringify(keys, null, 2)}\n`);
