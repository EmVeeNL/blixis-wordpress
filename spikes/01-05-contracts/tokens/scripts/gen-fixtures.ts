// Writes the token fixtures, JSON Schema, and raw-byte cases into docs/contracts/tokens/v1.
// Run with: node tokens/scripts/gen-fixtures.ts (from spikes/01-05-contracts).
import { Buffer } from "node:buffer";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONTRACT, tokenMap } from "../src/contract.ts";

type Tree = Record<string, unknown>;
type Err = { code: string; path: string };

const base = (): Tree => ({
  schemaVersion: 1,
  theme: { slug: "blixis-starter", parent: "blixis-base" },
  colors: {
    primary: "#155dfc",
    surface: "#ffffff",
    foreground: "#101828",
    muted: "#64748b",
    accent: "#06b6d4",
  },
  fonts: { body: "Local Sans", heading: "Local Sans", mono: "monospace" },
  typeScale: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "2rem",
  },
  spacing: { xs: "0.5rem", sm: "0.75rem", md: "1rem", lg: "1.5rem", xl: "2.5rem" },
  radius: { sm: "0.375rem", md: "0.75rem", lg: "1.25rem" },
  layout: { contentWidth: "42rem", wideWidth: "72rem", gutter: "1.5rem" },
  shadows: {
    sm: "0 1px 2px 0 #0000001a",
    md: "0 4px 6px -1px #0000001a, 0 2px 4px -2px #0000001a",
    lg: "none",
  },
  motion: {
    durationFast: "120ms",
    durationBase: "200ms",
    durationSlow: "320ms",
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
  breakpoints: { sm: "40rem", md: "48rem", lg: "64rem", xl: "80rem" },
});

function mutate(path: string, value: unknown): Tree {
  const root = base();
  const parts = path.split(".");
  let node = root;
  for (const part of parts.slice(0, -1)) node = node[part] as Tree;
  const leaf = parts.at(-1) ?? "";
  if (value === undefined) Reflect.deleteProperty(node, leaf);
  else node[leaf] = value;
  return root;
}

function pointer(path: string): string {
  return `/${path.split(".").join("/")}`;
}

const invalid: { name: string; body: unknown; errors: Err[] }[] = [];
const bad = (name: string, path: string, value: unknown, code: string): void => {
  invalid.push({ name, body: mutate(path, value), errors: [{ code, path: pointer(path) }] });
};

