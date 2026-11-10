// Task 03-07 Part A: the layout configuration contract v1. The shipped TypeScript validator and
// the PHP validator in Blixis Blocks run every fixture and must agree on the result.
// The PHP side runs the Blixis Blocks code through test/layout-php-cli.php.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  type LayoutError,
  layoutDefaults,
  layoutMap,
  migrateLayoutConfig,
  tokenMap,
  validateLayoutBytes,
  validateLayoutText,
} from "../src/index.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CONTRACT = join(ROOT, "docs/contracts/layout/v1");
const ENCODER = new TextEncoder();

type PhpRow = { ok: boolean; errors: LayoutError[]; canonical?: string; hash?: string };
type RawCase = { name: string; base64: string; errors: LayoutError[] };
type Json = Record<string, any>; // oxlint-disable-line typescript/no-explicit-any

const read = (relative: string): Uint8Array => readFileSync(join(CONTRACT, relative));
const readJson = <T>(relative: string): T =>
  JSON.parse(readFileSync(join(CONTRACT, relative), "utf8")) as T;
const fixtures = (dir: "valid" | "invalid"): string[] =>
  readdirSync(join(CONTRACT, dir))
    .filter((name) => name.endsWith(".json") && name !== "expected.json")
    .sort();
const base64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

function php(inputs: Uint8Array[]): PhpRow[] {
  const result = spawnSync("php", [join(ROOT, "packages/tokens/test/layout-php-cli.php")], {
    input: JSON.stringify(inputs.map(base64)),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`php exited ${result.status}: ${result.stderr}`);
  return JSON.parse(result.stdout) as PhpRow[];
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, sorted(item)]),
    );
  }
  return value;
}
const canonical = (value: unknown): string => JSON.stringify(sorted(value));
const hash = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 16);

const expected = readJson<Record<string, { errors: LayoutError[] }>>("invalid/expected.json");
const valid = fixtures("valid");
const invalid = fixtures("invalid");
const raw = readJson<RawCase[]>("raw-cases.json");
const golden = readJson<Record<string, { canonical: string; hash: string }>>(
  "golden/canonical-and-hash.json",
);
const defaultConfig = readJson<Json>("valid/default.json");

void test("shipped layout maps equal the contract byte for byte", () => {
  const contract = readFileSync(join(CONTRACT, "layout-map.json"), "utf8");
  for (const copy of [
    "packages/tokens/src/layout-map.json",
    "plugins/blixis-blocks/inc/layout/layout-map.json",
  ]) {
    assert.equal(readFileSync(join(ROOT, copy), "utf8"), contract, copy);
  }
  assert.equal(layoutMap.contractVersion, 1);
  // The theme slug rule is the token contract's.
  assert.equal(layoutMap.grammars.slug, tokenMap.grammars["slug"]);
});

