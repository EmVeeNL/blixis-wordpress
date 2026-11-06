// Real React against the golden HTML that wp/test.php checks byte for byte with real WordPress.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { REPO_ROOT, readContractJson } from "../src/contract.ts";
import { parseHtml } from "../src/html.ts";
import { runPhp } from "../src/php.ts";
import { type Media, renderPreview } from "../src/preview.ts";
import {
  type Diagnostic,
  type Node,
  registry,
  resolveNode,
  resolveResponsive,
  responsiveClasses,
} from "../src/resolve.ts";
import { allRendererClasses } from "../src/tailwind.ts";

type Case = {
  name: string;
  node: Node;
  html: string;
  diagnostics: Diagnostic[];
  serverOnly?: boolean;
};
const { media, cases } = readContractJson<{ media: Media; cases: Case[] }>("renderer/cases.json");
type Responsive = {
  name: string;
  prop: string;
  base: string | null;
  overrides: Record<string, string>;
  resolved: Record<string, string | null>;
  classes: string;
};
const responsive = readContractJson<Responsive[]>("renderer/responsive.json");

void test("responsive fixtures resolve the same in TypeScript and PHP", () => {
  const php = runPhp<{ resolved: unknown; classes: string }[]>("resolve-responsive", responsive);
  responsive.forEach((item, index) => {
    const resolved = resolveResponsive(item.base, item.overrides);
    assert.deepEqual(resolved, item.resolved, item.name);
    assert.equal(responsiveClasses(item.prop, resolved).join(" "), item.classes, item.name);
    assert.deepEqual(php[index]?.resolved, item.resolved, `php ${item.name}`);
    assert.equal(php[index]?.classes, item.classes, `php ${item.name}`);
  });
});

for (const item of cases.filter((entry) => entry.serverOnly !== true)) {
  void test(`preview parity: ${item.name}`, () => {
    const preview = renderPreview(item.node, media);
    assert.deepEqual(preview.diagnostics, item.diagnostics, "diagnostics");
    assert.deepEqual(parseHtml(preview.html), parseHtml(item.html), "same DOM as the PHP golden");
  });
}

void test("parity is a DOM comparison: PHP and React bytes really differ", () => {
  const quote = cases.find((entry) => entry.name === "paragraph-quotes") as Case;
  assert.notEqual(renderPreview(quote.node, media).html, quote.html);
  const image = cases.find((entry) => entry.name === "image-basic") as Case;
  assert.notEqual(renderPreview(image.node, media).html, image.html);
});

void test("every class in every golden comes from the allowlist", () => {
  const allowed = new Set(allRendererClasses());
  for (const spec of Object.values(registry.elements)) allowed.add(spec.baseClass);
  for (const item of cases) {
    for (const match of item.html.matchAll(/class="([^"]*)"/g)) {
      for (const name of (match[1] ?? "").split(" ")) {
        assert.ok(allowed.has(name), `${item.name}: ${name}`);
      }
    }
  }
});

void test("no golden contains an executable construct", () => {
  for (const item of cases) {
    const parsed = JSON.stringify(parseHtml(item.html));
    assert.ok(!/"on[a-z]+",/.test(parsed), `${item.name} event attribute`);
    assert.ok(
      !/"(?:href|src)","\s*(?:javascript|data|vbscript):/i.test(parsed),
      `${item.name} url`,
    );
    const tags = [...item.html.matchAll(/<([a-z0-9]+)/g)].map((m) => m[1]);
    for (const tag of tags) {
      assert.ok(
        [
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "p",
          "a",
          "span",
          "img",
          "strong",
          "em",
          "br",
          "code",
        ].includes(tag ?? ""),
        `${item.name} <${tag}>`,
      );
    }
  }
});

void test("a user-chosen class can never reach the output", () => {
  const { resolved } = resolveNode({
    type: "blixis/heading",
    version: 1,
    props: { text: "x", align: "bg-[url(//evil.test)]", className: "evil" },
    responsive: { md: { align: "evil-too" } },
  });
  assert.equal(resolved?.classes, "blixis-heading");
});

void test("every element has a current registry entry matching its planned manifest", () => {
  for (const [type, spec] of Object.entries(registry.elements)) {
    const file = join(REPO_ROOT, "docs/elements", `${type.replace("blixis/", "")}.json`);
    const manifest = JSON.parse(readFileSync(file, "utf8")) as {
      type: string;
      version: number;
      supports: { responsive: string[] };
    };
    assert.equal(manifest.type, type);
    assert.equal(manifest.version, spec.version);
    for (const prop of spec.responsive) {
      assert.ok(manifest.supports.responsive.includes(prop), `${type}.${prop} not in manifest`);
    }
  }
});
