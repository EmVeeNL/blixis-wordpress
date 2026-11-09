// Builds the token contract v2 files that are derived rather than written by hand:
// token-map.json (and its two shipped copies) and the JSON Schema. Grammars are composed
// from named parts here so that a format or unit is defined once.
//
//   node scripts/build-contract.ts           write the files
//   node scripts/build-contract.ts --check   fail if a file differs (used by the tests)
//
// Run from packages/tokens. A changed output is a contract change: review it.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const V1 = join(ROOT, "docs/contracts/tokens/v1/token-map.json");
const OUT_MAP = join(ROOT, "docs/contracts/tokens/v2/token-map.json");
const OUT_SCHEMA = join(ROOT, "docs/contracts/tokens/v2/blixis-theme-config.schema.json");
const COPIES = [
  join(ROOT, "packages/tokens/src/token-map.json"),
  join(ROOT, "plugins/blixis-blocks/inc/tokens/token-map.json"),
];

type Range = { min: number; max: number; step: number };
type Json = Record<string, unknown>;

// Colour grammar parts. Modern space-separated syntax only; numbers have no sign, no
// leading zero, no exponent. Ranges are checked after the pattern (see colorRanges).
const N = String.raw`(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,6})?`;
const P = `${N}%`;
const ALPHA = String.raw`(?: / (?:${N}|${P}))?`;
const HEX = "#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})";
const RGB = String.raw`rgb\((?:${N} ${N} ${N}|${P} ${P} ${P})${ALPHA}\)`;
const HSL = String.raw`hsl\(${N} ${P} ${P}${ALPHA}\)`;
const OKLCH = String.raw`oklch\((?:${N}|${P}) ${N} ${N}${ALPHA}\)`;
const COLOR = `(?:${HEX}|${RGB}|${HSL}|${OKLCH})`;

const lengthPart = (units: string[]): string =>
  String.raw`(?:0|(?:[1-9][0-9]{0,3}|0)(?:\.[0-9]{1,4})?(?:${units.join("|")}))`;
const shadowLength = String.raw`(?:0|(?:[1-9][0-9]{0,2}|0)(?:\.[0-9]{1,3})?(?:rem|px))`;
const layer = `(?:inset )?-?${shadowLength} -?${shadowLength} ${shadowLength} -?${shadowLength} ${COLOR}`;

// The v1 grammars, kept so a stored v1 config is validated by the rules it was written under.
const V1_LENGTH = lengthPart(["rem", "px"]);
const V1_HEX = HEX;
const v1ShadowLength = shadowLength;
const v1Layer = `(?:inset )?-?${v1ShadowLength} -?${v1ShadowLength} ${v1ShadowLength} -?${v1ShadowLength} ${V1_HEX}`;

const grammars = {
  slug: "^[a-z][a-z0-9-]{0,62}$",
  color: `^${COLOR}$`,
  font: "^(?=.{1,64}$)[A-Za-z][A-Za-z0-9]*(?:[ -][A-Za-z0-9]+){0,7}$",
  length: `^${lengthPart(["rem", "px"])}$`,
  lengthEm: `^${lengthPart(["rem", "px", "em"])}$`,
  lengthWidth: `^${lengthPart(["rem", "px", "%", "ch", "vw"])}$`,
  shadow: `^(?:none|${layer}(?:, ${layer}){0,3})$`,
  duration: "^(?:0|[1-9][0-9]{0,3})ms$",
  easing: String.raw`^(?:linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\((?:0(?:\.[0-9]{1,3})?|1(?:\.0{1,3})?), -?[0-9](?:\.[0-9]{1,3})?, (?:0(?:\.[0-9]{1,3})?|1(?:\.0{1,3})?), -?[0-9](?:\.[0-9]{1,3})?\))$`,
  breakpoint: String.raw`^[1-9][0-9]{0,2}(?:\.[0-9]{1,2})?rem$`,
};

