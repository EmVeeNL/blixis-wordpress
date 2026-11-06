// The same fixtures through both validators, with identical code and path.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  CONTRACT,
  listFixtures,
  readContractJson,
  readFixtureBytes,
  tokenMap,
} from "../src/contract.ts";
import { runPhp } from "../src/php.ts";
import { type ValidationError, validateBytes } from "../src/validate.ts";

type PhpRow = { ok: boolean; errors: ValidationError[] };
type RawCase = { name: string; base64: string; errors: ValidationError[] };
const expected =
  readContractJson<Record<string, { errors: ValidationError[] }>>("invalid/expected.json");
const invalid = listFixtures("invalid");
const valid = listFixtures("valid");
const raw = readContractJson<RawCase[]>("raw-cases.json");

void test("every invalid fixture has a manifest entry and the reverse", () => {
  assert.deepEqual(Object.keys(expected).sort(), invalid);
  assert.ok(invalid.length >= 90, `only ${invalid.length} invalid fixtures`);
});

void test("every fixture file parses as JSON, as CI requires", () => {
  for (const name of invalid)
    JSON.parse(Buffer.from(readFixtureBytes("invalid", name)).toString("utf8"));
  for (const name of valid)
    JSON.parse(Buffer.from(readFixtureBytes("valid", name)).toString("utf8"));
});

void test("TypeScript: valid fixtures pass", () => {
  for (const name of valid) {
    const result = validateBytes(readFixtureBytes("valid", name));
    assert.deepEqual(result.errors, [], name);
  }
});

void test("TypeScript: invalid fixtures report the manifest errors", () => {
  for (const name of invalid) {
    const result = validateBytes(readFixtureBytes("invalid", name));
    assert.deepEqual(result.errors, expected[name]?.errors, name);
  }
});

void test("PHP: same fixtures give the same results", () => {
  const b64 = (dir: "valid" | "invalid", name: string): string =>
    Buffer.from(readFixtureBytes(dir, name)).toString("base64");
  const validRows = runPhp<PhpRow[]>(
    "validate",
    valid.map((name) => b64("valid", name)),
  );
  valid.forEach((name, index) => assert.deepEqual(validRows[index]?.errors, [], name));
  const invalidRows = runPhp<PhpRow[]>(
    "validate",
    invalid.map((name) => b64("invalid", name)),
  );
  invalid.forEach((name, index) => {
    assert.deepEqual(invalidRows[index]?.errors, expected[name]?.errors, name);
  });
});

void test("raw byte cases agree in both languages", () => {
  const rows = runPhp<PhpRow[]>(
    "validate",
    raw.map((item) => item.base64),
  );
  raw.forEach((item, index) => {
    const bytes = Buffer.from(item.base64, "base64");
    assert.deepEqual(validateBytes(bytes).errors, item.errors, `ts ${item.name}`);
    assert.deepEqual(rows[index]?.errors, item.errors, `php ${item.name}`);
  });
});

void test("the shipped docs/examples/theme-config.json is valid in both validators", () => {
  const bytes = readFileSync(join(CONTRACT, "../../../examples/theme-config.json"));
  assert.deepEqual(validateBytes(bytes).errors, []);
  assert.deepEqual(runPhp<PhpRow[]>("validate", [bytes.toString("base64")])[0]?.errors, []);
});

// A tiny evaluator for the keywords the schema uses. Repository has no JSON Schema
// library and this task may not add one; see the review note.
type Schema = {
  type?: string;
  const?: unknown;
  pattern?: string;
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, Schema>;
};
function schemaAccepts(schema: Schema, value: unknown): boolean {
  if ("const" in schema && value !== schema.const) return false;
  if (schema.type === "string" && typeof value !== "string") return false;
  if (
    schema.pattern !== undefined &&
    (typeof value !== "string" || !new RegExp(schema.pattern).test(value))
  )
    return false;
  if (schema.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!Object.hasOwn(object, key)) return false;
    for (const key of Object.keys(object)) {
      const child = Object.hasOwn(schema.properties ?? {}, key)
        ? schema.properties?.[key]
        : undefined;
      if (child === undefined) {
        if (schema.additionalProperties === false) return false;
      } else if (!schemaAccepts(child, object[key])) return false;
    }
  }
  return true;
}

void test("JSON Schema agrees with the validators on every fixture", () => {
  const schema = readContractJson<Schema>("blixis-theme-config.schema.json");
  for (const name of valid) {
    const body = JSON.parse(
      Buffer.from(readFixtureBytes("valid", name)).toString("utf8"),
    ) as unknown;
    assert.ok(schemaAccepts(schema, body), `schema refused valid ${name}`);
  }
  for (const name of invalid) {
    const body = JSON.parse(
      Buffer.from(readFixtureBytes("invalid", name)).toString("utf8"),
    ) as unknown;
    assert.ok(!schemaAccepts(schema, body), `schema accepted invalid ${name}`);
  }
});

