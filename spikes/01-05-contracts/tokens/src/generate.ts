// Conformance oracle for the PHP generator. PHP is the declared single generator;
// this copy exists only so tests can detect byte drift. See docs/contracts/tokens.
import { createHash } from "node:crypto";
import { type TokenMap, tokenMap } from "./contract.ts";
import type { Config } from "./validate.ts";

type Tree = Record<string, unknown>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object" && value !== null) {
    const out: Tree = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize((value as Tree)[key]);
    return out;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  // Integer-like keys ("2xl" is not, but "0" would be) reorder in JS objects.
  // v1 has no integer-like keys, and a fixture test pins the resulting bytes.
  return JSON.stringify(canonicalize(value));
}

export function configHash(config: Config): string {
  return createHash("sha256").update(canonicalJson(config)).digest("hex").slice(0, 16);
}

function section(config: Config, name: string): Record<string, string> {
  return (config[name] ?? {}) as Record<string, string>;
}

export function fontStack(key: string, family: string, map: TokenMap = tokenMap): string {
  if (map.fontGenerics.includes(family)) return family;
  return `"${family}", ${map.fontFallbacks[key] ?? "sans-serif"}`;
}

export function cssVariables(config: Config, map: TokenMap = tokenMap): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of map.sections) {
    if (part.buildOnly === true) continue;
    const values = section(config, part.section);
    for (const [key, name] of Object.entries(part.tokens)) {
      if (name === null) continue;
      const value = values[key] ?? "";
      out.set(name, part.kind === "font" ? fontStack(key, value, map) : value);
    }
  }
  return out;
}

export function generateCss(config: Config, map: TokenMap = tokenMap): string {
  const lines = [
    `/* Blixis tokens: contract ${map.contractVersion}, generator ${map.generatorVersion}, config ${configHash(config)} */`,
    ":root {",
  ];
  for (const [name, value] of cssVariables(config, map)) lines.push(`  ${name}: ${value};`);
  lines.push("}", "@media (prefers-reduced-motion: reduce) {", "  :root {");
  const motion = map.sections.find((part) => part.section === "motion");
  for (const [key, name] of Object.entries(motion?.tokens ?? {})) {
    if (key !== "easing" && name !== null) lines.push(`    ${name}: 0ms;`);
  }
  lines.push("  }", "}", "");
  return lines.join("\n");
}

function label(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

export function generateThemeJson(config: Config, map: TokenMap = tokenMap): Tree {
  const presets = (name: string, build: (slug: string, value: string) => Tree): Tree[] =>
    Object.entries(section(config, name)).map(([slug, value]) => ({
      slug,
      name: label(slug),
      ...build(slug, value),
    }));
  const layout = section(config, "layout");
  const motion = section(config, "motion");
  return {
    version: 3,
    settings: {
      color: {
        defaultPalette: false,
        palette: presets("colors", (_slug, color) => ({ color })),
      },
      typography: {
        defaultFontSizes: false,
        fontFamilies: presets("fonts", (slug, family) => ({
          fontFamily: fontStack(slug, family, map),
        })),
        fontSizes: presets("typeScale", (_slug, size) => ({ size, fluid: false })),
      },
      spacing: {
        defaultSpacingSizes: false,
        spacingSizes: presets("spacing", (_slug, size) => ({ size })),
      },
      border: {
        radiusSizes: presets("radius", (_slug, size) => ({ size })),
      },
      shadow: {
        defaultPresets: false,
        presets: presets("shadows", (_slug, shadow) => ({ shadow })),
      },
      layout: { contentSize: layout["contentWidth"], wideSize: layout["wideWidth"] },
      custom: {
        blixis: {
          layout: { gutter: layout["gutter"] },
          motion: {
            durationFast: motion["durationFast"],
            durationBase: motion["durationBase"],
            durationSlow: motion["durationSlow"],
            easing: motion["easing"],
          },
        },
      },
    },
    styles: {
      color: { background: "var:preset|color|surface", text: "var:preset|color|foreground" },
    },
  };
}

export function cssCacheKey(config: Config, map: TokenMap = tokenMap): string {
  return `blixis:css:c${map.contractVersion}:g${map.generatorVersion}:${configHash(config)}`;
}

export type RenderKeyInput = {
  postId: number;
  documentHash: string;
  rendererVersion: number;
  registryHash: string;
  status: string;
  hasPassword: boolean;
  configHash: string;
};

export function fragmentCacheKey(input: RenderKeyInput): string | null {
  if (input.status !== "publish" || input.hasPassword) return null;
  return `blixis:html:p${input.postId}:d${input.documentHash}:v${input.rendererVersion}:${input.registryHash}`;
}

export function pageCacheKey(input: RenderKeyInput): string | null {
  const fragment = fragmentCacheKey(input);
  return fragment === null
    ? null
    : `${fragment.replace("blixis:html:", "blixis:page:")}:${input.configHash}`;
}
