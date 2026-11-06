// Throwaway proof for task 01-05: shared fixtures through the TypeScript validator and migrator.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { LIMITS, isObject } from "./contract.ts";
import type { Json, JsonObject, ValidationResult } from "./contract.ts";
import {
  buildBundle,
  buildRegistry,
  bundlePath,
  contractDir,
  elementSpecs,
  generate,
  registryPath,
  repoRoot,
} from "./fixtures.ts";
import type { GeneratedCase } from "./fixtures.ts";
import {
  canonical,
  exportDocument,
  importDocument,
  migrate,
  migrateHeadingV1ToV2,
  migrateV2ToV1,
  sha256,
} from "./migrate.ts";
import { schemaErrors } from "./schema-lite.ts";
import { deepEqual, isSafeUrl, rawNesting, validate } from "./validator.ts";

const registry = buildRegistry();
const validDir = join(contractDir, "v1", "valid");
const invalidDir = join(contractDir, "v1", "invalid");
const migrationDir = join(contractDir, "migrations");
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

interface InvalidCase {
  file: string;
  status: string;
  codes: string[];
  why: string;
}
interface InvalidManifest {
  cases: InvalidCase[];
  generated: (GeneratedCase & { status: string; codes: string[] })[];
  urlCases: { safe: string[]; unsafe: string[] };
}
interface MigrateCase {
  name: string;
  input: string;
  target: number;
  golden?: string;
  code?: string;
}
interface PreserveCase {
  name: string;
  stored: string;
  incoming: string;
  status: string;
  codes: string[];
  preserved: string[];
}
interface MigrationManifest {
  migrate: MigrateCase[];
  preserve: PreserveCase[];
}

const invalid = readJson<InvalidManifest>(join(invalidDir, "expected.json"));
const validGenerated = readJson<{ cases: GeneratedCase[] }>(join(validDir, "generated.json")).cases;
const migrations = readJson<MigrationManifest>(join(migrationDir, "expected.json"));
const validFiles = readdirSync(validDir)
  .filter((f) => f !== "generated.json")
  .sort();
const invalidFiles = readdirSync(invalidDir)
  .filter((f) => f !== "expected.json")
  .sort();
const migrationFile = (name: string): Buffer => readFileSync(join(migrationDir, name));

void describe("valid fixtures", () => {
  for (const file of validFiles) {
    void it(file, () => {
      const r = validate(readFileSync(join(validDir, file)), registry);
      assert.deepEqual(r.errors, []);
      assert.equal(r.status, "valid");
    });
  }
  for (const c of validGenerated) {
    void it(c.name, () => assert.deepEqual(validate(generate(c), registry).errors, []));
  }
});

void describe("invalid fixtures state and produce their exact codes", () => {
  void it("every invalid fixture has a manifest entry", () => {
    assert.deepEqual(invalid.cases.map((c) => c.file).sort(), invalidFiles);
  });
  for (const c of invalid.cases) {
    void it(`${c.file}: ${c.codes.join(",")}`, () => {
      const r = validate(readFileSync(join(invalidDir, c.file)), registry);
      assert.deepEqual(r.codes, c.codes);
      assert.equal(r.status, c.status);
    });
  }
  for (const c of invalid.generated) {
    void it(`${c.name}: ${c.codes.join(",")}`, () => {
      const r = validate(generate(c), registry);
      assert.deepEqual(r.codes, c.codes);
      assert.equal(r.status, c.status);
    });
  }
});