const legacyGrammars = {
  color: `^${V1_HEX}$`,
  length: `^${V1_LENGTH}$`,
  lengthEm: `^${V1_LENGTH}$`,
  lengthWidth: `^${V1_LENGTH}$`,
  shadow: `^(?:none|${v1Layer}(?:, ${v1Layer}){0,3})$`,
};

// Slider ranges. rem is the design unit; px is 16 times rem with whole-pixel steps; em equals rem.
const rem = (min: number, max: number, step = 0.0625): Range => ({ min, max, step });
const px = (r: Range): Range => ({ min: r.min * 16, max: r.max * 16, step: 1 });
function lengthField(
  grammar: string,
  units: string[],
  base: Range,
  own: Record<string, Range> = {},
): Json {
  const ranges: Record<string, Range> = {};
  for (const unit of units) {
    ranges[unit] = own[unit] ?? (unit === "px" ? px(base) : base);
  }
  return { grammar, units, defaultUnit: units.includes("rem") ? "rem" : units[0], ranges };
}
const EM = ["px", "rem", "em"];
const LEN = ["px", "rem"];
const WIDTH = ["px", "rem", "%", "ch", "vw"];
const percent = (min: number, max: number): Range => ({ min, max, step: 1 });
const ms = (max: number): Json => ({
  grammar: "duration",
  units: ["ms"],
  defaultUnit: "ms",
  ranges: { ms: { min: 0, max, step: 10 } },
});

const fields: Json = {
  typeScale: {
    xs: lengthField("lengthEm", EM, rem(0.5, 1.5)),
    sm: lengthField("lengthEm", EM, rem(0.625, 1.75)),
    base: lengthField("lengthEm", EM, rem(0.75, 2)),
    lg: lengthField("lengthEm", EM, rem(0.875, 2.5)),
    xl: lengthField("lengthEm", EM, rem(1, 3)),
    "2xl": lengthField("lengthEm", EM, rem(1.125, 4)),
    "3xl": lengthField("lengthEm", EM, rem(1.25, 6)),
  },
  spacing: {
    xs: lengthField("lengthEm", EM, rem(0.125, 1.5)),
    sm: lengthField("lengthEm", EM, rem(0.25, 2)),
    md: lengthField("lengthEm", EM, rem(0.5, 3)),
    lg: lengthField("lengthEm", EM, rem(0.75, 5)),
    xl: lengthField("lengthEm", EM, rem(1, 8)),
  },
  radius: {
    sm: lengthField("length", LEN, rem(0, 1)),
    md: lengthField("length", LEN, rem(0, 2)),
    lg: lengthField("length", LEN, rem(0, 4)),
  },
  layout: {
    contentWidth: lengthField("lengthWidth", WIDTH, rem(20, 75, 0.5), {
      px: { min: 320, max: 1200, step: 8 },
      "%": percent(30, 100),
      ch: percent(30, 100),
      vw: percent(30, 100),
    }),
    wideWidth: lengthField("lengthWidth", WIDTH, rem(30, 120, 0.5), {
      px: { min: 480, max: 1920, step: 8 },
      "%": percent(50, 100),
      ch: percent(40, 200),
      vw: percent(50, 100),
    }),
    gutter: lengthField("length", LEN, rem(0, 6)),
  },
  motion: {
    durationFast: ms(500),
    durationBase: ms(800),
    durationSlow: ms(1500),
  },
};

const v1 = JSON.parse(readFileSync(V1, "utf8")) as Json;

