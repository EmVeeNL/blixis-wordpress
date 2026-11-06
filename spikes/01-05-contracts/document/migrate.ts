// Throwaway proof for task 01-05. PHP twin: wp/plugins/blixis-doc-contract-lib/migrate.php.
// Schema v2 is HYPOTHETICAL. It exists only to exercise the migration boundary.
import { createHash } from "node:crypto";
import { isObject } from "./contract.ts";
import type { Json, JsonObject } from "./contract.ts";

export interface MigrationResult {
  ok: boolean;
  code: string | null;
  output: JsonObject | null;
}

const compareBytes = (a: string, b: string): number =>
  Buffer.compare(Buffer.from(a), Buffer.from(b));

/** Sorted keys, compact, integer-valued floats written as integers. Identical in PHP. */
export function canonical(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value)) {
    const body = Object.keys(value)
      .sort(compareBytes)
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k] as Json)}`);
    return `{${body.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Document step. Renames two envelope fields; element props stay opaque, whatever their version. */
export function migrateV1ToV2(doc: JsonObject): JsonObject {
  const theme = doc["themeRef"];
  if (!isObject(theme) || typeof theme["tokensVersion"] !== "number") {
    throw new Error("themeRef.tokensVersion is required");
  }
  const nodes = doc["nodes"];
  if (!isObject(nodes)) throw new Error("nodes must be an object");
  const nextNodes: JsonObject = {};
  for (const id of Object.keys(nodes)) {
    const node = nodes[id];
    if (!isObject(node)) throw new Error("node must be an object");
    const next: JsonObject = {};
    for (const key of Object.keys(node)) {
      next[key === "responsive" ? "overrides" : key] = node[key] as Json;
    }
    nextNodes[id] = next;
  }
  return {
    schemaVersion: 2,
    documentId: doc["documentId"] as Json,
    root: doc["root"] as Json,
    nodes: nextNodes,
    themeRef: { theme: theme["theme"] as Json, tokens: { version: theme["tokensVersion"] } },
  };
}

/** Lossless for this hypothetical step only. A general downgrade is not promised; see the README. */
export function migrateV2ToV1(doc: JsonObject): JsonObject {
  const theme = doc["themeRef"] as JsonObject;
  const nodes = doc["nodes"] as JsonObject;
  const nextNodes: JsonObject = {};
  for (const id of Object.keys(nodes)) {
    const node = nodes[id] as JsonObject;
    const next: JsonObject = {};
    for (const key of Object.keys(node)) {
      next[key === "overrides" ? "responsive" : key] = node[key] as Json;
    }
    nextNodes[id] = next;
  }
  return {
    schemaVersion: 1,
    documentId: doc["documentId"] as Json,
    root: doc["root"] as Json,
    nodes: nextNodes,
    themeRef: {
      theme: theme["theme"] as Json,
      tokensVersion: (theme["tokens"] as JsonObject)["version"] as Json,
    },
  };
}

const STEPS: Record<number, (doc: JsonObject) => JsonObject> = { 1: migrateV1ToV2 };

/** Pure. Never mutates input. A failure reports a code and yields no output. */
export function migrate(doc: Json, target: number): MigrationResult {
  if (!isObject(doc) || !Number.isSafeInteger(doc["schemaVersion"])) {
    return { ok: false, code: "invalid_schema_version", output: null };
  }
  let version = doc["schemaVersion"] as number;
  if (version > target) return { ok: false, code: "unsupported_schema_version", output: null };
  let current: JsonObject = doc;
  while (version < target) {
    const step = STEPS[version];
    if (!step) return { ok: false, code: "no_migration_path", output: null };
    try {
      current = step(current);
    } catch {
      return { ok: false, code: "migration_failed", output: null };
    }
    version++;
  }
  return { ok: true, code: null, output: current };
}

/** Element step, a separate axis: bumps one node's `version`, leaves schemaVersion alone. */
export function migrateHeadingV1ToV2(node: JsonObject): JsonObject {
  if (node["type"] !== "blixis/heading" || node["version"] !== 1) return node;
  const props = node["props"] as JsonObject;
  const { level, ...rest } = props;
  return { ...node, version: 2, props: { ...rest, rank: level as Json } };
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface ExportEnvelope {
  format: "blixis-document-export";
  exportVersion: 1;
  raw: string;
  sha256: string;
}

export function exportDocument(bytes: Uint8Array): ExportEnvelope {
  return {
    format: "blixis-document-export",
    exportVersion: 1,
    raw: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
    sha256: sha256(bytes),
  };
}

export function importDocument(envelope: ExportEnvelope): Uint8Array | null {
  const bytes = new TextEncoder().encode(envelope.raw);
  return envelope.format === "blixis-document-export" && sha256(bytes) === envelope.sha256
    ? bytes
    : null;
}
