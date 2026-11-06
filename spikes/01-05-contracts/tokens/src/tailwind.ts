// Tailwind 4.3.5 boundary helpers. Tailwind comes from the 01-02 package; no new dependency.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FRONTEND, REPO_ROOT, tokenMap } from "./contract.ts";
import { registry } from "./resolve.ts";
import { stripVTControlCharacters } from "node:util";

// Imports utilities only: no preflight and no cascade layer. WordPress global styles are
// unlayered, and any unlayered rule beats any layered rule whatever its specificity.
// Maps every runtime token to a build-time utility namespace. @theme inline makes utilities
// read --blixis-* directly, so a scoped override works; see tailwind.test.ts.
const NAMESPACE: Record<string, string> = {
  colors: "--color-",
  fonts: "--font-",
  typeScale: "--text-",
  spacing: "--spacing-",
  radius: "--radius-",
  shadows: "--shadow-",
};

export function tailwindThemeCss(): string {
  const lines = [
    "/* Golden build-time mapping. Names and breakpoints are compiled; values are read at runtime. */",
    '@import "tailwindcss/utilities.css" source(none);',
    '@source "./safelist.html";',
    "",
    "@theme {",
    "  --*: initial;",
  ];
  for (const [name, value] of Object.entries(tokenMap.breakpointPreset)) {
    lines.push(`  --breakpoint-${name}: ${value};`);
  }
  lines.push("}", "", "@theme inline {");
  for (const section of tokenMap.sections) {
    const prefix = NAMESPACE[section.section];
    if (prefix === undefined) continue;
    for (const [key, variable] of Object.entries(section.tokens)) {
      lines.push(`  ${prefix}${key}: var(${variable});`);
    }
  }
  lines.push("}", "");
  return lines.join("\n");
}

// Every class the renderer can emit: table values times breakpoint prefixes.
export function allRendererClasses(): string[] {
  const out = new Set<string>();
  for (const table of Object.values(registry.classes)) {
    for (const value of Object.values(table)) {
      for (const name of value.split(" ")) {
        out.add(name);
        for (const bp of registry.breakpoints) out.add(`${bp}:${name}`);
      }
    }
  }
  return [...out].sort();
}

export function compileTailwind(directory: string, css: string, html: string): string {
  const root = join(FRONTEND, "node_modules/tailwindcss");
  writeFileSync(
    join(directory, "input.css"),
    css
      .replace('"tailwindcss/utilities.css"', JSON.stringify(join(root, "utilities.css")))
      .replace('"tailwindcss"', JSON.stringify(join(root, "index.css"))),
  );
  writeFileSync(join(directory, "safelist.html"), html);
  const result = spawnSync(
    "npx",
    [
      "-y",
      "pnpm@12.18.0",
      "--filter",
      "blixis-compat-spike-frontend",
      "exec",
      "tailwindcss",
      "-i",
      join(directory, "input.css"),
      "-o",
      join(directory, "output.css"),
    ],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(`tailwindcss failed: ${result.stderr}`);
  // CI forces colour, so the banner holds ANSI codes.
  if (!stripVTControlCharacters(result.stderr).includes("tailwindcss v4.3.5")) {
    throw new Error(`unexpected Tailwind version: ${result.stderr}`);
  }
  return readFileSync(join(directory, "output.css"), "utf8");
}