void describe("hostile input", () => {
  void it("leaves Object.prototype untouched after every fixture", () => {
    for (const file of invalidFiles) validate(readFileSync(join(invalidDir, file)), registry);
    assert.equal(({} as JsonObject)["polluted"], undefined);
  });
  void it("JSON.parse keeps __proto__ as an own key, which a naive merge would then follow", () => {
    const parsed = JSON.parse('{"__proto__":{"polluted":true}}') as JsonObject;
    assert.ok(Object.hasOwn(parsed, "__proto__"));
    const merged = Object.assign({}, parsed);
    assert.equal(merged["polluted"], true, "Object.assign sets the prototype of the target");
  });
  void it("classifies each URL case", () => {
    for (const url of invalid.urlCases.safe) assert.equal(isSafeUrl(url), true, url);
    for (const url of invalid.urlCases.unsafe) assert.equal(isSafeUrl(url), false, url);
  });
  void it("stays fast on regex and scanner worst cases at the size limit", () => {
    const texts = [
      "<a ".repeat(21_000),
      `<a${" ".repeat(65_000)}`,
      "<".repeat(65_000),
      `<!${"x".repeat(65_000)}`,
    ];
    for (const text of texts) {
      const doc = JSON.stringify({
        schemaVersion: 1,
        documentId: "x",
        root: ["s"],
        nodes: {
          s: { id: "s", type: "blixis/section", version: 1, props: {}, children: ["p"] },
          p: { id: "p", type: "blixis/paragraph", version: 1, props: { text }, children: [] },
        },
        themeRef: { theme: "x", tokensVersion: 1 },
      });
      const start = performance.now();
      validate(new TextEncoder().encode(doc), registry);
      assert.ok(performance.now() - start < 500, `${String(performance.now() - start)} ms`);
    }
  });
  void it("validates limit-sized documents in bounded time", () => {
    const big = generate({ name: "x", generated: "flat-nodes", count: LIMITS.maxNodes });
    const start = performance.now();
    assert.equal(validate(big, registry).status, "valid");
    assert.ok(performance.now() - start < 500);
  });
  void it("rawNesting ignores brackets inside strings", () =>
    assert.equal(rawNesting('{"a":"[[[["}'), 1));
  void it("caps the error list but keeps every code", () => {
    const r = validate(generate({ name: "x", generated: "deep-chain", depth: 1900 }), registry);
    assert.equal(r.truncated, true);
    assert.equal(r.errors.length, LIMITS.maxErrors);
    assert.ok(r.codes.includes("depth_exceeded"));
  });
});

void describe("shipped examples and specs", () => {
  const sample = readFileSync(join(repoRoot, "docs", "examples", "content-document.json"));
  void it("the sample document validates", () => {
    assert.equal(validate(sample, registry).status, "valid");
  });
  void it("specs define all 20 types with unique icons", () => {
    const specs = elementSpecs() as unknown as { icon: string }[];
    assert.equal(specs.length, 20);
    assert.equal(new Set(specs.map((s) => s.icon)).size, 20);
  });
  void it("the prop table covers every default prop, and every default validates", () => {
    for (const spec of elementSpecs()) {
      const id = "a";
      const parent = spec.allowedParents.includes("root");
      const nodes: JsonObject = {
        [id]: { id, type: spec.type, version: 1, props: spec.defaultProps, children: [] },
      };
      if (!parent) {
        const parentType = spec.allowedParents[0] as string;
        const carrier = parentType === "blixis/columns" ? "blixis/section" : undefined;
        nodes["p"] = { id: "p", type: parentType, version: 1, props: {}, children: [id] };
        if (carrier)
          nodes["q"] = { id: "q", type: carrier, version: 1, props: {}, children: ["p"] };
        else if (!registry[parentType]?.allowedParents.includes("root")) {
          throw new Error(`Unhandled parent ${parentType}`);
        }
        const rootId = carrier ? "q" : "p";
        const doc = {
          schemaVersion: 1,
          documentId: "x",
          root: [rootId],
          nodes,
          themeRef: { theme: "x", tokensVersion: 1 },
        };
        assert.deepEqual(
          validate(new TextEncoder().encode(JSON.stringify(doc)), registry).errors,
          [],
          spec.type,
        );
      } else {
        const doc = {
          schemaVersion: 1,
          documentId: "x",
          root: [id],
          nodes,
          themeRef: { theme: "x", tokensVersion: 1 },
        };
        assert.deepEqual(
          validate(new TextEncoder().encode(JSON.stringify(doc)), registry).errors,
          [],
          spec.type,
        );
      }
    }
  });
  void it("records every asymmetric nesting declaration, so a spec fix must update this list", () => {
    const asymmetric: string[] = [];
    for (const [type, element] of Object.entries(registry)) {
      for (const child of element.allowedChildren) {
        if (!registry[child]?.allowedParents.includes(type)) asymmetric.push(`${type} > ${child}`);
      }
      for (const parent of element.allowedParents) {
        if (parent !== "root" && !registry[parent]?.allowedChildren.includes(type)) {
          asymmetric.push(`${parent} > ${type}`);
        }
      }
    }
    assert.deepEqual(asymmetric.sort(), [
      "blixis/card > blixis/quote",
      "blixis/card > blixis/video",
      "blixis/container > blixis/section",
      "blixis/section > blixis/container",
    ]);
  });
  void it("under strict nesting no legal chain approaches the depth limit", () => {
    const longest = (type: string, seen: string[] = []): number => {
      const next = registry[type]?.allowedChildren.filter(
        (c) => registry[c]?.allowedParents.includes(type) && !seen.includes(c),
      );
      return 1 + Math.max(0, ...(next ?? []).map((c) => longest(c, [...seen, type])));
    };
    const roots = Object.keys(registry).filter((t) => registry[t]?.allowedParents.includes("root"));
    assert.equal(Math.max(...roots.map((t) => longest(t))), 5);
  });
});

