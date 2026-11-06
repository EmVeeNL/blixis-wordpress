// The real Tailwind 4.3.5 compiler and a real Chromium decide the build/runtime boundary.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { FRONTEND, readFixtureBytes } from "../src/contract.ts";
import { generateCss } from "../src/generate.ts";
import { allRendererClasses, compileTailwind, tailwindThemeCss } from "../src/tailwind.ts";
import { type Config, validateBytes } from "../src/validate.ts";

const directory = mkdtempSync(join(tmpdir(), "blixis-tw-"));
after(() => rmSync(directory, { recursive: true, force: true }));

function defaultConfig(): Config {
  const result = validateBytes(readFixtureBytes("valid", "default.json"));
  if (!result.ok) throw new Error("default fixture");
  return result.config;
}
const tokensCss = generateCss(defaultConfig());
const safelist = `<div class="${allRendererClasses().join(" ")}"></div>`;
const compiled = compileTailwind(directory, tailwindThemeCss(), safelist);

function hasRule(css: string, className: string): boolean {
  const escaped = className.replace(/[:/[\]&>*().]/g, "\\$&");
  return css.includes(`.${escaped} {`) || css.includes(`.${escaped}{`);
}

void test("every class the renderer can emit has a compiled rule, at every breakpoint", () => {
  const missing = allRendererClasses().filter((name) => !hasRule(compiled, name));
  assert.deepEqual(missing, []);
});