void test("the derived contract files are up to date with scripts/layout-contract.ts", () => {
  const result = spawnSync("node", ["scripts/layout-contract.ts", "--check"], {
    cwd: join(ROOT, "packages/tokens"),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});

void test("every invalid fixture has a manifest entry, and every error code is exercised", () => {
  assert.deepEqual(Object.keys(expected).sort(), invalid);
  assert.ok(invalid.length >= 150, `only ${invalid.length} invalid fixtures`);
  const seen = new Set<string>();
  for (const entry of Object.values(expected)) for (const e of entry.errors) seen.add(e.code);
  for (const item of raw) for (const e of item.errors) seen.add(e.code);
  assert.deepEqual([...seen].sort(), [...layoutMap.errorCodes].sort());
});

void test("valid fixtures pass in TypeScript and PHP, and normalize to the same bytes", () => {
  const rows = php(valid.map((name) => read(`valid/${name}`)));
  valid.forEach((name, index) => {
    const result = validateLayoutBytes(read(`valid/${name}`));
    assert.deepEqual(result.errors, [], `ts ${name}`);
    assert.deepEqual(rows[index]?.errors, [], `php ${name}`);
    assert.ok(result.ok);
    if (!result.ok) return;
    const want = golden[name.replace(".json", "")];
    assert.equal(canonical(result.config), want?.canonical, `ts canonical ${name}`);
    assert.equal(rows[index]?.canonical, want?.canonical, `php canonical ${name}`);
    assert.equal(hash(canonical(result.config)), want?.hash, `ts hash ${name}`);
    assert.equal(rows[index]?.hash, want?.hash, `php hash ${name}`);
  });
  assert.deepEqual(
    Object.keys(golden).sort(),
    valid.map((name) => name.replace(".json", "")).sort(),
  );
});

void test("a normalized config validates again and does not change", () => {
  for (const name of valid) {
    const first = validateLayoutBytes(read(`valid/${name}`));
    assert.ok(first.ok, name);
    if (!first.ok) continue;
    const again = validateLayoutText(JSON.stringify(first.config));
    assert.ok(again.ok, name);
    if (again.ok) assert.equal(canonical(again.config), canonical(first.config), name);
    // Migration is pure: a config at the current version comes back equal.
    assert.deepEqual(migrateLayoutConfig(first.config), first.config);
  }
});

void test("trimmed text is stored trimmed, other spaces stay", () => {
  const result = validateLayoutBytes(read("valid/text-trimmed.json"));
  assert.ok(result.ok);
  if (!result.ok) return;
  const header = result.config["header"] as Json;
  const footer = result.config["footer"] as Json;
  assert.deepEqual(header["usp"].items, ["padded", "lead and trail"]);
  assert.equal(header["cta"].text, "Buy now");
  assert.equal(footer["contact"], "Line one\nLine two");
  assert.equal(footer["copyright"].text, "© {year} {site}");
  const spaces = validateLayoutBytes(read("valid/usp-interior-spaces-and-nbsp.json"));
  assert.ok(spaces.ok);
  if (spaces.ok) {
    assert.deepEqual((spaces.config["header"] as Json)["usp"].items, [
      "Two  spaces",
      "No\u00A0break",
    ]);
  }
});

void test("invalid fixtures report exactly the manifest errors in both", () => {
  const rows = php(invalid.map((name) => read(`invalid/${name}`)));
  invalid.forEach((name, index) => {
    assert.deepEqual(
      validateLayoutBytes(read(`invalid/${name}`)).errors,
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
      validateLayoutBytes(Buffer.from(item.base64, "base64")).errors,
      item.errors,
      `ts ${item.name}`,
    );
    assert.deepEqual(rows[index]?.errors, item.errors, `php ${item.name}`);
  });
  assert.ok(raw.length >= 40);
});

void test("defaults are the contract defaults, valid, and the same in both languages", () => {
  assert.deepEqual(layoutDefaults(), defaultConfig);
  assert.ok(validateLayoutText(JSON.stringify(layoutDefaults("acme-site"))).ok);
  const result = spawnSync(
    "php",
    [join(ROOT, "packages/tokens/test/layout-php-cli.php"), "defaults"],
    { input: JSON.stringify("acme-site"), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, canonical(layoutDefaults("acme-site")));
  // The spec's defaults, written out.
  assert.deepEqual(defaultConfig, {
    schemaVersion: 1,
    theme: { slug: "blixis-starter" },
    layout: "blank",
    header: {
      sticky: false,
      usp: { enabled: false, items: [] },
      logo: "start",
      cta: { enabled: false, text: "", url: "" },
      search: false,
      mobileMenu: "mobile",
    },
    footer: {
      stickToBottom: true,
      columns: 1,
      contact: "",
      social: [],
      copyright: { enabled: true, text: "© {year} {site}" },
      backToTop: false,
    },
  });
  // The defaults are not a shared object: a caller cannot change them for the next one.
  const first = layoutDefaults() as Json;
  first["header"].sticky = true;
  assert.equal((layoutDefaults() as Json)["header"].sticky, false);
});

void test("unsupported versions are refused and migration leaves other versions alone", () => {
  assert.deepEqual(migrateLayoutConfig({ schemaVersion: 2, x: 1 }), { schemaVersion: 2, x: 1 });
  for (const version of [0, 2, 3, "1", 1.5, null, true]) {
    const result = validateLayoutText(JSON.stringify({ ...defaultConfig, schemaVersion: version }));
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 1);
  }
});

// ---- differential tests: every code point, every URL shape, and random mutations

function inputFor(config: unknown): Uint8Array {
  return ENCODER.encode(JSON.stringify(config));
}
function compare(configs: unknown[], label: string): { ok: number; failed: number } {
  const bytes = configs.map(inputFor);
  const rows = php(bytes);
  const differences: string[] = [];
  let okCount = 0;
  bytes.forEach((item, index) => {
    const ts = validateLayoutBytes(item);
    if (ts.ok) okCount += 1;
    const row = rows[index];
    const sameErrors = JSON.stringify(row?.errors) === JSON.stringify(ts.errors);
    const sameBytes = !ts.ok || row?.canonical === canonical(ts.config);
    if (!sameErrors || !sameBytes)
      differences.push(`${label}: ${new TextDecoder().decode(item).slice(0, 200)}`);
  });
  assert.deepEqual(differences.slice(0, 5), []);
  return { ok: okCount, failed: configs.length - okCount };
}
const withUsp = (item: string): Json => ({
  ...defaultConfig,
  header: { ...defaultConfig["header"], usp: { enabled: true, items: [item] } },
});
const withContact = (value: string): Json => ({
  ...defaultConfig,
  footer: { ...defaultConfig["footer"], contact: value },
});
const withCta = (url: string): Json => ({
  ...defaultConfig,
  header: { ...defaultConfig["header"], cta: { enabled: true, text: "Go", url } },
});
const withSocial = (url: string): Json => ({
  ...defaultConfig,
  footer: { ...defaultConfig["footer"], social: [{ service: "other", url }] },
});

void test("every code point in the interesting ranges gets the same verdict in both", () => {
  const points: number[] = [];
  const range = (from: number, to: number): void => {
    for (let cp = from; cp <= to; cp += 1) if (cp < 0xd800 || cp > 0xdfff) points.push(cp);
  };
  range(0x0000, 0x017f);
  range(0x0300, 0x0310);
  range(0x0600, 0x0610);
  range(0x1680, 0x1680);
  range(0x2000, 0x206f);
  range(0x2e80, 0x2e81);
  range(0xe000, 0xe001);
  range(0xfdd0, 0xfdd2);
  range(0xfe00, 0xfe0f);
  range(0xfeff, 0xfeff);
  range(0xfff0, 0xffff);
  range(0x1f600, 0x1f602);
  range(0xe0001, 0xe0001);
  range(0x10ffff, 0x10ffff);
  const configs: Json[] = [];
  for (const cp of points) {
    const char = String.fromCodePoint(cp);
    configs.push(withUsp(`a${char}b`), withContact(`a${char}b`));
  }
  const { ok, failed } = compare(configs, "code point");
  assert.ok(ok > 0 && failed > 0);

  // The rules in plain words: which of these are accepted in a USP text.
  const accepted = new Set<number>();
  points.forEach((cp, index) => {
    if (validateLayoutBytes(inputFor(configs[index * 2])).ok) accepted.add(cp);
  });
  for (const cp of [
    0x00, 0x09, 0x0a, 0x0d, 0x1f, 0x7f, 0x85, 0x9f, 0x2028, 0x2029, 0x202a, 0x202e, 0x2066, 0x2069,
    0xfeff, 0x3c, 0x3e,
  ]) {
    assert.ok(!accepted.has(cp), `U+${cp.toString(16)} must be refused`);
  }
  for (const cp of [
    0x20, 0xa0, 0xad, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0x26, 0x22, 0x27, 0x7b, 0x7d,
    0x1f600,
  ]) {
    assert.ok(accepted.has(cp), `U+${cp.toString(16)} must be accepted`);
  }
  // A line feed is the only control character a multi-line field takes.
  const contactOk = (cp: number): boolean =>
    validateLayoutBytes(inputFor(withContact(`a${String.fromCodePoint(cp)}b`))).ok;
  assert.ok(contactOk(0x0a));
  for (const cp of [0x00, 0x09, 0x0d, 0x2028]) assert.ok(!contactOk(cp), `contact U+${cp}`);
});

const URLS: [string, boolean, boolean][] = [
  // [url, accepted as a CTA url, accepted as a social url]
  ["https://example.com", true, true],
  ["https://example.com/", true, true],
  ["http://example.com/", true, false],
  ["https://a.b.c.d.example.co.uk/path/to/page.html?x=1&y=%20#frag", true, true],
  ["https://example.com:443/", true, true],
  ["https://example.com:65535/", true, true],
  ["https://example.com?q=1", true, true],
  ["https://example.com#top", true, true],
  ["https://127.0.0.1:8080/", true, true],
  ["https://localhost/", true, true],
  ["https://xn--mnchen-3ya.example/", true, true],
  ["https://a-b.example/", true, true],
  ["https://example.com/a/b/", true, true],
  ["https://example.com/@user", true, true],
  ["https://example.com/a(b)*c,d;e=f!$'", true, true],
  ["https://example.com/%E2%9C%93", true, true],
  ["https://example.com/[x]", true, true],
  ["/", true, false],
  ["/contact", true, false],
  ["/a/b?c=d#e", true, false],
  ["/%7Euser", true, false],
  ["/#section", true, false],
  ["/?a=1", true, false],
  ["//", false, false],
  ["//example.com", false, false],
  ["///example.com", false, false],
  ["/\\example.com", false, false],
  ["\\\\example.com", false, false],
  ["/ example", false, false],
  ["", false, false],
  [" ", false, false],
  ["example.com", false, false],
  ["www.example.com/x", false, false],
  ["contact", false, false],
  ["./contact", false, false],
  ["../contact", false, false],
  ["#top", false, false],
  ["?a=1", false, false],
  ["javascript:alert(1)", false, false],
  ["JavaScript:alert(1)", false, false],
  [" javascript:alert(1)", false, false],
  ["java\tscript:alert(1)", false, false],
  ["data:text/html,hi", false, false],
  ["mailto:a@example.com", false, false],
  ["tel:+3100", false, false],
  ["sms:+3100", false, false],
  ["file:///etc/passwd", false, false],
  ["ftp://example.com/", false, false],
  ["ws://example.com/", false, false],
  ["https:example.com", false, false],
  ["https:/example.com", false, false],
  ["https:///example.com", false, false],
  ["https://", false, false],
  ["https://.example.com/", false, false],
  ["https://example..com/", false, false],
  ["https://example.com./", false, false],
  ["https://-example.com/", false, false],
  ["https://example-.com/", false, false],
  [`https://${"a".repeat(64)}.example/`, false, false],
  [`https://${"a".repeat(63)}.example/`, true, true],
  ["https://exa_mple.com/", false, false],
  ["https://exa mple.com/", false, false],
  ["https://exämple.com/", false, false],
  ["https://example.com/ä", false, false],
  ["https://example.com/ ", false, false],
  ["https://example.com/\n", false, false],
  ["https://user@example.com/", false, false],
  ["https://user:pw@example.com/", false, false],
  ["https://example.com@evil.example/", false, false],
  ["https://example.com:80@evil.example/", false, false],
  ["https://example.com:/", false, false],
  ["https://example.com:123456/", false, false],
  ["https://example.com:80a/", false, false],
  ["https://[::1]/", false, false],
  ["https://example.com\\@evil.example/", false, false],
  ["https://example.com/\\", false, false],
  ["https://example.com/a%", false, false],
  ["https://example.com/a%2", false, false],
  ["https://example.com/a%zz", false, false],
  ['https://example.com/a"b', false, false],
  ["https://example.com/a<b", false, false],
  ["https://example.com/a>b", false, false],
  ["https://example.com/a`b", false, false],
  ["https://example.com/a{b", false, false],
  ["https://example.com/a|b", false, false],
  ["https://example.com/a^b", false, false],
  ["HTTPS://example.com/", false, false],
  ["Https://example.com/", false, false],
  ["https://EXAMPLE.com/", true, true],
  ["http://example.com/x", true, false],
  [`/${"a".repeat(2047)}`, true, false],
  [`/${"a".repeat(2048)}`, false, false],
  [`https://example.com/${"a".repeat(2028)}`, true, true],
  [`https://example.com/${"a".repeat(2029)}`, false, false],
];

void test("URLs get the verdicts written down here, in both languages", () => {
  const cta = URLS.map(([url]) => withCta(url));
  const social = URLS.map(([url]) => withSocial(url));
  // An empty CTA url with the CTA on is url.empty, not url.invalid; both count as refused.
  compare([...cta, ...social], "url");
  URLS.forEach(([url, asCta, asSocial]) => {
    assert.equal(
      validateLayoutBytes(inputFor(withCta(url))).ok,
      asCta,
      `cta ${JSON.stringify(url)}`,
    );
    assert.equal(
      validateLayoutBytes(inputFor(withSocial(url))).ok,
      asSocial,
      `social ${JSON.stringify(url)}`,
    );
  });
  // Off, the CTA may be empty; a value that is there still has to be valid.
  const off = (url: string): Json => ({
    ...defaultConfig,
    header: { ...defaultConfig["header"], cta: { enabled: false, text: "", url } },
  });
  assert.ok(validateLayoutBytes(inputFor(off(""))).ok);
  assert.ok(!validateLayoutBytes(inputFor(off("javascript:x"))).ok);
});

void test("text lengths count code points and stop at the limit, in both languages", () => {
  const limits = layoutMap.limits;
  const cases: [Json, boolean][] = [
    [withUsp("x".repeat(limits.uspItemLength)), true],
    [withUsp("x".repeat(limits.uspItemLength + 1)), false],
    [withUsp("é".repeat(limits.uspItemLength)), true],
    [withUsp("\u{1F600}".repeat(limits.uspItemLength)), true],
    [withUsp("\u{1F600}".repeat(limits.uspItemLength + 1)), false],
    [withUsp(`  ${"x".repeat(limits.uspItemLength)}  `), true],
    [withContact("x".repeat(limits.contactLength)), true],
    [withContact("x".repeat(limits.contactLength + 1)), false],
    [withContact(`${"x".repeat(limits.contactLength - 1)}\n`), true],
    [withContact(`${"x".repeat(limits.contactLength - 2)}\ny`), true],
    [withContact(`${"x".repeat(limits.contactLength - 1)}\ny`), false],
  ];
  compare(
    cases.map(([config]) => config),
    "length",
  );
  cases.forEach(([config, ok], index) => {
    assert.equal(validateLayoutBytes(inputFor(config)).ok, ok, `case ${index}`);
  });
});

// ---- random mutations of a full config

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
  "",
  " ",
  "\n",
  "\t",
  "\r",
  "\u0000",
  "\u0085",
  "\u00A0",
  "\u2028",
  "\u202E",
  "\u200D",
  "\uFEFF",
  "<",
  ">",
  "<b>",
  "&amp;",
  "{",
  "}",
  "{year}",
  "{site}",
  "{x}",
  "https://",
  "http://",
  "//",
  "/",
  "\\",
  "%",
  "%41",
  "%zz",
  "@",
  ":",
  ":80",
  "..",
  ".",
  "-",
  "_",
  "#",
  "?",
  "javascript:",
  "é",
  "😀",
  "x".repeat(70),
  "y".repeat(210),
];
const LEAVES = [
  ["theme", "slug"],
  ["layout"],
  ["header", "usp", "items", 0],
  ["header", "usp", "items", 1],
  ["header", "cta", "text"],
  ["header", "cta", "url"],
  ["header", "logo"],
  ["header", "mobileMenu"],
  ["footer", "contact"],
  ["footer", "social", 0, "url"],
  ["footer", "social", 1, "service"],
  ["footer", "social", 2, "url"],
  ["footer", "copyright", "text"],
  ["footer", "columns"],
  ["header", "sticky"],
  ["header", "usp", "enabled"],
  ["header", "cta", "enabled"],
  ["footer", "copyright", "enabled"],
  ["schemaVersion"],
];

void test("random mutations of a full config get the same verdict and bytes in both", () => {
  const random = prng(0x0307);
  const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)] as T;
  const full = readJson<Json>("valid/full.json");
  const corpus: Json[] = [];
  for (let i = 0; i < 4000; i += 1) {
    const config = structuredClone(full);
    for (let edits = 1 + Math.floor(random() * 3); edits > 0; edits -= 1) {
      const path = pick(LEAVES);
      let node: Json = config;
      for (const key of path.slice(0, -1)) node = node[key as string];
      const last = path[path.length - 1] as string | number;
      const roll = random();
      if (roll < 0.6) {
        const current = typeof node[last] === "string" ? (node[last] as string) : "";
        const at = Math.floor(random() * (current.length + 1));
        node[last] =
          current.slice(0, at) + pick(FRAGMENTS) + current.slice(at + (random() < 0.3 ? 1 : 0));
      } else if (roll < 0.7) {
        node[last] = pick(FRAGMENTS);
      } else if (roll < 0.8) {
        node[last] = pick([0, 1, 2, 4, 5, -1, 1.5, 2.0, 1e21]);
      } else if (roll < 0.9) {
        node[last] = pick([true, false, null, [], {}]);
      } else if (typeof node === "object" && !Array.isArray(node)) {
        delete node[last];
      }
    }
    corpus.push(config);
  }
  const { ok, failed } = compare(corpus, "mutation");
  assert.ok(ok > 100 && failed > 100, `accepted ${ok}, refused ${failed}`);
});