void describe("JSON Schema", () => {
  const schema = readJson<JsonObject>(join(contractDir, "v1", "document.schema.json"));
  for (const file of validFiles) {
    void it(`accepts ${file}`, () => {
      assert.deepEqual(schemaErrors(schema, schema, readJson<Json>(join(validDir, file))), []);
    });
  }
  const structural = [
    "wp-owned-title.json",
    "unknown-top-level.json",
    "unknown-node-field.json",
    "schema-version-string.json",
    "nodes-array.json",
    "root-string.json",
    "props-array.json",
    "children-entry-number.json",
    "numeric-node-id.json",
    "duplicate-root.json",
    "unknown-breakpoint.json",
    "future-schema-version.json",
  ];
  for (const file of structural) {
    void it(`rejects structural ${file}`, () => {
      assert.notDeepEqual(schemaErrors(schema, schema, readJson<Json>(join(invalidDir, file))), []);
    });
  }
  // These prove the schema alone is not enough.
  const semantic = [
    "cycle-detached.json",
    "two-parents.json",
    "orphan.json",
    "missing-reference-child.json",
    "nesting-column-at-root.json",
    "unsafe-url-javascript.json",
    "unknown-prop.json",
    "id-key-mismatch.json",
    "duplicate-node-key.json",
  ];
  for (const file of semantic) {
    void it(`passes semantic ${file}, which only the validator refuses`, () => {
      assert.deepEqual(schemaErrors(schema, schema, readJson<Json>(join(invalidDir, file))), []);
    });
  }
});

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) value.forEach(deepFreeze);
  else if (isObject(value)) Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

