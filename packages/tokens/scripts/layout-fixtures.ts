// Writes the hand-specified layout contract v1 fixtures and the golden files derived from the
// PHP code.
//
//   node scripts/layout-fixtures.ts
//
// Expected errors below are specified here by hand, not taken from either validator. The
// canonical JSON and hash goldens come from the shipped PHP code (the only production code
// that stores a config) and must be reviewed: a changed golden is a contract change. Needs php
// on the path. Run from packages/tokens.
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { layoutDefaults } from "../src/layout.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const V1 = join(ROOT, "docs/contracts/layout/v1");
type Json = Record<string, any>; // oxlint-disable-line typescript/no-explicit-any
type Err = { code: string; path: string };

const base = layoutDefaults() as Json;
const clone = (): Json => structuredClone(base);
const line = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const write = (path: string, text: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

// Sets or removes (undefined) the value at an RFC 6901 pointer and returns the config.
function at(path: string, value: unknown, from: Json = clone()): Json {
  const keys = path.split("/").slice(1);
  const last = keys.pop() as string;
  let node: Json = from;
  for (const key of keys) node = node[key];
  if (value === undefined) delete node[last];
  else node[last] = value;
  return from;
}
// Applies several pointer assignments.
function edit(...pairs: [string, unknown][]): Json {
  const config = clone();
  for (const [path, value] of pairs) at(path, value, config);
  return config;
}
const err = (code: string, path: string): Err => ({ code, path });

// ---- valid
const FULL: Json = {
  schemaVersion: 1,
  theme: { slug: "acme-site" },
  layout: "landing",
  header: {
    sticky: true,
    usp: { enabled: true, items: ["Free delivery", "30 day returns", "Support in your language"] },
    logo: "center",
    cta: { enabled: true, text: "Get a quote", url: "https://example.com/quote?ref=header#form" },
    search: true,
    mobileMenu: "always",
  },
  footer: {
    stickToBottom: true,
    columns: 4,
    contact: "Example Street 1\n1000 AA Example\ninfo@example.com",
    social: [
      { service: "facebook", url: "https://www.facebook.com/example" },
      { service: "instagram", url: "https://www.instagram.com/example/" },
      { service: "linkedin", url: "https://www.linkedin.com/company/example" },
      { service: "x", url: "https://x.com/example" },
      { service: "mastodon", url: "https://mastodon.example/@example" },
      { service: "other", url: "https://example.com:8443/feed?format=rss" },
    ],
    copyright: { enabled: true, text: "© {year} {site}. All rights reserved." },
    backToTop: true,
  },
};
const valid: Record<string, Json | string> = {
  default: clone(),
  full: FULL,
  "layout-business": edit(["/layout", "business"]),
  "layout-portfolio": edit(["/layout", "portfolio"]),
  "layout-blog": edit(["/layout", "blog"]),
  "layout-landing": edit(["/layout", "landing"]),
  "theme-slug-longest": edit(["/theme/slug", `a${"b".repeat(62)}`]),
  "header-sticky-search-always": edit(
    ["/header/sticky", true],
    ["/header/search", true],
    ["/header/mobileMenu", "always"],
  ),
  "header-logo-center": edit(["/header/logo", "center"]),
  "usp-one": edit(["/header/usp", { enabled: true, items: ["Free delivery"] }]),
  "usp-three": edit([
    "/header/usp",
    { enabled: true, items: ["Free delivery", "30 day returns", "Support"] },
  ]),
  "usp-disabled-keeps-items": edit(["/header/usp", { enabled: false, items: ["Kept for later"] }]),
  "usp-item-60-characters": edit(["/header/usp", { enabled: true, items: ["x".repeat(60)] }]),
  "usp-item-60-code-points": edit([
    "/header/usp",
    { enabled: true, items: ["\u{1F600}".repeat(60)] },
  ]),
  "usp-arabic-and-joiners": edit([
    "/header/usp",
    { enabled: true, items: ["شحن مجاني", "می\u200Cخواهم", "a\u200Db"] },
  ]),
  "usp-interior-spaces-and-nbsp": edit([
    "/header/usp",
    { enabled: true, items: ["Two  spaces", "No\u00A0break"] },
  ]),
  "text-trimmed": edit(
    ["/header/usp", { enabled: true, items: ["  padded  ", "\nlead and trail\n"] }],
    ["/header/cta", { enabled: true, text: " Buy now ", url: "/shop" }],
    ["/footer/contact", "\n\n Line one\nLine two \n\n"],
    ["/footer/copyright/text", "  © {year} {site}  "],
  ),
  "text-ampersand-quotes-and-braces": edit([
    "/header/usp",
    { enabled: true, items: ["Fish & chips", 'Say "hello"', "It's {fine}"] },
  ]),
  "cta-relative": edit(["/header/cta", { enabled: true, text: "Contact", url: "/contact" }]),
  "cta-relative-root": edit(["/header/cta", { enabled: true, text: "Home", url: "/" }]),
  "cta-relative-query-fragment": edit([
    "/header/cta",
    { enabled: true, text: "Book", url: "/book/?room=2&lang=nl#top" },
  ]),
  "cta-http": edit(["/header/cta", { enabled: true, text: "Visit", url: "http://example.com" }]),
  "cta-https-port-path": edit([
    "/header/cta",
    { enabled: true, text: "Visit", url: "https://shop.example.co.uk:8443/a/b%20c?x=1&y=2#z" },
  ]),
  "cta-punycode-host": edit([
    "/header/cta",
    { enabled: true, text: "Visit", url: "https://xn--exmple-cua.test/" },
  ]),
  "cta-disabled-with-values": edit([
    "/header/cta",
    { enabled: false, text: "Not shown", url: "https://example.com/" },
  ]),
  "cta-text-30-characters": edit([
    "/header/cta",
    { enabled: true, text: "y".repeat(30), url: "/go" },
  ]),
  "footer-columns-2": edit(["/footer/columns", 2]),
  "footer-columns-3": edit(["/footer/columns", 3]),
  "footer-columns-4": edit(["/footer/columns", 4]),
  "footer-not-stuck-back-to-top": edit(
    ["/footer/stickToBottom", false],
    ["/footer/backToTop", true],
  ),
  "contact-200-characters": edit(["/footer/contact", `${"a".repeat(99)}\n${"b".repeat(100)}`]),
  "contact-multiline": edit(["/footer/contact", "Line one\n\nLine three\nأحمد"]),
  "social-six": edit([
    "/footer/social",
    [
      { service: "facebook", url: "https://a.example/" },
      { service: "instagram", url: "https://b.example/" },
      { service: "linkedin", url: "https://c.example/" },
      { service: "youtube", url: "https://d.example/" },
      { service: "tiktok", url: "https://e.example/" },
      { service: "github", url: "https://f.example/" },
    ],
  ]),
  "social-duplicate-service": edit([
    "/footer/social",
    [
      { service: "other", url: "https://a.example/" },
      { service: "other", url: "https://b.example/" },
      { service: "bluesky", url: "https://bsky.app/profile/example.test" },
    ],
  ]),
  "copyright-disabled-empty": edit(["/footer/copyright", { enabled: false, text: "" }]),
  "copyright-disabled-with-text": edit(["/footer/copyright", { enabled: false, text: "© {year}" }]),
  "copyright-placeholders-only": edit(["/footer/copyright/text", "{year}{site}{year}"]),
  "copyright-120-characters": edit(["/footer/copyright/text", "c".repeat(120)]),
  "copyright-plain": edit(["/footer/copyright/text", "Made with care."]),
  // Number spellings: JSON has one number type, so 1.0 and 2e0 are the integers 1 and 2.
  "numbers-integral-floats":
    '{"schemaVersion":1.0,"theme":{"slug":"blixis-starter"},"layout":"blank","header":{"sticky":false,"usp":{"enabled":false,"items":[]},"logo":"start","cta":{"enabled":false,"text":"","url":""},"search":false,"mobileMenu":"mobile"},"footer":{"stickToBottom":true,"columns":2.0e0,"contact":"","social":[],"copyright":{"enabled":true,"text":"© {year} {site}"},"backToTop":false}}\n',
  // Key order does not matter.
  "key-order-reversed": JSON.stringify({
    footer: {
      backToTop: false,
      copyright: { text: "© {year} {site}", enabled: true },
      social: [],
      contact: "",
      columns: 1,
      stickToBottom: true,
    },
    header: {
      mobileMenu: "mobile",
      search: false,
      cta: { url: "", text: "", enabled: false },
      logo: "start",
      usp: { items: [], enabled: false },
      sticky: false,
    },
    layout: "blank",
    theme: { slug: "blixis-starter" },
    schemaVersion: 1,
  }),
};

// ---- invalid
const long = (count: number, char = "x"): string => char.repeat(count);
const cta = (fields: Json): Json => edit(["/header/cta", { ...base["header"].cta, ...fields }]);
const usp = (items: unknown[], enabled = true): Json => edit(["/header/usp", { enabled, items }]);
const uspItem = (value: unknown): Json => usp([value]);
const social = (items: unknown): Json => edit(["/footer/social", items]);
const socialItem = (fields: Json): Json =>
  social([{ service: "other", url: "https://a.example/", ...fields }]);
const copyright = (fields: Json): Json =>
  edit(["/footer/copyright", { ...base["footer"].copyright, ...fields }]);
const withoutKey = (path: string): Json => at(path, undefined);
const ctaUrl = (url: unknown): Json => cta({ enabled: true, text: "Go", url });
const required = (path: string): Err[] => [err("field.required", path)];
const wrongType = (path: string): Err[] => [err("field.wrong_type", path)];
const unknown = (path: string): Err[] => [err("field.unknown", path)];

const invalid: Record<string, [Json, Err[]]> = {
  // schemaVersion
  "version-missing": [withoutKey("/schemaVersion"), required("/schemaVersion")],
  "version-string": [edit(["/schemaVersion", "1"]), wrongType("/schemaVersion")],
  "version-null": [edit(["/schemaVersion", null]), wrongType("/schemaVersion")],
  "version-2": [edit(["/schemaVersion", 2]), [err("schema.version_unsupported", "/schemaVersion")]],
  "version-0": [edit(["/schemaVersion", 0]), [err("schema.version_unsupported", "/schemaVersion")]],
  "version-fractional": [
    edit(["/schemaVersion", 1.5]),
    [err("schema.version_unsupported", "/schemaVersion")],
  ],
  // root
  "root-unknown-key": [edit(["/extra", 1]), unknown("/extra")],
  "root-token-section": [edit(["/colors", {}]), unknown("/colors")],
  // theme
  "theme-missing": [withoutKey("/theme"), required("/theme")],
  "theme-array": [edit(["/theme", []]), wrongType("/theme")],
  "theme-string": [edit(["/theme", "acme"]), wrongType("/theme")],
  "theme-parent-is-a-token-field": [
    edit(["/theme/parent", "blixis-base"]),
    unknown("/theme/parent"),
  ],
  "theme-slug-missing": [withoutKey("/theme/slug"), required("/theme/slug")],
  "theme-slug-number": [edit(["/theme/slug", 1]), wrongType("/theme/slug")],
  "theme-slug-uppercase": [
    edit(["/theme/slug", "Acme"]),
    [err("theme.slug.invalid", "/theme/slug")],
  ],
  "theme-slug-empty": [edit(["/theme/slug", ""]), [err("theme.slug.invalid", "/theme/slug")]],
  "theme-slug-leading-digit": [
    edit(["/theme/slug", "1acme"]),
    [err("theme.slug.invalid", "/theme/slug")],
  ],
  "theme-slug-64-characters": [
    edit(["/theme/slug", `a${"b".repeat(63)}`]),
    [err("theme.slug.invalid", "/theme/slug")],
  ],
  "theme-slug-trailing-newline": [
    edit(["/theme/slug", "acme\n"]),
    [err("theme.slug.invalid", "/theme/slug")],
  ],
  "theme-slug-path": [edit(["/theme/slug", "../acme"]), [err("theme.slug.invalid", "/theme/slug")]],
  // layout
  "layout-missing": [withoutKey("/layout"), required("/layout")],
  "layout-unknown": [edit(["/layout", "shop"]), [err("layout.invalid", "/layout")]],
  "layout-uppercase": [edit(["/layout", "Blank"]), [err("layout.invalid", "/layout")]],
  "layout-empty": [edit(["/layout", ""]), [err("layout.invalid", "/layout")]],
  "layout-old-starter-value": [edit(["/layout", "neutral"]), [err("layout.invalid", "/layout")]],
  "layout-number": [edit(["/layout", 1]), wrongType("/layout")],
  "layout-null": [edit(["/layout", null]), wrongType("/layout")],
  "layout-array": [edit(["/layout", ["blank"]]), wrongType("/layout")],
  // header
  "header-missing": [withoutKey("/header"), required("/header")],
  "header-array": [edit(["/header", []]), wrongType("/header")],
  "header-unknown-key": [edit(["/header/logoSize", "large"]), unknown("/header/logoSize")],
  "header-sticky-missing": [withoutKey("/header/sticky"), required("/header/sticky")],
  "header-sticky-string": [edit(["/header/sticky", "true"]), wrongType("/header/sticky")],
  "header-sticky-number": [edit(["/header/sticky", 1]), wrongType("/header/sticky")],
  "header-search-null": [edit(["/header/search", null]), wrongType("/header/search")],
  "header-logo-missing": [withoutKey("/header/logo"), required("/header/logo")],
  "header-logo-left": [
    edit(["/header/logo", "left"]),
    [err("header.logo.invalid", "/header/logo")],
  ],
  "header-logo-uppercase": [
    edit(["/header/logo", "Start"]),
    [err("header.logo.invalid", "/header/logo")],
  ],
  "header-logo-number": [edit(["/header/logo", 0]), wrongType("/header/logo")],
  "header-mobile-menu-missing": [withoutKey("/header/mobileMenu"), required("/header/mobileMenu")],
  "header-mobile-menu-never": [
    edit(["/header/mobileMenu", "never"]),
    [err("header.mobile_menu.invalid", "/header/mobileMenu")],
  ],
  "header-mobile-menu-snake-case-key": [
    edit(["/header/mobile_menu", "mobile"], ["/header/mobileMenu", undefined]),
    [...required("/header/mobileMenu"), ...unknown("/header/mobile_menu")],
  ],
  // header.usp
  "usp-missing": [withoutKey("/header/usp"), required("/header/usp")],
  "usp-string": [edit(["/header/usp", "Free delivery"]), wrongType("/header/usp")],
  "usp-enabled-missing": [withoutKey("/header/usp/enabled"), required("/header/usp/enabled")],
  "usp-enabled-string": [edit(["/header/usp/enabled", "yes"]), wrongType("/header/usp/enabled")],
  "usp-items-missing": [withoutKey("/header/usp/items"), required("/header/usp/items")],
  "usp-items-object": [edit(["/header/usp/items", {}]), wrongType("/header/usp/items")],
  "usp-items-string": [edit(["/header/usp/items", "a"]), wrongType("/header/usp/items")],
  "usp-unknown-key": [edit(["/header/usp/icon", "check"]), unknown("/header/usp/icon")],
  "usp-enabled-without-items": [usp([]), [err("header.usp.empty", "/header/usp/items")]],
  "usp-four-items": [usp(["a", "b", "c", "d"]), [err("header.usp.too_many", "/header/usp/items")]],
  "usp-four-items-disabled": [
    usp(["a", "b", "c", "d"], false),
    [err("header.usp.too_many", "/header/usp/items")],
  ],
  "usp-four-items-with-a-bad-one": [
    usp(["a", "", "c", "d"]),
    [err("header.usp.too_many", "/header/usp/items"), err("text.empty", "/header/usp/items/1")],
  ],
  "usp-item-number": [uspItem(1), wrongType("/header/usp/items/0")],
  "usp-item-null": [uspItem(null), wrongType("/header/usp/items/0")],
  "usp-item-object": [uspItem({ text: "a" }), wrongType("/header/usp/items/0")],
  "usp-item-empty": [uspItem(""), [err("text.empty", "/header/usp/items/0")]],
  "usp-item-spaces-only": [uspItem("   "), [err("text.empty", "/header/usp/items/0")]],
  "usp-item-newline-only": [uspItem("\n"), [err("text.empty", "/header/usp/items/0")]],
  "usp-item-61-characters": [uspItem(long(61)), [err("text.too_long", "/header/usp/items/0")]],
  "usp-item-61-code-points": [
    uspItem("\u{1F600}".repeat(61)),
    [err("text.too_long", "/header/usp/items/0")],
  ],
  "usp-item-markup": [uspItem("<b>Fast</b>"), [err("text.markup", "/header/usp/items/0")]],
  "usp-item-script": [
    uspItem("<script>alert(1)</script>"),
    [err("text.markup", "/header/usp/items/0")],
  ],
  "usp-item-only-closing-bracket": [uspItem("a > b"), [err("text.markup", "/header/usp/items/0")]],
  "usp-item-inner-newline": [uspItem("a\nb"), [err("text.control_char", "/header/usp/items/0")]],
  "usp-item-tab": [uspItem("a\tb"), [err("text.control_char", "/header/usp/items/0")]],
  "usp-item-carriage-return": [uspItem("a\rb"), [err("text.control_char", "/header/usp/items/0")]],
  "usp-item-nul": [uspItem("a\u0000b"), [err("text.control_char", "/header/usp/items/0")]],
  "usp-item-escape": [uspItem("a\u001Bb"), [err("text.control_char", "/header/usp/items/0")]],
  "usp-item-delete": [uspItem("a\u007Fb"), [err("text.control_char", "/header/usp/items/0")]],
  "usp-item-c1-next-line": [uspItem("a\u0085b"), [err("text.control_char", "/header/usp/items/0")]],
  "usp-item-line-separator": [
    uspItem("a\u2028b"),
    [err("text.control_char", "/header/usp/items/0")],
  ],
  "usp-item-paragraph-separator": [
    uspItem("a\u2029b"),
    [err("text.control_char", "/header/usp/items/0")],
  ],
  "usp-item-bidi-override": [
    uspItem("a\u202Eb"),
    [err("text.control_char", "/header/usp/items/0")],
  ],
  "usp-item-bidi-isolate": [uspItem("a\u2066b"), [err("text.control_char", "/header/usp/items/0")]],
  "usp-item-byte-order-mark": [
    uspItem("a\uFEFFb"),
    [err("text.control_char", "/header/usp/items/0")],
  ],
  "usp-two-bad-items-in-order": [
    usp(["ok", "<i>", "x".repeat(61)]),
    [err("text.markup", "/header/usp/items/1"), err("text.too_long", "/header/usp/items/2")],
  ],
  // header.cta
  "cta-missing": [withoutKey("/header/cta"), required("/header/cta")],
  "cta-array": [edit(["/header/cta", []]), wrongType("/header/cta")],
  "cta-unknown-key": [edit(["/header/cta/target", "_blank"]), unknown("/header/cta/target")],
  "cta-enabled-missing": [withoutKey("/header/cta/enabled"), required("/header/cta/enabled")],
  "cta-enabled-string": [edit(["/header/cta/enabled", "true"]), wrongType("/header/cta/enabled")],
  "cta-text-missing": [withoutKey("/header/cta/text"), required("/header/cta/text")],
  "cta-text-number": [edit(["/header/cta/text", 5]), wrongType("/header/cta/text")],
  "cta-url-missing": [withoutKey("/header/cta/url"), required("/header/cta/url")],
  "cta-url-number": [edit(["/header/cta/url", 5]), wrongType("/header/cta/url")],
  "cta-enabled-empty-text": [
    cta({ enabled: true, text: "", url: "/x" }),
    [err("text.empty", "/header/cta/text")],
  ],
  "cta-enabled-spaces-text": [
    cta({ enabled: true, text: "   ", url: "/x" }),
    [err("text.empty", "/header/cta/text")],
  ],
  "cta-enabled-empty-url": [
    cta({ enabled: true, text: "Go", url: "" }),
    [err("url.empty", "/header/cta/url")],
  ],
  "cta-enabled-everything-empty": [
    cta({ enabled: true, text: "", url: "" }),
    [err("text.empty", "/header/cta/text"), err("url.empty", "/header/cta/url")],
  ],
  "cta-text-31-characters": [
    cta({ enabled: true, text: long(31), url: "/x" }),
    [err("text.too_long", "/header/cta/text")],
  ],
  "cta-text-markup": [
    cta({ enabled: true, text: "<b>Go</b>", url: "/x" }),
    [err("text.markup", "/header/cta/text")],
  ],
  "cta-text-newline": [
    cta({ enabled: true, text: "Go\nnow", url: "/x" }),
    [err("text.control_char", "/header/cta/text")],
  ],
  "cta-disabled-text-too-long": [
    cta({ enabled: false, text: long(31), url: "" }),
    [err("text.too_long", "/header/cta/text")],
  ],
  "cta-disabled-url-invalid": [
    cta({ enabled: false, text: "", url: "javascript:alert(1)" }),
    [err("url.invalid", "/header/cta/url")],
  ],
  "cta-url-javascript": [ctaUrl("javascript:alert(1)"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-javascript-uppercase": [
    ctaUrl("JAVASCRIPT:alert(1)"),
    [err("url.invalid", "/header/cta/url")],
  ],
  "cta-url-javascript-entity": [
    ctaUrl("java&#115;cript:alert(1)"),
    [err("url.invalid", "/header/cta/url")],
  ],
  "cta-url-data": [
    ctaUrl("data:text/html;base64,PHNjcmlwdD4="),
    [err("url.invalid", "/header/cta/url")],
  ],
  "cta-url-vbscript": [ctaUrl("vbscript:x"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-mailto": [ctaUrl("mailto:a@example.com"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-tel": [ctaUrl("tel:+31000000"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-ftp": [ctaUrl("ftp://example.com/"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-protocol-relative": [ctaUrl("//evil.test/x"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-slash-backslash": [ctaUrl("/\\evil.test"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-no-scheme": [ctaUrl("example.com/x"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-relative-no-slash": [ctaUrl("contact"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-fragment-only": [ctaUrl("#contact"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-query-only": [ctaUrl("?a=1"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-scheme-only": [ctaUrl("https://"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-userinfo": [ctaUrl("https://user@evil.test/"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-userinfo-lookalike": [
    ctaUrl("https://good.test@evil.test/"),
    [err("url.invalid", "/header/cta/url")],
  ],
  "cta-url-backslash-host": [
    ctaUrl("https://evil.test\\@good.test/"),
    [err("url.invalid", "/header/cta/url")],
  ],
  "cta-url-uppercase-scheme": [
    ctaUrl("HTTPS://example.com/"),
    [err("url.invalid", "/header/cta/url")],
  ],
  "cta-url-ipv6-literal": [ctaUrl("http://[::1]/"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-unicode-host": [
    ctaUrl("https://exämple.test/"),
    [err("url.invalid", "/header/cta/url")],
  ],
  "cta-url-unicode-path": [ctaUrl("/café"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-underscore-host": [ctaUrl("https://a_b.test/"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-empty-label": [ctaUrl("https://a..test/"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-trailing-dot": [ctaUrl("https://a.test./"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-hyphen-edge": [ctaUrl("https://-a.test/"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-port-six-digits": [
    ctaUrl("https://a.test:123456/"),
    [err("url.invalid", "/header/cta/url")],
  ],
  "cta-url-empty-port": [ctaUrl("https://a.test:/"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-space": [ctaUrl("/a b"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-leading-space": [ctaUrl(" /a"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-trailing-newline": [ctaUrl("/a\n"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-tab": [ctaUrl("/a\tb"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-nul": [ctaUrl("/a\u0000b"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-double-quote": [ctaUrl('/a"b'), [err("url.invalid", "/header/cta/url")]],
  "cta-url-angle-bracket": [ctaUrl("/a<b"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-backtick": [ctaUrl("/a`b"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-braces": [ctaUrl("/a{b}"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-bad-percent": [ctaUrl("/a%zz"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-truncated-percent": [ctaUrl("/a%2"), [err("url.invalid", "/header/cta/url")]],
  "cta-url-2049-characters": [ctaUrl(`/${long(2048)}`), [err("url.invalid", "/header/cta/url")]],
  // footer
  "footer-missing": [withoutKey("/footer"), required("/footer")],
  "footer-array": [edit(["/footer", []]), wrongType("/footer")],
  "footer-unknown-key": [edit(["/footer/fixed", true]), unknown("/footer/fixed")],
  "footer-stick-missing": [withoutKey("/footer/stickToBottom"), required("/footer/stickToBottom")],
  "footer-stick-string": [
    edit(["/footer/stickToBottom", "true"]),
    wrongType("/footer/stickToBottom"),
  ],
  "footer-back-to-top-missing": [withoutKey("/footer/backToTop"), required("/footer/backToTop")],
  "footer-back-to-top-number": [edit(["/footer/backToTop", 0]), wrongType("/footer/backToTop")],
  "footer-columns-missing": [withoutKey("/footer/columns"), required("/footer/columns")],
  "footer-columns-string": [edit(["/footer/columns", "2"]), wrongType("/footer/columns")],
  "footer-columns-null": [edit(["/footer/columns", null]), wrongType("/footer/columns")],
  "footer-columns-bool": [edit(["/footer/columns", true]), wrongType("/footer/columns")],
  "footer-columns-zero": [
    edit(["/footer/columns", 0]),
    [err("footer.columns.invalid", "/footer/columns")],
  ],
  "footer-columns-five": [
    edit(["/footer/columns", 5]),
    [err("footer.columns.invalid", "/footer/columns")],
  ],
  "footer-columns-negative": [
    edit(["/footer/columns", -1]),
    [err("footer.columns.invalid", "/footer/columns")],
  ],
  "footer-columns-fractional": [
    edit(["/footer/columns", 2.5]),
    [err("footer.columns.invalid", "/footer/columns")],
  ],
  "footer-columns-just-above-four": [
    edit(["/footer/columns", 4.000001]),
    [err("footer.columns.invalid", "/footer/columns")],
  ],
  "footer-contact-missing": [withoutKey("/footer/contact"), required("/footer/contact")],
  "footer-contact-number": [edit(["/footer/contact", 1]), wrongType("/footer/contact")],
  "footer-contact-201-characters": [
    edit(["/footer/contact", long(201)]),
    [err("text.too_long", "/footer/contact")],
  ],
  "footer-contact-newlines-count": [
    edit(["/footer/contact", `${long(100)}\n${long(100)}\nx`]),
    [err("text.too_long", "/footer/contact")],
  ],
  "footer-contact-markup": [
    edit(["/footer/contact", "Mail <a href='x'>us</a>"]),
    [err("text.markup", "/footer/contact")],
  ],
  "footer-contact-tab": [
    edit(["/footer/contact", "a\tb"]),
    [err("text.control_char", "/footer/contact")],
  ],
  "footer-contact-carriage-return": [
    edit(["/footer/contact", "a\r\nb"]),
    [err("text.control_char", "/footer/contact")],
  ],
  "footer-contact-nul": [
    edit(["/footer/contact", "a\u0000b"]),
    [err("text.control_char", "/footer/contact")],
  ],
  "footer-contact-line-separator": [
    edit(["/footer/contact", "a\u2028b"]),
    [err("text.control_char", "/footer/contact")],
  ],
  // footer.social
  "social-missing": [withoutKey("/footer/social"), required("/footer/social")],
  "social-object": [social({}), wrongType("/footer/social")],
  "social-string": [social("https://a.example/"), wrongType("/footer/social")],
  "social-item-string": [social(["https://a.example/"]), wrongType("/footer/social/0")],
  "social-item-array": [social([[]]), wrongType("/footer/social/0")],
  "social-item-unknown-key": [socialItem({ label: "Us" }), unknown("/footer/social/0/label")],
  "social-item-service-missing": [
    social([{ url: "https://a.example/" }]),
    required("/footer/social/0/service"),
  ],
  "social-item-url-missing": [social([{ service: "x" }]), required("/footer/social/0/url")],
  "social-service-number": [socialItem({ service: 1 }), wrongType("/footer/social/0/service")],
  "social-service-unknown": [
    socialItem({ service: "myspace" }),
    [err("footer.social.service_invalid", "/footer/social/0/service")],
  ],
  "social-service-uppercase": [
    socialItem({ service: "Facebook" }),
    [err("footer.social.service_invalid", "/footer/social/0/service")],
  ],
  "social-service-empty": [
    socialItem({ service: "" }),
    [err("footer.social.service_invalid", "/footer/social/0/service")],
  ],
  "social-url-number": [socialItem({ url: 1 }), wrongType("/footer/social/0/url")],
  "social-url-empty": [socialItem({ url: "" }), [err("url.empty", "/footer/social/0/url")]],
  "social-url-http": [
    socialItem({ url: "http://a.example/" }),
    [err("url.invalid", "/footer/social/0/url")],
  ],
  "social-url-relative": [
    socialItem({ url: "/profile" }),
    [err("url.invalid", "/footer/social/0/url")],
  ],
  "social-url-protocol-relative": [
    socialItem({ url: "//a.example/" }),
    [err("url.invalid", "/footer/social/0/url")],
  ],
  "social-url-javascript": [
    socialItem({ url: "javascript:alert(1)" }),
    [err("url.invalid", "/footer/social/0/url")],
  ],
  "social-url-userinfo": [
    socialItem({ url: "https://a@b.example/" }),
    [err("url.invalid", "/footer/social/0/url")],
  ],
  "social-url-space": [
    socialItem({ url: "https://a.example/a b" }),
    [err("url.invalid", "/footer/social/0/url")],
  ],
  "social-url-2049-characters": [
    socialItem({ url: `https://a.example/${long(2031)}` }),
    [err("url.invalid", "/footer/social/0/url")],
  ],
  "social-seven": [
    social(Array.from({ length: 7 }, () => ({ service: "other", url: "https://a.example/" }))),
    [err("footer.social.too_many", "/footer/social")],
  ],
  // Paths sort as bytes: /10 before /2.
  "social-eleven-with-two-bad-ones": [
    social(
      Array.from({ length: 11 }, (_, index) => ({
        service: "other",
        url: index === 2 || index === 10 ? "http://a.example/" : "https://a.example/",
      })),
    ),
    [
      err("footer.social.too_many", "/footer/social"),
      err("url.invalid", "/footer/social/10/url"),
      err("url.invalid", "/footer/social/2/url"),
    ],
  ],
  // footer.copyright
  "copyright-missing": [withoutKey("/footer/copyright"), required("/footer/copyright")],
  "copyright-string": [edit(["/footer/copyright", "© 2026"]), wrongType("/footer/copyright")],
  "copyright-unknown-key": [
    edit(["/footer/copyright/holder", "x"]),
    unknown("/footer/copyright/holder"),
  ],
  "copyright-enabled-missing": [
    withoutKey("/footer/copyright/enabled"),
    required("/footer/copyright/enabled"),
  ],
  "copyright-enabled-number": [
    edit(["/footer/copyright/enabled", 1]),
    wrongType("/footer/copyright/enabled"),
  ],
  "copyright-text-missing": [
    withoutKey("/footer/copyright/text"),
    required("/footer/copyright/text"),
  ],
  "copyright-text-number": [
    edit(["/footer/copyright/text", 2026]),
    wrongType("/footer/copyright/text"),
  ],
  "copyright-enabled-empty-text": [
    copyright({ enabled: true, text: "" }),
    [err("text.empty", "/footer/copyright/text")],
  ],
  "copyright-text-121-characters": [
    copyright({ text: long(121) }),
    [err("text.too_long", "/footer/copyright/text")],
  ],
  "copyright-unknown-placeholder": [
    copyright({ text: "© {name}" }),
    [err("text.placeholder_unknown", "/footer/copyright/text")],
  ],
  "copyright-placeholder-uppercase": [
    copyright({ text: "© {YEAR}" }),
    [err("text.placeholder_unknown", "/footer/copyright/text")],
  ],
  "copyright-placeholder-nested": [
    copyright({ text: "© {{year}}" }),
    [err("text.placeholder_unknown", "/footer/copyright/text")],
  ],
  "copyright-placeholder-built-by-removal": [
    copyright({ text: "{ye{year}ar}" }),
    [err("text.placeholder_unknown", "/footer/copyright/text")],
  ],
  "copyright-placeholder-unclosed": [
    copyright({ text: "© {year" }),
    [err("text.placeholder_unknown", "/footer/copyright/text")],
  ],
  "copyright-lone-closing-brace": [
    copyright({ text: "© year}" }),
    [err("text.placeholder_unknown", "/footer/copyright/text")],
  ],
  "copyright-placeholder-with-space": [
    copyright({ text: "© { year }" }),
    [err("text.placeholder_unknown", "/footer/copyright/text")],
  ],
  "copyright-markup": [
    copyright({ text: "© <b>{site}</b>" }),
    [err("text.markup", "/footer/copyright/text")],
  ],
  "copyright-newline": [
    copyright({ text: "© {year}\n{site}" }),
    [err("text.control_char", "/footer/copyright/text")],
  ],
  "copyright-disabled-bad-placeholder": [
    copyright({ enabled: false, text: "{name}" }),
    [err("text.placeholder_unknown", "/footer/copyright/text")],
  ],
  // Several sections at once: errors are sorted by path, then code.
  "many-errors": [
    edit(
      ["/layout", "shop"],
      ["/header/logo", "left"],
      ["/footer/columns", 9],
      ["/footer/contact", "<p>"],
      ["/header/cta", { enabled: true, text: "", url: "javascript:x" }],
      ["/extra", true],
    ),
    [
      err("field.unknown", "/extra"),
      err("footer.columns.invalid", "/footer/columns"),
      err("text.markup", "/footer/contact"),
      err("text.empty", "/header/cta/text"),
      err("url.invalid", "/header/cta/url"),
      err("header.logo.invalid", "/header/logo"),
      err("layout.invalid", "/layout"),
    ],
  ],
};

// ---- raw bytes
const baseText = JSON.stringify(base);
const withBytes = (from: string, to: string): string => {
  if (!baseText.includes(from)) throw new Error(`base lacks ${from}`);
  return baseText.replace(from, to);
};
const [head = "", tail = ""] = baseText.split('"items":[]');
const b64 = (data: string | Buffer): string => Buffer.from(data).toString("base64");
const raw: { name: string; base64: string; errors: Err[] }[] = [
  { name: "empty", base64: b64(""), errors: [err("config.invalid_json", "")] },
  {
    name: "truncated",
    base64: b64(baseText.slice(0, 40)),
    errors: [err("config.invalid_json", "")],
  },
  {
    name: "utf8-bom",
    base64: b64(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(baseText)])),
    errors: [err("config.invalid_json", "")],
  },
  {
    name: "invalid-utf8",
    base64: b64(
      Buffer.concat([
        Buffer.from('{"schemaVersion":1,"x":"'),
        Buffer.from([0xc3, 0x28]),
        Buffer.from('"}'),
      ]),
    ),
    errors: [err("config.invalid_json", "")],
  },
  {
    name: "invalid-utf8-in-usp-text",
    base64: b64(
      Buffer.concat([
        Buffer.from(`${head}"items":["a`),
        Buffer.from([0xff]),
        Buffer.from(`"]${tail}`),
      ]),
    ),
    errors: [err("config.invalid_json", "")],
  },
  {
    name: "lone-high-surrogate",
    base64: b64('{"a":"\\ud800"}'),
    errors: [err("config.invalid_json", "")],
  },
  {
    name: "lone-low-surrogate",
    base64: b64('{"a":"\\udc00"}'),
    errors: [err("config.invalid_json", "")],
  },
  {
    name: "lone-surrogate-in-usp-text",
    base64: b64(withBytes('"items":[]', '"items":["a\\ud800"]')),
    errors: [err("config.invalid_json", "")],
  },
  {
    name: "lone-surrogate-in-key",
    base64: b64('{"\\ud800":1}'),
    errors: [err("config.invalid_json", "")],
  },
  {
    name: "nul-leading-key",
    base64: b64('{"\\u0000a":1}'),
    errors: [err("config.invalid_json", "")],
  },
  { name: "trailing-comma", base64: b64('{"a":1,}'), errors: [err("config.invalid_json", "")] },
  { name: "single-quotes", base64: b64("{'a':1}"), errors: [err("config.invalid_json", "")] },
  { name: "js-comment", base64: b64('{"a":1}//x'), errors: [err("config.invalid_json", "")] },
  { name: "nan-literal", base64: b64('{"a":NaN}'), errors: [err("config.invalid_json", "")] },
  {
    name: "raw-newline-in-string",
    base64: b64('{"a":"b\nc"}'),
    errors: [err("config.invalid_json", "")],
  },
  {
    name: "uppercase-true",
    base64: b64(withBytes('"sticky":false', '"sticky":TRUE')),
    errors: [err("config.invalid_json", "")],
  },
  { name: "not-an-object-array", base64: b64("[]"), errors: [err("config.not_object", "")] },
  { name: "not-an-object-string", base64: b64('"a"'), errors: [err("config.not_object", "")] },
  { name: "not-an-object-null", base64: b64("null"), errors: [err("config.not_object", "")] },
  {
    name: "too-large",
    base64: b64(`{"a":"${"x".repeat(32768)}"}`),
    errors: [err("config.too_large", "")],
  },
  {
    name: "largest-allowed-size-is-checked-after-depth-and-parse",
    base64: b64(`{"a":"${"x".repeat(32768 - 8)}"}`),
    errors: [err("field.required", "/schemaVersion")],
  },
  { name: "too-deep", base64: b64("[[[[[[[[[]]]]]]]]]"), errors: [err("config.too_deep", "")] },
  {
    name: "very-deep-within-size",
    base64: b64("[".repeat(30000)),
    errors: [err("config.too_deep", "")],
  },
  {
    name: "brackets-in-strings-are-not-depth",
    base64: b64(`{"a":"${"[".repeat(30)}"}`),
    errors: [err("field.required", "/schemaVersion")],
  },
  {
    name: "duplicate-key-last-wins-valid",
    base64: b64(baseText.replace('"layout":"blank"', '"layout":"nope","layout":"blog"')),
    errors: [],
  },
  {
    name: "duplicate-key-last-wins-invalid",
    base64: b64(baseText.replace('"layout":"blank"', '"layout":"blog","layout":"nope"')),
    errors: [err("layout.invalid", "/layout")],
  },
  {
    name: "escaped-angle-brackets-are-markup",
    base64: b64(withBytes('"items":[]', '"items":["\\u003cb\\u003e"]')),
    errors: [err("text.markup", "/header/usp/items/0")],
  },
  {
    name: "escaped-nul-is-a-control-character",
    base64: b64(withBytes('"items":[]', '"items":["a\\u0000b"]')),
    errors: [err("text.control_char", "/header/usp/items/0")],
  },
  {
    name: "escaped-newline-in-usp-is-a-control-character",
    base64: b64(withBytes('"items":[]', '"items":["a\\nb"]')),
    errors: [err("text.control_char", "/header/usp/items/0")],
  },
  {
    name: "escaped-newline-in-contact-is-allowed",
    base64: b64(withBytes('"contact":""', '"contact":"a\\nb"')),
    errors: [],
  },
  {
    name: "escaped-unicode-text-is-valid",
    base64: b64(
      withBytes('"items":[]', '"items":["caf\\u00e9 \\ud83d\\ude00"]').replace(
        '"enabled":false,"items"',
        '"enabled":true,"items"',
      ),
    ),
    errors: [],
  },
  {
    name: "escaped-slash-in-url-is-valid",
    base64: b64(
      withBytes(
        '"enabled":false,"text":"","url":""',
        '"enabled":true,"text":"Go","url":"https:\\/\\/a.example\\/x"',
      ),
    ),
    errors: [],
  },
  {
    name: "columns-huge-exponent",
    base64: b64(withBytes('"columns":1', '"columns":1e400')),
    errors: [err("footer.columns.invalid", "/footer/columns")],
  },
  {
    name: "columns-exponent-integer",
    base64: b64(withBytes('"columns":1', '"columns":2e0')),
    errors: [],
  },
  {
    name: "columns-negative-zero",
    base64: b64(withBytes('"columns":1', '"columns":-0')),
    errors: [err("footer.columns.invalid", "/footer/columns")],
  },
  {
    name: "columns-leading-zero",
    base64: b64(withBytes('"columns":1', '"columns":01')),
    errors: [err("config.invalid_json", "")],
  },
  {
    name: "version-exponent",
    base64: b64(withBytes('"schemaVersion":1', '"schemaVersion":1e0')),
    errors: [],
  },
  {
    name: "version-float-one",
    base64: b64(withBytes('"schemaVersion":1', '"schemaVersion":1.0')),
    errors: [],
  },
  {
    name: "version-huge",
    base64: b64(withBytes('"schemaVersion":1', '"schemaVersion":1e400')),
    errors: [err("schema.version_unsupported", "/schemaVersion")],
  },
  {
    name: "unknown-key-with-slash-and-tilde",
    base64: b64(baseText.replace('"layout":"blank"', '"layout":"blank","a/b~c":1')),
    errors: [err("field.unknown", "/a~1b~0c")],
  },
  {
    name: "proto-key-is-an-ordinary-unknown-key",
    base64: b64(baseText.replace('"layout":"blank"', '"layout":"blank","__proto__":{}')),
    errors: [err("field.unknown", "/__proto__")],
  },
  {
    name: "unknown-keys-sort-as-bytes",
    base64: b64(
      baseText.replace(
        '"layout":"blank"',
        '"layout":"blank","é":1,"z":1,"ÿ":1,"\\ud83d\\ude00":1,"\\uffff":1',
      ),
    ),
    errors: [
      err("field.unknown", "/z"),
      err("field.unknown", "/é"),
      err("field.unknown", "/ÿ"),
      err("field.unknown", "/￿"),
      err("field.unknown", "/\u{1F600}"),
    ],
  },
];

// ---- write
for (const dir of ["valid", "invalid"]) rmSync(join(V1, dir), { recursive: true, force: true });
for (const [name, value] of Object.entries(valid)) {
  write(join(V1, `valid/${name}.json`), typeof value === "string" ? value : line(value));
}
const manifest: Record<string, { errors: Err[] }> = {};
for (const [name, [config, errors]] of Object.entries(invalid)) {
  write(join(V1, `invalid/${name}.json`), line(config));
  manifest[`${name}.json`] = { errors };
}
write(join(V1, "invalid/expected.json"), line(manifest));
write(join(V1, "raw-cases.json"), line(raw));

// ---- goldens, from the PHP code
const names = Object.keys(valid).sort();
const result = spawnSync("php", [join(ROOT, "packages/tokens/test/layout-php-cli.php")], {
  input: JSON.stringify(names.map((name) => b64(Buffer.from(readValid(name))))),
  encoding: "utf8",
});
function readValid(name: string): string {
  const value = valid[name] as Json | string;
  return typeof value === "string" ? value : line(value);
}
if (result.status !== 0) throw new Error(`php exited ${result.status}: ${result.stderr}`);
const rows = JSON.parse(result.stdout) as { ok: boolean; canonical?: string; hash?: string }[];
const golden: Record<string, { canonical: string; hash: string }> = {};
names.forEach((name, index) => {
  const row = rows[index];
  if (!row?.ok) throw new Error(`valid fixture ${name} failed in PHP`);
  golden[name] = { canonical: row.canonical as string, hash: row.hash as string };
});
write(join(V1, "golden/canonical-and-hash.json"), line(golden));
console.log(`${names.length} valid, ${Object.keys(invalid).length} invalid, ${raw.length} raw`);