// ---- the JSON Schema agrees with the validators

type Schema = Json;
function schemaErrors(schema: Schema, value: unknown, path = ""): string[] {
  const errors: string[] = [];
  const add = (message: string): void => void errors.push(`${path || "/"}: ${message}`);
  const typeOk = (type: string): boolean => {
    if (type === "string") return typeof value === "string";
    if (type === "boolean") return typeof value === "boolean";
    if (type === "integer") return Number.isInteger(value);
    if (type === "array") return Array.isArray(value);
    if (type === "object")
      return typeof value === "object" && value !== null && !Array.isArray(value);
    return false;
  };
  if ("const" in schema && value !== schema["const"]) add("const");
  if ("enum" in schema && !(schema["enum"] as unknown[]).includes(value)) add("enum");
  if ("type" in schema && !typeOk(schema["type"])) {
    add(`type ${schema["type"]}`);
    return errors;
  }
  if (typeof value === "string") {
    const length = Array.from(value).length;
    if ("minLength" in schema && length < schema["minLength"]) add("minLength");
    if ("maxLength" in schema && length > schema["maxLength"]) add("maxLength");
    if ("pattern" in schema && !new RegExp(schema["pattern"]).test(value)) add("pattern");
  }
  if (typeof value === "number") {
    if ("minimum" in schema && value < schema["minimum"]) add("minimum");
    if ("maximum" in schema && value > schema["maximum"]) add("maximum");
  }
  if (Array.isArray(value)) {
    if ("minItems" in schema && value.length < schema["minItems"]) add("minItems");
    if ("maxItems" in schema && value.length > schema["maxItems"]) add("maxItems");
    if ("items" in schema) {
      value.forEach((item, index) =>
        errors.push(...schemaErrors(schema["items"], item, `${path}/${index}`)),
      );
    }
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const object = value as Json;
    for (const key of (schema["required"] ?? []) as string[]) {
      if (!Object.hasOwn(object, key)) add(`required ${key}`);
    }
    const properties = (schema["properties"] ?? {}) as Json;
    for (const [key, item] of Object.entries(object)) {
      if (Object.hasOwn(properties, key))
        errors.push(...schemaErrors(properties[key], item, `${path}/${key}`));
      else if (schema["additionalProperties"] === false) add(`additional ${key}`);
    }
  }
  for (const part of (schema["allOf"] ?? []) as Schema[])
    errors.push(...schemaErrors(part, value, path));
  if ("if" in schema && schemaErrors(schema["if"], value, path).length === 0) {
    errors.push(...schemaErrors(schema["then"], value, path));
  }
  return errors;
}

