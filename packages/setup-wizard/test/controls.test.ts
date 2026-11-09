import assert from "node:assert/strict";
import { test } from "node:test";
import { contrastRatio, isColor, tokenMap } from "@blixis/tokens";
import { checkPalette } from "../src/contrast.ts";
import { convertColor, detectFormat, fromPicker, pickerHex } from "../src/colorformat.ts";
import { hasChanged, labelFor } from "../src/label.ts";
import {
  convertUnit,
  effectiveRange,
  formatLength,
  parseLength,
  scaleScale,
} from "../src/length.ts";
import { EASINGS, easingFor } from "../src/motion.ts";
import {
  formatShadow,
  parseShadow,
  presetFor,
  SHADOW_PRESETS,
  shadowColor,
} from "../src/shadow.ts";

const fields = tokenMap.fields;
const scale = fields["typeScale"] ?? {};

void test("keep proportions scales every size by the base ratio and respects ranges", () => {
  const sizes = {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "2rem",
  };
  const out = scaleScale(sizes, "base", "1rem", "1.25rem", scale);
  assert.equal(out["base"], "1.25rem");
  assert.equal(out["sm"], "1.125rem", "0.875 * 1.25 = 1.09375, snapped to the 1/16 grid");
  assert.equal(out["xl"], "1.5625rem");
  // 2rem * 1.25 = 2.5rem, inside the 3xl range (1.25 to 6).
  assert.equal(out["3xl"], "2.5rem");
  // Ratios are kept at the same proportion (within the 1/16 step).
  const ratio = (a: string, b: string): number => parseLength(a)!.amount / parseLength(b)!.amount;
  assert.ok(Math.abs(ratio(out["3xl"]!, out["base"]!) - ratio(sizes["3xl"], sizes.base)) < 0.04);
});

void test("keep proportions clamps to the unit range and leaves a unit-only change alone", () => {
  const sizes = { xs: "0.75rem", base: "1rem", "3xl": "5rem" };
  const big = scaleScale(sizes, "base", "1rem", "2rem", scale);
  assert.equal(big["3xl"], "6rem", "clamped to the 3xl rem maximum");
  const same = scaleScale(sizes, "base", "1rem", "16px", scale);
  assert.equal(same["xs"], "0.75rem", "1rem to 16px is the same size");
  const mixed = scaleScale({ xs: "12px", base: "1rem" }, "base", "1rem", "1.5rem", scale);
  assert.equal(mixed["xs"], "18px", "px sizes scale in px");
  const unreadable = scaleScale({ xs: "oops", base: "1rem" }, "base", "1rem", "1.5rem", scale);
  assert.equal(unreadable["xs"], "oops");
});

void test("unit conversion keeps the size for px, rem and em", () => {
  const spacing = fields["spacing"]?.["md"];
  assert.ok(spacing);
  assert.deepEqual(convertUnit({ amount: 1, unit: "rem" }, "px", spacing), {
    amount: 16,
    unit: "px",
  });
  assert.deepEqual(convertUnit({ amount: 24, unit: "px" }, "rem", spacing), {
    amount: 1.5,
    unit: "rem",
  });
  assert.deepEqual(convertUnit({ amount: 1, unit: "rem" }, "em", spacing), {
    amount: 1,
    unit: "em",
  });
});

void test("units without a fixed relation keep their position in the range", () => {
  const width = fields["layout"]?.["contentWidth"];
  assert.ok(width);
  const converted = convertUnit({ amount: 42, unit: "rem" }, "%", width);
  assert.equal(converted.unit, "%");
  assert.ok(converted.amount >= 30 && converted.amount <= 100);
});

void test("slider ranges widen for stored values and come from the token map", () => {
  const radius = fields["radius"]?.["sm"];
  assert.ok(radius);
  assert.deepEqual(effectiveRange(radius, { amount: 0.5, unit: "rem" }), {
    min: 0,
    max: 1,
    step: 0.0625,
  });
  assert.equal(effectiveRange(radius, { amount: 3, unit: "rem" }).max, 3);
  assert.equal(formatLength({ amount: 0.1 + 0.2, unit: "rem" }), "0.3rem");
  assert.equal(formatLength({ amount: -0, unit: "px" }), "0px");
});

void test("every colour format converts, stays valid, and round-trips within a small error", () => {
  for (const source of [
    "#155dfc",
    "rgb(21 93 252)",
    "hsl(222.5 96% 54%)",
    "oklch(0.55 0.22 262)",
  ]) {
    for (const target of ["hex", "rgb", "hsl", "oklch"] as const) {
      const converted = convertColor(source, target);
      assert.ok(converted !== null, `${source} to ${target}`);
      assert.ok(isColor(converted), `${converted} passes the contract grammar`);
      assert.equal(detectFormat(converted), target);
      const ratio = contrastRatio(source, converted);
      assert.ok(
        ratio !== null && ratio < 1.08,
        `${source} as ${target} is the same colour (${ratio})`,
      );
    }
  }
  for (const target of ["hex", "rgb", "hsl", "oklch"] as const) {
    const translucent = convertColor("#155dfc80", target);
    assert.ok(translucent !== null && isColor(translucent), `translucent colour as ${target}`);
    assert.ok(translucent.includes("/") || target === "hex", "alpha is kept");
  }
  assert.equal(convertColor("#155dfc", "rgb"), "rgb(21 93 252)");
  assert.equal(convertColor("rgb(21 93 252)", "hex"), "#155dfc");
  assert.equal(convertColor("#fff", "hsl"), "hsl(0 0% 100%)");
  assert.equal(convertColor("#000", "oklch"), "oklch(0 0 0)");
  assert.equal(convertColor("#ffffff80", "rgb"), "rgb(255 255 255 / 0.502)");
  assert.equal(convertColor("not a colour", "hex"), null);
});