const map: Json = {
  contractVersion: 2,
  generatorVersion: 2,
  limits: v1["limits"],
  legacyVersions: { "1": { grammars: legacyGrammars } },
  grammars,
  errorCodes: {
    color: "token.color.invalid",
    font: "token.font.invalid",
    length: "token.length.invalid",
    lengthEm: "token.length.invalid",
    lengthWidth: "token.length.invalid",
    shadow: "token.shadow.invalid",
    duration: "token.duration.invalid",
    easing: "token.easing.invalid",
    breakpoint: "token.breakpoint.invalid",
  },
  theme: v1["theme"],
  fontGenerics: v1["fontGenerics"],
  fontFallbacks: v1["fontFallbacks"],
  breakpointPreset: v1["breakpointPreset"],
  colorRanges: {
    rgbNumber: { min: 0, max: 255 },
    percent: { min: 0, max: 100 },
    hue: { min: 0, max: 360 },
    alphaNumber: { min: 0, max: 1 },
    oklchLightness: { min: 0, max: 1 },
    oklchChroma: { min: 0, max: 0.5 },
  },
  colorScheme: {
    option: "blixis_color_scheme",
    values: ["system", "light", "dark"],
    default: "system",
  },
  shadowControls: {
    offset: { unit: "px", min: -32, max: 32, step: 1 },
    blur: { unit: "px", min: 0, max: 64, step: 1 },
    spread: { unit: "px", min: -16, max: 32, step: 1 },
    opacity: { unit: "", min: 0, max: 1, step: 0.01 },
  },
  optionalSections: [{ section: "colorsDark", kind: "color", mirrors: "colors" }],
  fields,
  sections: v1["sections"],
};

// JSON Schema, generated from the map.
function schema(): Json {
  const sections = map["sections"] as {
    section: string;
    kind: string;
    tokens: Record<string, unknown>;
  }[];
  const fieldMap = fields as Record<string, Record<string, { grammar: string }>>;
  const pattern = (name: string): Json => ({
    type: "string",
    pattern: (grammars as Record<string, string>)[name],
  });
  const properties: Json = {
    schemaVersion: { const: 2 },
    theme: {
      type: "object",
      additionalProperties: false,
      required: ["slug", "parent"],
      properties: { slug: pattern("slug"), parent: { const: "blixis-base" } },
    },
  };
  const required = ["schemaVersion", "theme"];
  for (const part of sections) {
    const props: Json = {};
    for (const key of Object.keys(part.tokens)) {
      let grammar = part.kind;
      if (part.kind === "motion") grammar = key === "easing" ? "easing" : "duration";
      grammar = fieldMap[part.section]?.[key]?.grammar ?? grammar;
      props[key] = pattern(grammar);
    }
    properties[part.section] = {
      type: "object",
      additionalProperties: false,
      required: Object.keys(part.tokens),
      properties: props,
    };
    required.push(part.section);
  }
  const dark = JSON.parse(JSON.stringify(properties["colors"])) as Json;
  properties["colorsDark"] = dark;
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://blixis.invalid/contracts/tokens/v2/blixis-theme-config.schema.json",
    title: "BlixisThemeConfig v2",
    description:
      "Generated from token-map.json by packages/tokens/scripts/build-contract.ts. Patterns use ECMA-262 semantics; a PCRE implementation must add the D modifier, or $ accepts a trailing newline. Colour component ranges are checked by the validators, not by this schema. A stored version 1 config is migrated, not validated against this schema.",
    type: "object",
    additionalProperties: false,
    required,
    properties,
  };
}

const outputs = new Map<string, string>([
  [OUT_MAP, `${JSON.stringify(map, null, 2)}\n`],
  [OUT_SCHEMA, `${JSON.stringify(schema(), null, 2)}\n`],
  ...COPIES.map((copy): [string, string] => [copy, `${JSON.stringify(map, null, 2)}\n`]),
]);

if (process.argv.includes("--check")) {
  const stale = [...outputs].filter(([path, text]) => {
    try {
      return readFileSync(path, "utf8") !== text;
    } catch {
      return true;
    }
  });
  if (stale.length > 0) {
    console.error(`stale: ${stale.map(([path]) => path).join(", ")}`);
    process.exit(1);
  }
} else {
  for (const [path, text] of outputs) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
}
