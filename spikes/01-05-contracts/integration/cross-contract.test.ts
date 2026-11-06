// Checks the seams between the three 01-05 contracts, which each review tested alone.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BREAKPOINTS } from "../document/contract.ts";
import { buildRegistry, repoRoot } from "../document/fixtures.ts";
import { validate } from "../document/validator.ts";

type Prop = { kind: string; values?: string[] };
type TokenElement = { version: number; props: Record<string, Prop>; responsive: string[] };
type TokenRegistry = {
  breakpoints: string[];
  classes: Record<string, Record<string, string>>;
  elements: Record<string, TokenElement>;
};
type RenderCase = {
  name: string;
  node: { id: string; type: string; version: number; props?: object; responsive?: object };
  diagnostics: unknown[];
};

const contracts = join(repoRoot, "docs", "contracts");
const json = <T>(...path: string[]): T => JSON.parse(readFileSync(join(...path), "utf8")) as T;
const documentRegistry = buildRegistry();
const documentProps = json<{ elements: Record<string, Record<string, Prop>> }>(
  contracts,
  "document/v1/element-props.json",
).elements;
const renderer = json<TokenRegistry>(contracts, "tokens/v1/renderer/registry.json");
const { cases } = json<{ cases: RenderCase[] }>(contracts, "tokens/v1/renderer/cases.json");

const wrapped = (node: object): Uint8Array =>
  Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      documentId: "seam",
      root: ["s"],
      nodes: {
        s: { id: "s", type: "blixis/section", version: 1, props: {}, children: ["n1"] },
        n1: { children: [], ...node, id: "n1" },
      },
      themeRef: { theme: "blixis-base", tokensVersion: 1 },
    }),
  );

void test("document, renderer, and token config use one breakpoint set", () => {
  const config = json<{ breakpoints: object }>(contracts, "tokens/v1/valid/default.json");
  assert.deepEqual(renderer.breakpoints, BREAKPOINTS);
  assert.deepEqual(Object.keys(config.breakpoints).sort(), [...BREAKPOINTS].sort());
});

void test("the renderer knows only versions and props the document contract allows", () => {
  for (const [type, element] of Object.entries(renderer.elements)) {
    const known = documentProps[type];
    assert.ok(known, type);
    assert.equal(element.version, documentRegistry[type]?.version, type);
    for (const name of Object.keys(element.props)) assert.ok(known[name], `${type}.${name}`);
  }
});

void test("neither contract has a rich-text prop in version 1", () => {
  for (const element of Object.values(renderer.elements)) {
    for (const prop of Object.values(element.props)) assert.notEqual(prop.kind, "inlineHtml");
  }
  const kinds = Object.values(documentProps).flatMap((props) =>
    Object.values(props).map((prop) => prop.kind),
  );
  assert.ok(!kinds.includes("inlineHtml"));
  assert.deepEqual(
    validate(
      wrapped({ type: "blixis/paragraph", version: 1, props: { html: "<b>x</b>" } }),
      documentRegistry,
    ).codes,
    ["forbidden_prop"],
  );
});

void test("a node the renderer accepts is a valid document node, or text the validator refuses first", () => {
  // Hostile text is refused on save and still escaped on render, so a document restored
  // from a revision or written directly is safe as well.
  const refusedOnSave = new Set([
    "heading-script-text",
    "heading-close-tag-text",
    "button-label-breakout",
  ]);
  const accepted = cases.filter((item) => item.diagnostics.length === 0);
  assert.ok(accepted.length > 10);
  for (const item of accepted) {
    const { codes } = validate(wrapped(item.node), documentRegistry);
    assert.deepEqual(codes, refusedOnSave.has(item.name) ? ["html_in_text"] : [], item.name);
  }
});

void test("every responsive value the renderer maps is valid in a document override", () => {
  const props: Record<string, object> = {
    "blixis/heading": { text: "x" },
    "blixis/paragraph": { text: "x" },
    "blixis/button": { label: "x", url: "/x" },
    "blixis/image": { alt: "x" },
  };
  for (const [type, element] of Object.entries(renderer.elements)) {
    for (const name of element.responsive) {
      for (const value of Object.keys(renderer.classes[name] ?? {})) {
        const node = {
          type,
          version: 1,
          props: props[type],
          responsive: { md: { [name]: value } },
        };
        assert.deepEqual(
          validate(wrapped(node), documentRegistry).codes,
          [],
          `${type} ${name}=${value}`,
        );
      }
    }
  }
});

void test("shipped examples satisfy the contracts they illustrate", () => {
  const sample = readFileSync(join(repoRoot, "docs/examples/content-document.json"));
  assert.equal(validate(sample, documentRegistry).status, "valid");
  const parsed = JSON.parse(sample.toString()) as { themeRef: { tokensVersion: number } };
  const config = json<{ schemaVersion: number }>(repoRoot, "docs/examples/theme-config.json");
  assert.equal(parsed.themeRef.tokensVersion, config.schemaVersion);
});

void test("the public API contract never carries the raw document or an editor status", () => {
  const dir = join(contracts, "api/examples");
  const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) =>
    f.endsWith(".json"),
  );
  assert.ok(files.length >= 12);
  for (const file of files) {
    const text = readFileSync(join(dir, file), "utf8");
    for (const banned of ["_blixis_document", '"nodes"', "schemaVersion", "VERSION_CONFLICT"]) {
      assert.ok(!text.includes(banned), `${file} contains ${banned}`);
    }
  }
});
