// Loads the versioned contract files. Throwaway proof code for task 01-05.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const SPIKE_TOKENS = resolve(here, "..");
export const REPO_ROOT = resolve(here, "../../../..");
export const CONTRACT = join(REPO_ROOT, "docs/contracts/tokens/v1");
export const FRONTEND = join(REPO_ROOT, "spikes/01-02-compatibility/frontend");

export type Section = {
  section: string;
  kind: string;
  buildOnly?: boolean;
  tokens: Record<string, string | null>;
};

export type TokenMap = {
  contractVersion: number;
  generatorVersion: number;
  limits: { maxBytes: number; maxDepth: number };
  grammars: Record<string, string>;
  errorCodes: Record<string, string>;
  theme: { parent: string };
  fontGenerics: string[];
  fontFallbacks: Record<string, string>;
  breakpointPreset: Record<string, string>;
  sections: Section[];
};

export function readContractJson<T>(relative: string): T {
  return JSON.parse(readFileSync(join(CONTRACT, relative), "utf8")) as T;
}

export const tokenMap = readContractJson<TokenMap>("token-map.json");

export function listFixtures(directory: "valid" | "invalid"): string[] {
  return readdirSync(join(CONTRACT, directory))
    .filter((name) => name.endsWith(".json") && name !== "expected.json")
    .sort();
}

export function readFixtureBytes(directory: "valid" | "invalid", name: string): Uint8Array {
  return readFileSync(join(CONTRACT, directory, name));
}