void test("an OKLCH colour outside sRGB is clipped to a valid colour in the other formats", () => {
  const out = convertColor("oklch(0.7 0.4 150)", "hex");
  assert.ok(out !== null && isColor(out));
});

void test("the picker shows an opaque hex for every format and keeps transparency when picking", () => {
  assert.equal(pickerHex("rgb(21 93 252)"), "#155dfc");
  assert.equal(pickerHex("oklch(1 0 0)"), "#ffffff");
  assert.equal(pickerHex("#155dfc80"), "#155dfc");
  assert.equal(pickerHex("nope"), null);
  assert.equal(fromPicker("#ff0000", "hsl(0 0% 0%)", "hsl"), "hsl(0 100% 50%)");
  assert.equal(fromPicker("#ff0000", "rgb(0 0 0 / 0.5)", "rgb"), "rgb(255 0 0 / 0.5)");
  assert.equal(fromPicker("#ff0000", "garbage", "hex"), "#ff0000");
});

void test("contrast checks use 4.5:1 for text, links and buttons and 3:1 for interface parts", () => {
  const checks = checkPalette({
    primary: "#155dfc",
    surface: "#ffffff",
    foreground: "#101828",
    muted: "#64748b",
    accent: "#06b6d4",
  });
  const by = (key: string, kind: string) => checks.find((c) => c.key === key && c.kind === kind);
  assert.equal(by("foreground", "text")?.pass, true);
  assert.equal(by("primary", "link")?.pass, true);
  assert.equal(by("primary", "button")?.pass, true);
  assert.equal(by("accent", "ui")?.required, 3);
  assert.equal(by("accent", "ui")?.pass, false, "cyan on white is about 2.4:1");
  const weak = checkPalette({
    primary: "#99aaff",
    surface: "#ffffff",
    foreground: "#cccccc",
    muted: "#999999",
    accent: "#06b6d4",
  });
  assert.equal(weak.find((c) => c.key === "foreground")?.pass, false);
  assert.equal(
    checkPalette({ surface: "#fff" }).every((c) => c.ratio === null),
    true,
  );
});

void test("the dark palette is checked on its own surface", () => {
  const dark = checkPalette({
    primary: "#7aa2ff",
    surface: "#0b1220",
    foreground: "#e6edf7",
    muted: "#9aa7bd",
    accent: "#22d3ee",
  });
  assert.ok(
    dark.every((c) => c.pass),
    JSON.stringify(dark.filter((c) => !c.pass)),
  );
});

void test("the main button label follows the rule in owner decision 6", () => {
  assert.equal(
    labelFor({ creating: true, themeStep: true, changed: true, initial: "create" }),
    "create",
  );
  assert.equal(
    labelFor({ creating: false, themeStep: true, changed: true, initial: "create" }),
    "continue",
  );
  assert.equal(
    labelFor({ creating: false, themeStep: false, changed: true, initial: "continue" }),
    "save",
  );
  assert.equal(
    labelFor({ creating: false, themeStep: false, changed: false, initial: "continue" }),
    "continue",
  );
  assert.equal(
    labelFor({ creating: false, themeStep: false, changed: false, initial: "save" }),
    "save",
    "a draft that already differs keeps its label",
  );
});

void test("restoring a value switches the label back", () => {
  const initial = new Map([["config[colors][primary]", "#155dfc"]]);
  assert.equal(hasChanged(initial, new Map([["config[colors][primary]", "#000000"]])), true);
  assert.equal(hasChanged(initial, new Map([["config[colors][primary]", "#155dfc"]])), false);
});

void test("shadow presets are valid contract values and are recognised", () => {
  const pattern = new RegExp(tokenMap.grammars["shadow"] ?? "^$");
  for (const preset of SHADOW_PRESETS) {
    assert.ok(pattern.test(preset.value), preset.value);
    assert.equal(presetFor(preset.value)?.id, preset.id);
  }
  assert.equal(presetFor("0 1px 2px 0 #00000000"), null);
});

void test("shadow layers parse and format back to contract values", () => {
  const layers = parseShadow("0 4px 6px -1px #0000001a, 0 2px 4px -2px #0000001a");
  assert.equal(layers?.length, 2);
  assert.equal(formatShadow(layers ?? []), "0 4px 6px -1px #0000001a, 0 2px 4px -2px #0000001a");
  assert.deepEqual(parseShadow("none"), []);
  assert.equal(formatShadow([]), "none");
  assert.equal(parseShadow("0 0.25rem 0.5rem 0 #000")?.[0]?.y, 4);
  assert.equal(parseShadow("nonsense"), null);
  const built = formatShadow([
    { inset: false, x: 2, y: 8, blur: 12, spread: -2, color: shadowColor("#102030", 0.25) },
  ]);
  assert.equal(built, "2px 8px 12px -2px #10203040");
  assert.ok(new RegExp(tokenMap.grammars["shadow"] ?? "^$").test(built));
});

void test("easing presets use plain names and valid contract values", () => {
  const pattern = new RegExp(tokenMap.grammars["easing"] ?? "^$");
  assert.deepEqual(
    EASINGS.map((e) => e.id),
    ["smooth", "gentle-start", "gentle-stop", "linear", "springy"],
  );
  for (const easing of EASINGS) assert.ok(pattern.test(easing.value), easing.value);
  assert.equal(easingFor("cubic-bezier(0.4, 0, 0.2, 1)")?.id, "smooth");
  assert.equal(easingFor("ease"), null);
});

void test("the stored duration range comes from the token map", () => {
  const range = fields["motion"]?.["durationFast"]?.ranges["ms"];
  assert.deepEqual(range, { min: 0, max: 500, step: 10 });
});
