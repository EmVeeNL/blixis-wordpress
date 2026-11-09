// Preview properties for the admin (task 03-02). The server generates the stylesheet;
// the preview only sets these values with style.setProperty after local validation.
import { type TokenMap, tokenMap } from "./token-map.ts";
import type { Config } from "./validate.ts";

function section(config: Config, name: string): Record<string, string> {
  return (config[name] ?? {}) as Record<string, string>;
}

export function fontStack(key: string, family: string, map: TokenMap = tokenMap): string {
  if (map.fontGenerics.includes(family)) return family;
  return `"${family}", ${map.fontFallbacks[key] ?? "sans-serif"}`;
}

export type PreviewScheme = "light" | "dark";

// The custom properties for a preview. With scheme "dark" the colours come from colorsDark when
// the config has one, otherwise from colors (the same fallback as the server's stylesheet).
export function previewProperties(
  config: Config,
  map: TokenMap = tokenMap,
  scheme: PreviewScheme = "light",
): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of map.sections) {
    if (part.buildOnly === true) continue;
    const dark =
      scheme === "dark" && part.section === "colors" && config["colorsDark"] !== undefined;
    const values = section(config, dark ? "colorsDark" : part.section);
    for (const [key, name] of Object.entries(part.tokens)) {
      if (name === null) continue;
      const value = values[key] ?? "";
      out.set(name, part.kind === "font" ? fontStack(key, value, map) : value);
    }
  }
  return out;
}