// Colours
const C = "token.color.invalid";
bad("color-css-breakout", "colors.primary", "red;}body{display:none}", C);
bad("color-style-close", "colors.primary", "</style><script>alert(1)</script>", C);
bad("color-url", "colors.primary", "url(https://evil.test/x)", C);
bad("color-expression", "colors.primary", "expression(alert(1))", C);
bad("color-import", "colors.primary", '@import "https://evil.test/x.css"', C);
bad("color-var-smuggle", "colors.primary", "var(--x)", C);
bad("color-comment", "colors.primary", "#fff/*x*/", C);
bad("color-control-char", "colors.primary", "#fff\u0001", C);
bad("color-nul", "colors.primary", "#fff\u0000", C);
bad("color-trailing-newline", "colors.primary", "#fff\n", C);
bad("color-unicode-escape", "colors.primary", "\\23 fff", C);
bad("color-fullwidth-hash", "colors.primary", "\uff03fff", C);
bad("color-named", "colors.primary", "red", C);
bad("color-rgb-function", "colors.primary", "rgb(0, 0, 0)", C);
bad("color-five-digits", "colors.primary", "#12345", C);
bad("color-number", "colors.primary", 123, "field.wrong_type");
bad("color-null", "colors.primary", null, "field.wrong_type");
bad("color-array", "colors.primary", ["#fff"], "field.wrong_type");
bad("color-object", "colors.primary", { value: "#fff" }, "field.wrong_type");
bad("color-unknown-name", "colors.brand", "#fff", "field.unknown");
bad("color-missing", "colors.primary", undefined, "field.required");
// Fonts
const F = "token.font.invalid";
bad("font-double-quote-breakout", "fonts.body", 'Foo", serif; } body { display:none } /*', F);
bad("font-single-quote", "fonts.body", "Foo' bar", F);
bad("font-style-close", "fonts.body", "</style><script>alert(1)</script>", F);
bad("font-css-escape", "fonts.body", "Foo\\22 bar", F);
bad("font-url", "fonts.body", "url(https://evil.test/x.woff2)", F);
bad("font-var", "fonts.body", "var(--x)", F);
bad("font-comma-list", "fonts.body", "Arial, Evil", F);
bad("font-trailing-newline", "fonts.body", "Arial\n", F);
bad("font-too-long", "fonts.body", "A".repeat(65), F);
bad("font-non-ascii", "fonts.body", "\u00dcberschrift", F);
bad("font-double-space", "fonts.body", "Local  Sans", F);
bad("font-empty", "fonts.body", "", F);
// Spacing
const L = "token.length.invalid";
bad("spacing-css-breakout", "spacing.md", "1rem;}*{display:none}", L);
bad("spacing-calc-var", "spacing.md", "calc(1rem + var(--x))", L);
bad("spacing-var", "spacing.md", "var(--blixis-spacing-lg)", L);
bad("spacing-negative", "spacing.md", "-1rem", L);
bad("spacing-exponent", "spacing.md", "1e3px", L);
bad("spacing-no-unit", "spacing.md", "12", L);
bad("spacing-trailing-newline", "spacing.md", "1rem\n", L);
bad("spacing-leading-dot", "spacing.md", ".5rem", L);
bad("spacing-upper-unit", "spacing.md", "1REM", L);
bad("spacing-percent", "spacing.md", "10%", L);
bad("spacing-important", "spacing.md", "1rem !important", L);
bad("spacing-comment", "spacing.md", "1rem/**/", L);
bad("spacing-unicode-digit", "spacing.md", "\u0661rem", L);
// Radii and widths
bad("radius-var", "radius.md", "var(--x)", L);
bad("radius-url", "radius.md", "url(x)", L);
bad("radius-unknown-name", "radius.xl", "1rem", "field.unknown");
bad("width-expression", "layout.contentWidth", "expression(alert(1))", L);
bad("width-viewport-unit", "layout.contentWidth", "100vw", L);
bad("width-boolean", "layout.wideWidth", true, "field.wrong_type");
// Type scale
bad("type-clamp", "typeScale.lg", "clamp(1rem, 2vw, 2rem)", L);
// Shadows
const S = "token.shadow.invalid";
bad("shadow-url", "shadows.sm", "0 0 1px 0 url(x)", S);
bad("shadow-css-breakout", "shadows.sm", "0 0 0 0 #000;}body{display:none}", S);
bad("shadow-named-color", "shadows.sm", "0 0 1px 0 red", S);
bad("shadow-comment", "shadows.sm", "0 0 1px 0 #000/*x*/", S);
bad("shadow-var", "shadows.sm", "var(--x)", S);
bad(
  "shadow-five-layers",
  "shadows.lg",
  Array.from({ length: 5 }, () => "0 0 1px 0 #000").join(", "),
  S,
);
// Motion
bad("motion-seconds", "motion.durationFast", "1s", "token.duration.invalid");
bad("motion-negative", "motion.durationFast", "-1ms", "token.duration.invalid");
bad("motion-breakout", "motion.durationBase", "1ms;}body{}", "token.duration.invalid");
bad("easing-steps", "motion.easing", "steps(2)", "token.easing.invalid");
bad("easing-url", "motion.easing", "url(x)", "token.easing.invalid");
bad("easing-bezier-x-range", "motion.easing", "cubic-bezier(2, 0, 1, 1)", "token.easing.invalid");
bad("easing-var", "motion.easing", "var(--x)", "token.easing.invalid");
// Breakpoints
bad("breakpoint-px", "breakpoints.md", "768px", "token.breakpoint.invalid");
bad("breakpoint-var", "breakpoints.md", "var(--blixis-breakpoint-md)", "token.breakpoint.invalid");
bad("breakpoint-zero", "breakpoints.sm", "0rem", "token.breakpoint.invalid");
bad("breakpoint-not-ascending", "breakpoints.md", "30rem", "token.breakpoint.not_ascending");
bad("breakpoint-equal", "breakpoints.lg", "48rem", "token.breakpoint.not_ascending");
bad("breakpoint-editable-value", "breakpoints.md", "50rem", "token.breakpoint.not_preset");
bad("breakpoint-new-name", "breakpoints.2xl", "96rem", "field.unknown");
// Root and shape
bad("root-unknown-key", "extra", 1, "field.unknown");
bad("root-proto-key", "__proto__", { polluted: true }, "field.unknown");
bad("root-constructor-key", "constructor", "x", "field.unknown");
bad("version-unsupported", "schemaVersion", 2, "schema.version_unsupported");
bad("version-fraction", "schemaVersion", 1.5, "schema.version_unsupported");
bad("version-string", "schemaVersion", "1", "field.wrong_type");
bad("version-missing", "schemaVersion", undefined, "field.required");
bad("section-array", "colors", [], "field.wrong_type");
bad("section-string", "spacing", "1rem", "field.wrong_type");
bad("section-missing", "shadows", undefined, "field.required");
bad("slug-injection", "theme.slug", "x;}body{}", "token.slug.invalid");
bad("slug-traversal", "theme.slug", "../../wp-config", "token.slug.invalid");
bad("slug-wrong-type", "theme.slug", 1, "field.wrong_type");
bad("parent-other-theme", "theme.parent", "twentytwentyfive", "token.parent.invalid");
bad("theme-extra-key", "theme.textDomain", "x", "field.unknown");