void test("the JSON Schema accepts every normalized valid config and refuses every invalid fixture", () => {
  const schema = readJson<Schema>("blixis-layout-config.schema.json");
  for (const name of valid) {
    const result = validateLayoutBytes(read(`valid/${name}`));
    assert.ok(result.ok, name);
    if (result.ok) assert.deepEqual(schemaErrors(schema, result.config), [], name);
  }
  for (const name of invalid) {
    const config = JSON.parse(readFileSync(join(CONTRACT, `invalid/${name}`), "utf8")) as unknown;
    assert.notDeepEqual(schemaErrors(schema, config), [], `schema accepts ${name}`);
  }
  // The schema's closed lists are the map's.
  const properties = schema["properties"] as Json;
  assert.deepEqual(properties["layout"].enum, layoutMap.enums.layout);
  assert.deepEqual(properties["header"].properties.logo.enum, layoutMap.enums.logo);
  assert.deepEqual(properties["header"].properties.mobileMenu.enum, layoutMap.enums.mobileMenu);
  assert.deepEqual(
    properties["footer"].properties.social.items.properties.service.enum,
    layoutMap.enums.service,
  );
});

void test("the map's defaults and limits match the contract text", () => {
  assert.deepEqual(layoutMap.limits.uspItems, 3);
  assert.equal(layoutMap.limits.uspItemLength, 60);
  assert.equal(layoutMap.limits.ctaTextLength, 30);
  assert.equal(layoutMap.limits.contactLength, 200);
  assert.equal(layoutMap.limits.copyrightLength, 120);
  assert.equal(layoutMap.limits.socialItems, 6);
  assert.deepEqual([layoutMap.limits.columnsMin, layoutMap.limits.columnsMax], [1, 4]);
  assert.deepEqual(layoutMap.enums.layout, ["blank", "business", "portfolio", "blog", "landing"]);
  assert.deepEqual(layoutMap.placeholders, ["year", "site"]);
});