void describe("migrations", () => {
  for (const c of migrations.migrate) {
    void it(c.name, () => {
      const input = readFileSync(join(migrationDir, c.input));
      const r = migrate(deepFreeze(JSON.parse(input.toString()) as Json), c.target);
      if (c.golden) {
        assert.equal(r.ok, true);
        assert.equal(
          canonical(r.output),
          canonical(JSON.parse(migrationFile(c.golden).toString()) as Json),
        );
      } else {
        assert.equal(r.code, c.code);
        assert.equal(r.output, null);
      }
    });
  }
  void it("is pure: frozen input, repeatable output", () => {
    const doc = deepFreeze(JSON.parse(migrationFile("v1-basic.input.json").toString()) as Json);
    const before = canonical(doc);
    assert.equal(canonical(migrate(doc, 2).output), canonical(migrate(doc, 2).output));
    assert.equal(canonical(doc), before);
  });
  void it("is idempotent", () => {
    const doc = JSON.parse(migrationFile("v1-basic.input.json").toString()) as Json;
    const once = migrate(doc, 2).output;
    assert.equal(canonical(migrate(once, 2).output), canonical(once));
  });
  void it("keeps unknown node contents exactly, including empty objects", () => {
    const doc = JSON.parse(migrationFile("v1-opaque-nodes.input.json").toString()) as JsonObject;
    const out = migrate(doc, 2).output as JsonObject;
    assert.deepEqual((out["nodes"] as JsonObject)["h"], {
      ...((doc["nodes"] as JsonObject)["h"] as JsonObject),
    });
  });
  void it("a failing step yields no output and leaves the input intact", () => {
    const input = migrationFile("v1-unmigratable.input.json");
    const doc = JSON.parse(input.toString()) as Json;
    const r = migrate(deepFreeze(doc), 2);
    assert.equal(r.ok, false);
    assert.equal(canonical(doc), canonical(JSON.parse(input.toString()) as Json));
  });
  void it("the hypothetical v2 reverses losslessly, which is a property of this step only", () => {
    const doc = JSON.parse(migrationFile("v1-basic.input.json").toString()) as JsonObject;
    assert.equal(canonical(migrateV2ToV1(migrate(doc, 2).output as JsonObject)), canonical(doc));
  });
  void it("element version is a separate axis: a node bump does not touch schemaVersion", () => {
    const doc = JSON.parse(migrationFile("v1-basic.input.json").toString()) as JsonObject;
    const nodes = doc["nodes"] as JsonObject;
    const once = migrateHeadingV1ToV2(nodes["h"] as JsonObject);
    assert.equal(once["version"], 2);
    assert.deepEqual(once["props"], { text: "Hello", rank: 2 });
    assert.deepEqual(migrateHeadingV1ToV2(once), once);
    assert.equal(doc["schemaVersion"], 1);
  });
  void it("a v1 reader treats a v2 document as preserve, a v2 reader does not", () => {
    const bytes = migrationFile("v1-basic.v2.golden.json");
    assert.deepEqual(validate(bytes, registry).codes, ["unsupported_schema_version"]);
    assert.equal(validate(bytes, registry).status, "preserve");
    assert.notEqual(
      validate(bytes, registry, { readerVersion: 2 }).codes[0],
      "unsupported_schema_version",
    );
  });
  void it("export and import are byte-exact and refuse a tampered envelope", () => {
    for (const name of ["future-v3.input.json", "v1-basic.input.json"]) {
      const bytes = migrationFile(name);
      const envelope = exportDocument(bytes);
      assert.deepEqual(Buffer.from(importDocument(envelope) as Uint8Array), bytes);
      assert.equal(sha256(bytes), envelope.sha256);
      assert.equal(importDocument({ ...envelope, raw: `${envelope.raw} ` }), null);
    }
  });
});

void describe("preservation", () => {
  for (const c of migrations.preserve) {
    void it(c.name, () => {
      const r = validate(migrationFile(c.incoming), registry, { stored: migrationFile(c.stored) });
      assert.equal(r.status, c.status);
      assert.deepEqual(r.codes, c.codes);
      assert.deepEqual(r.preserved, c.preserved);
    });
  }
  void it("deepEqual ignores key order and tells {} from []", () => {
    assert.equal(deepEqual({ a: 1, b: {} }, { b: {}, a: 1 }), true);
    assert.equal(deepEqual({ a: {} }, { a: [] }), false);
  });
});