// Bodies that are not a single mutation.
invalid.push({ name: "root-array", body: [], errors: [{ code: "config.not_object", path: "" }] });
invalid.push({ name: "root-string", body: "x", errors: [{ code: "config.not_object", path: "" }] });
invalid.push({
  name: "section-empty-object",
  body: mutate("colors", {}),
  errors: ["accent", "foreground", "muted", "primary", "surface"].map((key) => ({
    code: "field.required",
    path: `/colors/${key}`,
  })),
});
const slashKey = mutate("colors.a/b~c", "#fff");
invalid.push({
  name: "pointer-escaping",
  body: slashKey,
  errors: [{ code: "field.unknown", path: "/colors/a~1b~0c" }],
});
const several = base();
(several["colors"] as Tree)["primary"] = "red";
(several["spacing"] as Tree)["md"] = "var(--x)";
several["zzz"] = 1;
invalid.push({
  name: "several-errors-sorted",
  body: several,
  errors: [
    { code: "token.color.invalid", path: "/colors/primary" },
    { code: "token.length.invalid", path: "/spacing/md" },
    { code: "field.unknown", path: "/zzz" },
  ],
});

const valid: Record<string, unknown> = {
  default: base(),
  "reordered-keys": Object.fromEntries(Object.entries(base()).reverse()),
  "mixed-case-colors": mutate("colors.primary", "#155DFC"),
  "short-hex": mutate("colors.surface", "#FFF"),
  "alpha-hex": mutate("colors.muted", "#64748B80"),
  "generic-fonts": mutate("fonts", { body: "system-ui", heading: "serif", mono: "ui-monospace" }),
  "font-hyphen-digit": mutate("fonts.heading", "Noto Sans-2 Display"),
  "bare-zero-length": mutate("radius.sm", "0"),
  "shadow-inset-four-layers": mutate(
    "shadows.lg",
    "inset 0 1px 0 0 #fff, 0 1px 2px 0 #000, 0 2px 4px 0 #000, 0 4px 8px 0 #000",
  ),
  "named-easing": mutate("motion.easing", "ease-in-out"),
};

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

for (const directory of ["valid", "invalid"]) {
  rmSync(join(CONTRACT, directory), { recursive: true, force: true });
  mkdirSync(join(CONTRACT, directory), { recursive: true });
}
for (const [name, body] of Object.entries(valid)) {
  writeJson(join(CONTRACT, "valid", `${name}.json`), body);
}
// mixed-case and short-hex differ from default only in accepted spelling; keep them
// as one-token edits. schemaVersion 1.0 needs raw text, so write it by hand.
writeFileSync(
  join(CONTRACT, "valid", "version-float-spelling.json"),
  `${JSON.stringify(base()).replace('"schemaVersion":1', '"schemaVersion":1.0')}\n`,
);
const expected: Record<string, { errors: Err[] }> = {};
for (const { name, body, errors } of invalid) {
  // Object.fromEntries/assignment on __proto__ needs an own property in the fixture text.
  let text = JSON.stringify(body);
  if (name === "root-proto-key") text = text.replace(/\}$/, ',"__proto__":{"polluted":true}}');
  writeFileSync(join(CONTRACT, "invalid", `${name}.json`), `${text}\n`);
  expected[`${name}.json`] = { errors };
}
writeJson(join(CONTRACT, "invalid", "expected.json"), expected);

