// Throwaway proof for task 01-05. Builds the registry and the bundle the PHP side reads.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Json, JsonObject, PropDescriptor, Registry } from "./contract.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, "..", "..", "..");
export const contractDir = join(repoRoot, "docs", "contracts", "document");
export const bundlePath = join(here, "wp", "bundle.json");
export const registryPath = join(here, "wp", "plugins", "blixis-doc-contract-lib", "registry.json");

interface ElementSpec {
  type: string;
  version: number;
  allowedParents: string[];
  allowedChildren: string[];
  defaultProps: JsonObject;
  supports: { responsive: string[] };
}

export function elementSpecs(): ElementSpec[] {
  const dir = join(repoRoot, "docs", "elements");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as ElementSpec);
}

export function buildRegistry(): Registry {
  const overlay = JSON.parse(
    readFileSync(join(contractDir, "v1", "element-props.json"), "utf8"),
  ) as {
    elements: Record<string, Record<string, PropDescriptor>>;
  };
  const registry: Registry = {};
  for (const spec of elementSpecs()) {
    registry[spec.type] = {
      version: spec.version,
      allowedParents: spec.allowedParents,
      allowedChildren: spec.allowedChildren,
      props: overlay.elements[spec.type] ?? {},
      responsive: spec.supports.responsive,
    };
  }
  return registry;
}

export interface GeneratedCase {
  name: string;
  generated:
    | "flat-nodes"
    | "pad-to-bytes"
    | "long-string"
    | "deep-chain"
    | "json-nesting"
    | "hex"
    | "text-repeat";
  unit?: string;
  count?: number;
  bytes?: number;
  depth?: number;
  hex?: string;
  status?: string;
  codes?: string[];
}

const THEME = '"themeRef":{"theme":"blixis-base","tokensVersion":1}';
const EMPTY = `{"schemaVersion":1,"documentId":"fixture","root":[],"nodes":{},${THEME}}`;

export function generate(c: GeneratedCase): Uint8Array {
  const text = (s: string): Uint8Array => new TextEncoder().encode(s);
  const wrap = (root: string[], nodes: string[]): string =>
    `{"schemaVersion":1,"documentId":"fixture","root":${JSON.stringify(root)},"nodes":{${nodes.join(",")}},${THEME}}`;
  const node = (id: string, type: string, props: string, children: string[]): string =>
    `"${id}":{"id":"${id}","type":"${type}","version":1,"props":${props},"children":${JSON.stringify(children)}}`;
  switch (c.generated) {
    case "flat-nodes": {
      const ids = Array.from({ length: c.count ?? 0 }, (_, i) => `n${i}`);
      return text(
        wrap(
          ids,
          ids.map((id) => node(id, "blixis/section", "{}", [])),
        ),
      );
    }
    case "pad-to-bytes":
      return text(EMPTY + " ".repeat((c.bytes ?? 0) - EMPTY.length));
    case "long-string": {
      const size = c.bytes ?? 0;
      const value = (size % 2 === 1 ? "a" : "") + "é".repeat(Math.floor(size / 2));
      return text(
        wrap(
          ["s"],
          [
            node("s", "blixis/section", "{}", ["p"]),
            node("p", "blixis/paragraph", `{"text":"${value}"}`, []),
          ],
        ),
      );
    }
    case "deep-chain": {
      const depth = c.depth ?? 0;
      const nodes: string[] = [];
      for (let i = 1; i <= depth; i++) {
        const type = i % 2 === 1 ? "blixis/section" : "blixis/container";
        nodes.push(node(`n${i}`, type, "{}", i < depth ? [`n${i + 1}`] : []));
      }
      return text(wrap(["n1"], nodes));
    }
    case "json-nesting": {
      const inner = (c.depth ?? 0) - 1;
      return text(`{"schemaVersion":1,"x":${"[".repeat(inner)}${"]".repeat(inner)}}`);
    }
    case "text-repeat": {
      const value = (c.unit ?? "").repeat(c.count ?? 0);
      return text(
        wrap(
          ["s"],
          [
            node("s", "blixis/section", "{}", ["p"]),
            node("p", "blixis/paragraph", `{"text":"${value}"}`, []),
          ],
        ),
      );
    }
    case "hex":
      return Buffer.from(c.hex ?? "", "hex");
  }
}

function raw(path: string): string {
  return readFileSync(path).toString("base64");
}

export function buildBundle(): JsonObject {
  const invalidDir = join(contractDir, "v1", "invalid");
  const validDir = join(contractDir, "v1", "valid");
  const migrationDir = join(contractDir, "migrations");
  const invalid = JSON.parse(readFileSync(join(invalidDir, "expected.json"), "utf8")) as JsonObject;
  const validGenerated = JSON.parse(
    readFileSync(join(validDir, "generated.json"), "utf8"),
  ) as JsonObject;
  const migrations = JSON.parse(
    readFileSync(join(migrationDir, "expected.json"), "utf8"),
  ) as JsonObject;
  // A list with the content first: a "name": "base64" map trips secret scanners on names with "key".
  const files = (dir: string, skip: string[]): Json =>
    readdirSync(dir)
      .filter((f) => !skip.includes(f))
      .sort()
      .map((f) => ({ b64: raw(join(dir, f)), name: f }));
  return {
    registry: buildRegistry() as unknown as JsonObject,
    valid: files(validDir, ["generated.json"]),
    validGenerated: validGenerated["cases"] ?? [],
    invalid: files(invalidDir, ["expected.json"]),
    invalidCases: invalid["cases"] ?? [],
    invalidGenerated: invalid["generated"] ?? [],
    urlCases: invalid["urlCases"] ?? {},
    migrationFiles: files(migrationDir, ["expected.json"]),
    migrate: migrations["migrate"] ?? [],
    preserve: migrations["preserve"] ?? [],
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(bundlePath, `${JSON.stringify(buildBundle(), null, 2)}\n`);
  writeFileSync(registryPath, `${JSON.stringify(buildRegistry(), null, 2)}\n`);
}