void describe("TypeScript and PHP agree", () => {
  const php = spawnSync("php", ["-v"]);
  const skip = php.status === 0 ? false : "php is not on PATH";
  void it("the committed bundle and registry match the contract directory", () => {
    assert.deepEqual(readJson<Json>(bundlePath), JSON.parse(JSON.stringify(buildBundle())) as Json);
    assert.deepEqual(readJson<Json>(registryPath), JSON.parse(JSON.stringify(registry)) as Json);
  });
  void it("same results, codes, paths, and limits, byte for byte", { skip }, () => {
    const stdout = execFileSync("php", [join(import.meta.dirname, "wp", "parity-cli.php")], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
    const out = JSON.parse(stdout) as {
      results: ParityResults;
      digest: string;
      limits: JsonObject;
      checks: [string, boolean, string][];
    };
    assert.deepEqual(
      out.checks.filter((c) => !c[1]),
      [],
    );
    assert.deepEqual(out.limits, { ...LIMITS });
    const mine = runBundle();
    for (const key of Object.keys(mine.validate)) {
      assert.deepEqual(out.results.validate[key], mine.validate[key], key);
    }
    assert.deepEqual(out.results, mine);
    assert.equal(out.digest, digest(mine));
  });
});

interface FileEntry {
  b64: string;
  name: string;
}

interface ParityResults {
  validate: Record<string, ValidationResult>;
  url: [string, boolean][];
  preserve: Record<string, ValidationResult>;
  migrate: Record<string, { ok: boolean; code: string | null; canonical: string | null }>;
}

function runBundle(): ParityResults {
  const onDisk = readJson<JsonObject>(bundlePath) as unknown as {
    valid: FileEntry[];
    validGenerated: GeneratedCase[];
    invalid: FileEntry[];
    invalidGenerated: GeneratedCase[];
    urlCases: { safe: string[]; unsafe: string[] };
    migrationFiles: FileEntry[];
    migrate: MigrateCase[];
    preserve: PreserveCase[];
  };
  const toMap = (list: FileEntry[]): Record<string, string> =>
    Object.fromEntries(list.map((f) => [f.name, f.b64]));
  const bundle = {
    ...onDisk,
    valid: toMap(onDisk.valid),
    invalid: toMap(onDisk.invalid),
    migrationFiles: toMap(onDisk.migrationFiles),
  };
  const out: ParityResults = { validate: {}, url: [], preserve: {}, migrate: {} };
  const bytes = (b64: string): Buffer => Buffer.from(b64, "base64");
  const file = (name: string): Buffer => bytes(bundle.migrationFiles[name] as string);
  for (const [name, b64] of Object.entries(bundle.valid))
    out.validate[`valid/${name}`] = validate(bytes(b64), registry);
  for (const c of bundle.validGenerated)
    out.validate[`valid/${c.name}`] = validate(generate(c), registry);
  for (const [name, b64] of Object.entries(bundle.invalid))
    out.validate[`invalid/${name}`] = validate(bytes(b64), registry);
  for (const c of bundle.invalidGenerated)
    out.validate[`invalid/${c.name}`] = validate(generate(c), registry);
  for (const url of [...bundle.urlCases.safe, ...bundle.urlCases.unsafe])
    out.url.push([url, isSafeUrl(url)]);
  for (const c of bundle.preserve)
    out.preserve[c.name] = validate(file(c.incoming), registry, { stored: file(c.stored) });
  for (const c of bundle.migrate) {
    const r = migrate(JSON.parse(file(c.input).toString()) as Json, c.target);
    out.migrate[c.name] = {
      ok: r.ok,
      code: r.code,
      canonical: r.output === null ? null : canonical(r.output),
    };
  }
  return out;
}

function digest(results: ParityResults): string {
  const ordered = {
    validate: Object.fromEntries(
      Object.entries(results.validate).map(([k, r]) => [
        k,
        {
          status: r.status,
          codes: r.codes,
          errors: r.errors.map((e) => ({ code: e.code, path: e.path })),
          truncated: r.truncated,
          preserved: r.preserved,
        },
      ]),
    ),
    url: results.url,
    preserve: Object.fromEntries(
      Object.entries(results.preserve).map(([k, r]) => [
        k,
        {
          status: r.status,
          codes: r.codes,
          errors: r.errors.map((e) => ({ code: e.code, path: e.path })),
          truncated: r.truncated,
          preserved: r.preserved,
        },
      ]),
    ),
    migrate: results.migrate,
  };
  return sha256(new TextEncoder().encode(JSON.stringify(ordered)));
}