// Bytes that cannot live in a parseable .json fixture.
const invalidJson: Err[] = [{ code: "config.invalid_json", path: "" }];
const utf8 = (text: string): string => Buffer.from(text, "utf8").toString("base64");
const validText = JSON.stringify(base());
const rawCases = [
  { name: "empty", base64: "", errors: invalidJson },
  { name: "truncated", base64: utf8(validText.slice(0, 40)), errors: invalidJson },
  { name: "utf8-bom", base64: utf8(`\ufeff${validText}`), errors: invalidJson },
  {
    name: "invalid-utf8",
    base64: Buffer.concat([
      Buffer.from('{"schemaVersion":1,"x":"'),
      Buffer.from([0xc3, 0x28]),
      Buffer.from('"}'),
    ]).toString("base64"),
    errors: invalidJson,
  },
  { name: "lone-high-surrogate", base64: utf8('{"a":"\\ud800"}'), errors: invalidJson },
  { name: "lone-low-surrogate", base64: utf8('{"a":"\\udc00"}'), errors: invalidJson },
  { name: "lone-surrogate-in-key", base64: utf8('{"\\ud800":1}'), errors: invalidJson },
  { name: "nul-leading-key", base64: utf8('{"\\u0000a":1}'), errors: invalidJson },
  {
    name: "nul-leading-nested-key",
    base64: utf8('{"x":{"y":{"\\u0000":1}}}'),
    errors: invalidJson,
  },
  { name: "trailing-comma", base64: utf8('{"a":1,}'), errors: invalidJson },
  { name: "single-quotes", base64: utf8("{'a':1}"), errors: invalidJson },
  { name: "js-comment", base64: utf8('{"a":1}//x'), errors: invalidJson },
  { name: "nan-literal", base64: utf8('{"a":NaN}'), errors: invalidJson },
  { name: "raw-newline-in-string", base64: utf8('{"a":"b\nc"}'), errors: invalidJson },
  {
    name: "too-large",
    base64: utf8(`{"a":"${"x".repeat(tokenMap.limits.maxBytes)}"}`),
    errors: [{ code: "config.too_large", path: "" }],
  },
  {
    name: "too-deep",
    base64: utf8(`${"[".repeat(9)}${"]".repeat(9)}`),
    errors: [{ code: "config.too_deep", path: "" }],
  },
  {
    name: "very-deep-within-size",
    base64: utf8(`${"[".repeat(30000)}${"]".repeat(30000)}`),
    errors: [{ code: "config.too_deep", path: "" }],
  },
  {
    name: "deep-and-unterminated",
    base64: utf8("[".repeat(30000)),
    errors: [{ code: "config.too_deep", path: "" }],
  },
  {
    name: "brackets-in-strings-are-not-depth",
    base64: utf8(`{"a":"${"[".repeat(30)}"}`),
    errors: [{ code: "field.required", path: "/schemaVersion" }],
  },
  { name: "uppercase-true", base64: utf8('{"schemaVersion":TRUE}'), errors: invalidJson },
  { name: "mixed-case-null", base64: utf8('{"schemaVersion":nUlL}'), errors: invalidJson },
  {
    name: "duplicate-key-last-wins",
    base64: utf8(validText.replace(/\}$/, ',"schemaVersion":2}')),
    errors: [{ code: "schema.version_unsupported", path: "/schemaVersion" }],
  },
];
writeJson(join(CONTRACT, "raw-cases.json"), rawCases);

// JSON Schema from the same token map.
const stringOf = (pattern: string | undefined): Tree => ({ type: "string", pattern });
const properties: Tree = {
  schemaVersion: { const: tokenMap.contractVersion },
  theme: {
    type: "object",
    additionalProperties: false,
    required: ["slug", "parent"],
    properties: {
      slug: stringOf(tokenMap.grammars["slug"]),
      parent: { const: tokenMap.theme.parent },
    },
  },
};
for (const section of tokenMap.sections) {
  const keys = Object.keys(section.tokens);
  const entries: Tree = {};
  for (const key of keys) {
    let grammar = section.kind;
    if (section.kind === "motion") grammar = key === "easing" ? "easing" : "duration";
    entries[key] =
      section.kind === "breakpoint"
        ? { const: tokenMap.breakpointPreset[key] }
        : stringOf(tokenMap.grammars[grammar]);
  }
  properties[section.section] = {
    type: "object",
    additionalProperties: false,
    required: keys,
    properties: entries,
  };
}
writeJson(join(CONTRACT, "blixis-theme-config.schema.json"), {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://blixis.invalid/contracts/tokens/v1/blixis-theme-config.schema.json",
  title: "BlixisThemeConfig v1",
  description:
    "Generated from token-map.json. Patterns use ECMA-262 semantics; a PCRE implementation must add the D modifier, or $ accepts a trailing newline.",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "theme", ...tokenMap.sections.map((section) => section.section)],
  properties,
});
console.log(
  `valid ${Object.keys(valid).length + 1}, invalid ${invalid.length}, raw ${rawCases.length}`,
);
