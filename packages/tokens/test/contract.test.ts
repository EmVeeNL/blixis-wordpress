// Task 03-02: the shipped validators and generator against contract v1.
// The PHP side runs the Blixis Blocks code through tests/03-02/php-cli.php.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { previewProperties, tokenMap, type ValidationError, validateBytes } from "../src/index.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CONTRACT = join(ROOT, "docs/contracts/tokens/v1");
const ENCODER = new TextEncoder();

type PhpRow = {
  ok: boolean;
  errors: ValidationError[];
  canonical?: string;
  hash?: string;
  css?: string;
  cssKey?: string;
  variables?: Record<string, string>;
};
type RawCase = { name: string; base64: string; errors: ValidationError[] };

const read = (relative: string): Uint8Array => readFileSync(join(CONTRACT, relative));
const readJson = <T>(relative: string): T =>
  JSON.parse(readFileSync(join(CONTRACT, relative), "utf8")) as T;
const fixtures = (dir: "valid" | "invalid"): string[] =>
  readdirSync(join(CONTRACT, dir))
    .filter((name) => name.endsWith(".json") && name !== "expected.json")
    .sort();
const base64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

function php(inputs: Uint8Array[]): PhpRow[] {
  const result = spawnSync("php", [join(ROOT, "tests/03-02/php-cli.php")], {
    input: JSON.stringify(inputs.map(base64)),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`php exited ${result.status}: ${result.stderr}`);
  return JSON.parse(result.stdout) as PhpRow[];
}

const expected = readJson<Record<string, { errors: ValidationError[] }>>("invalid/expected.json");
const valid = fixtures("valid");
const invalid = fixtures("invalid");
const raw = readJson<RawCase[]>("raw-cases.json");

void test("shipped token maps equal the contract byte for byte", () => {
  const contract = readFileSync(join(CONTRACT, "token-map.json"), "utf8");
  for (const copy of [
    "packages/tokens/src/token-map.json",
    "plugins/blixis-blocks/inc/tokens/token-map.json",
  ]) {
    assert.equal(readFileSync(join(ROOT, copy), "utf8"), contract, copy);
  }
  assert.equal(tokenMap.contractVersion, 1);
});

void test("every invalid fixture has a manifest entry", () => {
  assert.deepEqual(Object.keys(expected).sort(), invalid);
  assert.ok(invalid.length >= 90, `only ${invalid.length} invalid fixtures`);
});

void test("valid fixtures pass in TypeScript and PHP", () => {
  const rows = php(valid.map((name) => read(`valid/${name}`)));
  valid.forEach((name, index) => {
    assert.deepEqual(validateBytes(read(`valid/${name}`)).errors, [], `ts ${name}`);
    assert.deepEqual(rows[index]?.errors, [], `php ${name}`);
  });
});

void test("invalid fixtures, including CSS injection, report the manifest errors in both", () => {
  const rows = php(invalid.map((name) => read(`invalid/${name}`)));
  invalid.forEach((name, index) => {
    assert.deepEqual(
      validateBytes(read(`invalid/${name}`)).errors,
      expected[name]?.errors,
      `ts ${name}`,
    );
    assert.deepEqual(rows[index]?.errors, expected[name]?.errors, `php ${name}`);
  });
});

void test("raw byte cases agree in both", () => {
  const rows = php(raw.map((item) => Buffer.from(item.base64, "base64")));
  raw.forEach((item, index) => {
    assert.deepEqual(
      validateBytes(Buffer.from(item.base64, "base64")).errors,
      item.errors,
      `ts ${item.name}`,
    );
    assert.deepEqual(rows[index]?.errors, item.errors, `php ${item.name}`);
  });
});

void test("PHP generates the golden stylesheets, hashes, and cache key", () => {
  const names = ["default", "generic-fonts"];
  const rows = php(names.map((name) => read(`valid/${name}.json`)));
  names.forEach((name, index) => {
    assert.equal(
      rows[index]?.css,
      readFileSync(join(CONTRACT, `golden/${name}.tokens.css`), "utf8"),
      name,
    );
  });
  const keys = readJson<{ css: { default: string; hash: string; canonical: string } }>(
    "golden/cache-keys.json",
  );
  assert.equal(rows[0]?.cssKey, keys.css.default);
  assert.equal(rows[0]?.hash, keys.css.hash);
  assert.equal(rows[0]?.canonical, keys.css.canonical);
});

void test("preview properties equal the server's custom properties for every valid fixture", () => {
  const rows = php(valid.map((name) => read(`valid/${name}`)));
  valid.forEach((name, index) => {
    const result = validateBytes(read(`valid/${name}`));
    assert.ok(result.ok, name);
    assert.deepEqual(
      Object.fromEntries(previewProperties(result.config)),
      rows[index]?.variables,
      name,
    );
  });
});

void test("generated declarations cannot leave their rule", () => {
  const rows = php(valid.map((name) => read(`valid/${name}`)));
  for (const row of rows) {
    for (const [name, value] of Object.entries(row.variables ?? {})) {
      assert.match(name, /^--blixis-[a-z0-9-]+$/);
      assert.doesNotMatch(value, /[;{}<>\\]|\/\*|url\(|@import|expression\(/i, `${name}: ${value}`);
    }
  }
});

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

void test("property-based: 6000 mutated configs agree exactly in both validators", () => {
  const random = prng(0x03020302);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  const source = JSON.parse(readFileSync(join(CONTRACT, "valid/default.json"), "utf8")) as Record<
    string,
    unknown
  >;
  const corpus: string[] = [];
  for (let i = 0; i < 4000; i += 1) {
    const copy = structuredClone(source);
    const edits = 1 + Math.floor(random() * 3);
    for (let e = 0; e < edits; e += 1) {
      const section = pick(Object.keys(copy));
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
  const rows = php(corpus.map((item) => ENCODER.encode(item)));
  const differences: string[] = [];
  let accepted = 0;
  corpus.forEach((item, index) => {
    const ts = validateBytes(ENCODER.encode(item));
    if (ts.ok) accepted += 1;
    if (JSON.stringify(rows[index]?.errors) !== JSON.stringify(ts.errors))
      differences.push(item.slice(0, 120));
  });
  assert.deepEqual(differences.slice(0, 5), []);
  assert.ok(accepted > 0 && accepted < corpus.length, `accepted ${accepted}`);
});