void test("schema patterns are the token-map grammars", () => {
  const text = readFileSync(join(CONTRACT, "blixis-theme-config.schema.json"), "utf8");
  for (const grammar of ["slug", "color", "font", "length", "shadow", "duration", "easing"]) {
    assert.ok(text.includes(JSON.stringify(tokenMap.grammars[grammar])), grammar);
  }
});

// Seeded differential fuzz: mutated configs and raw JSON through both validators.
function prng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const FRAGMENTS = [
  "red",
  "#fff",
  "#FFFFFF",
  "1rem",
  "0",
  "0.5rem",
  "1e3px",
  "var(--x)",
  "url(x)",
  "</style>",
  ";",
  "}",
  "{",
  '"',
  "'",
  "\\",
  "\n",
  "\r",
  "\t",
  "\u0000",
  "\u0001",
  "\u007f",
  "\u0085",
  " ",
  " ",
  "﻿",
  "😀",
  "＃",
  "١",
  "/*",
  "*/",
  "@import",
  "expression(",
  "!important",
  "Local Sans",
  "A-B",
  " ",
  "  ",
  "none",
  "inset ",
  "0 0 0 0 #000",
  "ease",
  "cubic-bezier(0, 0, 1, 1)",
  "120ms",
  "-1ms",
  "48rem",
  "96rem",
];
const STRUCTURE: unknown[] = [null, true, false, 0, 1, 1.5, -1, [], {}, [1], { a: 1 }, "", "1"];

void test("differential fuzz: 6000 mutated configs agree exactly", () => {
  const random = prng(0x01050105);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  const source = JSON.parse(
    Buffer.from(readFixtureBytes("valid", "default.json")).toString("utf8"),
  ) as Record<string, unknown>;
  const corpus: string[] = [];
  for (let i = 0; i < 4000; i += 1) {
    const copy = structuredClone(source);
    const edits = 1 + Math.floor(random() * 3);
    for (let e = 0; e < edits; e += 1) {
      const sections = Object.keys(copy);
      const section = pick(sections);
      const holder = copy[section];
      const choice = random();
      if (typeof holder === "object" && holder !== null && !Array.isArray(holder)) {
        const keys = Object.keys(holder);
        const key = choice < 0.1 ? pick(FRAGMENTS) : pick(keys);
        const target = holder as Record<string, unknown>;
        if (choice < 0.15) Reflect.deleteProperty(target, pick(keys));
        else if (choice < 0.3) target[key] = pick(STRUCTURE);
        else target[key] = `${pick(FRAGMENTS)}${random() < 0.5 ? pick(FRAGMENTS) : ""}`;
      } else {
        copy[section] = pick(STRUCTURE);
      }
    }
    corpus.push(JSON.stringify(copy));
  }
  // Raw text edits, to reach parser differences.
  const text = JSON.stringify(source);
  const RAW = [
    "TRUE",
    "True",
    "NULL",
    "nUlL",
    "tRuE",
    "\\ud800",
    "\\udc00",
    "\\u0000",
    "\\uD83D\\uDE00",
    "1.0",
    "1e0",
    "1E0",
    "-0",
    "01",
    "+1",
    ".5",
    "1.",
    ",",
    ":",
    "{",
    "}",
    "[",
    "]",
    '"',
    "\\",
    " ",
    " ",
    "﻿",
    "\t",
    "\u000b",
    "\u000c",
  ];
  for (let i = 0; i < 2000; i += 1) {
    const at = Math.floor(random() * text.length);
    const remove = random() < 0.5 ? Math.floor(random() * 4) : 0;
    corpus.push(text.slice(0, at) + pick(RAW) + text.slice(at + remove));
  }
  const b64 = corpus.map((item) => Buffer.from(item, "utf8").toString("base64"));
  const rows = runPhp<PhpRow[]>("validate", b64);
  let okCount = 0;
  const differences: string[] = [];
  corpus.forEach((item, index) => {
    const ts = validateBytes(Buffer.from(item, "utf8"));
    if (ts.ok) okCount += 1;
    try {
      assert.deepEqual(rows[index]?.errors, ts.errors);
    } catch {
      differences.push(
        JSON.stringify({ item: item.slice(0, 200), ts: ts.errors, php: rows[index]?.errors }),
      );
    }
  });
  assert.equal(differences.length, 0, differences.slice(0, 5).join("\n"));
  assert.ok(okCount > 0 && okCount < corpus.length, `degenerate corpus: ${okCount} valid`);
  console.log(`fuzz corpus ${corpus.length}, accepted ${okCount}, differences 0`);
});
