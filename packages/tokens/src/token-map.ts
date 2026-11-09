// The token map: closed names, grammars, error codes, limits, and the breakpoint preset.
// token-map.json is a copy of docs/contracts/tokens/v1/token-map.json; a test keeps them identical.
import map from "./token-map.json" with { type: "json" };

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

export const tokenMap = map as TokenMap;
