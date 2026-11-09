// The configuration the form currently describes, and a client-side check of single values.
// This only decides what the previews show; the PHP validator decides what is saved.
import { type Config, type TokenMap, fieldGrammar, isColor } from "@blixis/tokens";
import type { Context } from "./dom.ts";

type Section = TokenMap["sections"][number];
const NAME = /^config\[([^\]]+)\]\[([^\]]+)\]$/;

function sectionFor(ctx: Context, name: string): Section | undefined {
  const lookup = name === "colorsDark" ? "colors" : name;
  return ctx.map.sections.find((section) => section.section === lookup);
}

export function isValidValue(
  ctx: Context,
  sectionName: string,
  key: string,
  value: string,
): boolean {
  const section = sectionFor(ctx, sectionName);
  if (section === undefined) return false;
  if (section.kind === "color") return isColor(value, ctx.map);
  const grammar = ctx.map.grammars[fieldGrammar(ctx.map, section, key)];
  return grammar !== undefined && new RegExp(grammar).test(value);
}

type Values = Record<string, Record<string, string>>;

// Every config[section][key] control on the page, over a copy of the page's draft.
export function readValues(ctx: Context): Values {
  const out: Values = {};
  for (const input of ctx.form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    '[name^="config["]',
  )) {
    const match = NAME.exec(input.name);
    if (match === null) continue;
    const [, section = "", key = ""] = match;
    (out[section] ??= {})[key] = input.value;
  }
  return out;
}

// A config for previews: form values where they are valid, the page's draft elsewhere, and a
// dark palette only when the user has filled one in (empty entries inherit the light colour).
export function previewConfig(ctx: Context): Config {
  const config = structuredClone(ctx.base) as Record<string, Record<string, string>>;
  const values = readValues(ctx);
  for (const [section, entries] of Object.entries(values)) {
    if (section === "colorsDark") continue;
    for (const [key, value] of Object.entries(entries)) {
      if (isValidValue(ctx, section, key, value)) (config[section] ??= {})[key] = value;
    }
  }
  const dark = values["colorsDark"];
  if (dark !== undefined && Object.values(dark).some((value) => value.trim() !== "")) {
    const light = config["colors"] ?? {};
    config["colorsDark"] = {};
    for (const [key, fallback] of Object.entries(light)) {
      const value = dark[key] ?? "";
      (config["colorsDark"] ??= {})[key] = isValidValue(ctx, "colorsDark", key, value)
        ? value
        : fallback;
    }
  } else if (dark !== undefined) {
    delete config["colorsDark"];
  }
  return config;
}