void test("compiled CSS holds no token values, so a value change needs no rebuild", () => {
  assert.ok(!compiled.includes("#155dfc"));
  assert.match(compiled, /\.text-primary \{\s*color: var\(--blixis-color-primary\);/);
  assert.match(compiled, /\.mb-md \{\s*margin-bottom: var\(--blixis-spacing-md\);/);
  assert.equal(compileTailwind(directory, tailwindThemeCss(), safelist), compiled);
});

void test("a new token name or breakpoint produces nothing without a rebuild", () => {
  const html =
    '<i class="text-brand bg-newtoken 2xl:text-left tablet:text-left text-red-500 p-4"></i>';
  const css = compileTailwind(directory, tailwindThemeCss(), html);
  for (const name of [
    "text-brand",
    "bg-newtoken",
    "2xl:text-left",
    "tablet:text-left",
    "text-red-500",
    "p-4",
  ]) {
    assert.ok(!hasRule(css, name), name);
  }
  const rebuilt = compileTailwind(
    directory,
    tailwindThemeCss()
      .replace("@theme inline {", "@theme inline {\n  --color-brand: var(--blixis-color-brand);")
      .replace("--breakpoint-sm: 40rem;", "--breakpoint-tablet: 45rem;\n  --breakpoint-sm: 40rem;"),
    '<i class="text-brand tablet:text-left"></i>',
  );
  assert.ok(hasRule(rebuilt, "text-brand"), "rebuild adds the utility");
  assert.ok(hasRule(rebuilt, "tablet:text-left"), "rebuild adds the variant");
});

void test("changing a breakpoint value changes compiled output, so it is a build input", () => {
  const moved = compileTailwind(
    directory,
    tailwindThemeCss().replace("--breakpoint-md: 48rem", "--breakpoint-md: 50rem"),
    safelist,
  );
  assert.notEqual(moved, compiled);
  assert.match(moved, /@media \(width >= 50rem\)/);
  assert.ok(!moved.includes("48rem"));
});

void test("Tailwind silently accepts a var() breakpoint and writes an invalid media query", () => {
  const css = compileTailwind(
    directory,
    tailwindThemeCss().replace(
      "--breakpoint-sm: 40rem;",
      "--breakpoint-sm: 40rem;\n  --breakpoint-runtime: var(--blixis-breakpoint-runtime);",
    ),
    '<i class="runtime:flex min-[var(--x)]:flex"></i>',
  );
  assert.match(css, /@media \(width >= var\(--blixis-breakpoint-runtime\)\)/);
  assert.ok(!hasRule(css, "min-[var(--x)]:flex"), "arbitrary var() variant is dropped");
});

void test("scanning user content would compile attacker-chosen CSS, so it must never be a @source", () => {
  const hostile = "bg-[url(javascript:alert(1))]";
  assert.ok(!compiled.includes("javascript:"));
  const css = compileTailwind(
    directory,
    tailwindThemeCss(),
    `<i class="${hostile} [&>*]:hidden"></i>`,
  );
  assert.ok(css.includes("url(javascript:alert(1))"), "arbitrary value reaches compiled CSS");
  assert.ok(css.includes("hidden > *"), "arbitrary variant reaches compiled CSS");
});

void test("spacing tokens capture max-w-md and w-md in Tailwind's width namespace", () => {
  const css = compileTailwind(directory, tailwindThemeCss(), '<i class="max-w-md w-lg"></i>');
  assert.match(css, /\.max-w-md \{\s*max-width: var\(--blixis-spacing-md\);/);
  assert.match(css, /\.w-lg \{\s*width: var\(--blixis-spacing-lg\);/);
});

// Browser proofs. Playwright and Chromium come from the 01-02 package.
type Page = {
  setContent(html: string): Promise<void>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  evaluate<T>(code: string): Promise<T>;
  emulateMedia(options: { reducedMotion: string }): Promise<void>;
};
type Browser = { newPage(): Promise<Page>; close(): Promise<void>; version(): string };
type Playwright = { chromium: { launch(options?: { channel?: string }): Promise<Browser> } };

let browser: Browser | undefined;
let page: Page;
let launchError = "";
before(async () => {
  try {
    const require = createRequire(join(FRONTEND, "package.json"));
    const { chromium } = require("@playwright/test") as Playwright;
    // Playwright's own Chromium if present, otherwise the installed Chrome.
    browser = await chromium.launch().catch(async () => chromium.launch({ channel: "chrome" }));
    page = await browser.newPage();
    console.log(`chromium ${browser.version()}`);
  } catch (error) {
    launchError = String(error);
  }
});
after(async () => browser?.close());

const skipReason = (): string | false =>
  browser === undefined ? `no browser: ${launchError}` : false;
const css = (selector: string, prop: string): string =>
  `getComputedStyle(document.querySelector(${JSON.stringify(selector)})).${prop}`;

void test("runtime value change alters colours and spacing with no rebuild", async (t) => {
  const reason = skipReason();
  if (reason !== false) return t.skip(reason);
  await page.setContent(
    `<style>${tokensCss}</style><style>${compiled}</style><p id="a" class="text-primary mb-md">x</p>`,
  );
  assert.equal(await page.evaluate(css("#a", "color")), "rgb(21, 93, 252)");
  assert.equal(await page.evaluate(css("#a", "marginBottom")), "16px");
  await page.evaluate(`document.documentElement.style.setProperty("--blixis-color-primary", "#ff0000");
    document.documentElement.style.setProperty("--blixis-spacing-md", "3rem")`);
  assert.equal(await page.evaluate(css("#a", "color")), "rgb(255, 0, 0)");
  assert.equal(await page.evaluate(css("#a", "marginBottom")), "48px");
});

void test("var() in a media query never matches at any width; a literal one does", async (t) => {
  const reason = skipReason();
  if (reason !== false) return t.skip(reason);
  const html = `<style>:root{--bp:10px} @media (min-width: var(--bp)){#a{color:rgb(1,2,3)}}
    @media (width >= var(--bp)){#b{color:rgb(1,2,3)}}
    @media (min-width: 10px){#c{color:rgb(1,2,3)}}</style><p id="a">x</p><p id="b">x</p><p id="c">x</p>`;
  for (const width of [200, 1600]) {
    await page.setViewportSize({ width, height: 600 });
    await page.setContent(html);
    assert.notEqual(
      await page.evaluate(css("#a", "color")),
      "rgb(1, 2, 3)",
      `min-width at ${width}`,
    );
    assert.notEqual(await page.evaluate(css("#b", "color")), "rgb(1, 2, 3)", `range at ${width}`);
    assert.equal(await page.evaluate(css("#c", "color")), "rgb(1, 2, 3)", `control at ${width}`);
  }
  assert.equal(await page.evaluate(`matchMedia("(min-width: var(--bp))").matches`), false);
});

void test("mobile-first classes resolve as the responsive fixtures say", async (t) => {
  const reason = skipReason();
  if (reason !== false) return t.skip(reason);
  const html = `<style>${tokensCss}</style><style>${compiled}</style><h2 id="a" class="text-left sm:text-center xl:text-right">x</h2>`;
  const want: [number, string][] = [
    [320, "left"],
    [640, "center"],
    [800, "center"],
    [1024, "center"],
    [1280, "right"],
  ];
  for (const [width, align] of want) {
    await page.setViewportSize({ width, height: 600 });
    await page.setContent(html);
    assert.equal(await page.evaluate(css("#a", "textAlign")), align, `at ${width}`);
  }
});

void test("preview needs an iframe: media queries follow the viewport, not a wrapper width", async (t) => {
  const reason = skipReason();
  if (reason !== false) return t.skip(reason);
  await page.setViewportSize({ width: 1400, height: 800 });
  const inner = `<style>${compiled}</style><p id="a" class="text-left md:text-center">x</p>`;
  await page.setContent(
    `<div style="width:320px">${inner}</div><iframe id="f" style="width:320px;height:200px" srcdoc="${inner.replaceAll('"', "&quot;")}"></iframe>`,
  );
  await page.evaluate(
    `new Promise((done) => { const f = document.getElementById("f"); if (f.contentDocument && f.contentDocument.readyState === "complete" && f.contentDocument.getElementById("a")) done(); else f.addEventListener("load", done); })`,
  );
  assert.equal(
    await page.evaluate(css("#a", "textAlign")),
    "center",
    "a 320px wrapper still gets the desktop rule",
  );
  assert.equal(
    await page.evaluate(
      `getComputedStyle(document.getElementById("f").contentDocument.getElementById("a")).textAlign`,
    ),
    "left",
    "a 320px iframe gets the mobile rule",
  );
});

void test("plain @theme breaks scoped overrides; @theme inline keeps them", async (t) => {
  const reason = skipReason();
  if (reason !== false) return t.skip(reason);
  const plain = compileTailwind(
    directory,
    tailwindThemeCss().replace("@theme inline {", "@theme {"),
    '<i class="text-primary"></i>',
  );
  const inline = compileTailwind(directory, tailwindThemeCss(), '<i class="text-primary"></i>');
  const body = `<style>:root{--blixis-color-primary:#155dfc}</style><div style="--blixis-color-primary:#ff0000"><p id="a" class="text-primary">x</p></div>`;
  await page.setContent(`<style>${plain}</style>${body}`);
  assert.equal(
    await page.evaluate(css("#a", "color")),
    "rgb(21, 93, 252)",
    "plain @theme resolves at :root",
  );
  await page.setContent(`<style>${inline}</style>${body}`);
  assert.equal(
    await page.evaluate(css("#a", "color")),
    "rgb(255, 0, 0)",
    "inline resolves at the element",
  );
});

void test("layered utilities lose to unlayered WordPress styles; unlayered utilities win", async (t) => {
  const reason = skipReason();
  if (reason !== false) return t.skip(reason);
  const wpCore = ":root :where(h2){font-size:99px;color:rgb(9,9,9)}";
  const body = `<style>${tokensCss}</style><h2 id="a" class="text-primary text-lg">x</h2>`;
  // The golden mapping imports utilities without a layer, so this checks the golden itself.
  await page.setContent(`<style>${wpCore}</style><style>${compiled}</style>${body}`);
  assert.equal(
    await page.evaluate(css("#a", "fontSize")),
    "18px",
    "golden utilities beat global styles",
  );
  assert.equal(await page.evaluate(css("#a", "color")), "rgb(21, 93, 252)");
  // The negative control wraps the same rule in a layer, as Tailwind's default import does.
  await page.setContent(
    `<style>${wpCore}</style><style>@layer utilities{.text-lg{font-size:18px}}</style>${body}`,
  );
  assert.equal(
    await page.evaluate(css("#a", "fontSize")),
    "99px",
    "a layered utility loses to an unlayered one",
  );
});

void test("golden mapping excludes preflight, so it cannot reset WordPress element styles", () => {
  assert.ok(
    !compiled.includes("box-sizing: border-box"),
    "preflight must not be in the golden build",
  );
  assert.ok(!compiled.includes("@layer utilities"), "utilities must stay unlayered");
});

void test("reduced motion zeroes the generated durations in a browser", async (t) => {
  const reason = skipReason();
  if (reason !== false) return t.skip(reason);
  await page.setContent(`<style>${tokensCss}</style><p id="a">x</p>`);
  const read = `getComputedStyle(document.documentElement).getPropertyValue("--blixis-motion-duration-base").trim()`;
  await page.emulateMedia({ reducedMotion: "no-preference" });
  assert.equal(await page.evaluate(read), "200ms");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.evaluate(read), "0ms");
  await page.emulateMedia({ reducedMotion: "no-preference" });
});

void test("negative control: an unvalidated value really breaks out of the declaration", async (t) => {
  const reason = skipReason();
  if (reason !== false) return t.skip(reason);
  const hostile = "red;}body{display:none}";
  await page.setContent(`<style>:root{--blixis-color-primary:${hostile};}</style><p id="a">x</p>`);
  assert.equal(await page.evaluate(`getComputedStyle(document.body).display`), "none");
  assert.equal(validateBytes(readFixtureBytes("invalid", "color-css-breakout.json")).ok, false);
});
