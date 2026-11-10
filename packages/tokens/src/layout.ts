// BlixisLayoutConfig v1 validator for the browser (task 03-07 Part A). Must return the same
// {code, path} errors as plugins/blixis-blocks/inc/layout/validate.php for every input;
// test/layout.test.ts compares them. The server result stays authoritative.
import { exceedsDepth } from "./validate.ts";
import { type LayoutMap, layoutMap } from "./layout-map.ts";

export type LayoutError = { code: string; path: string };
export type LayoutConfig = Record<string, unknown>;
export type LayoutResult =
  | { ok: true; config: LayoutConfig; errors: [] }
  | { ok: false; errors: LayoutError[] };

type JsonObject = Record<string, unknown>;
type TextRules = { multiline?: boolean; min: number; max: number; placeholders?: boolean };

const LONE_SURROGATE = /\p{Cs}/u;
// Created on use: a top-level `new TextEncoder()` would stay in the setup bundle.
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
// Control characters, bidirectional overrides and isolates, U+2028, U+2029 and U+FEFF.
const CONTROL = /[\p{Cc}\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/u;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pointer(parent: string, key: string): string {
  return `${parent}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

// PHP's json_decode refuses lone surrogates anywhere and object keys starting with NUL.
// JSON.parse accepts both, so the rule is enforced here to keep parity.
function isRepresentable(root: unknown): boolean {
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value === "string") {
      if (LONE_SURROGATE.test(value)) return false;
    } else if (Array.isArray(value)) {
      stack.push(...(value as unknown[]));
    } else if (isObject(value)) {
      for (const [key, item] of Object.entries(value)) {
        if (key.startsWith("\0") || LONE_SURROGATE.test(key)) return false;
        stack.push(item);
      }
    }
  }
  return true;
}

function byteCompare(a: string, b: string): number {
  const left = encode(a);
  const right = encode(b);
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return left.length - right.length;
}

function fail(code: string): LayoutResult {
  return { ok: false, errors: [{ code, path: "" }] };
}

// Trim removes spaces and line feeds at both ends, and nothing else (not the Unicode
// whitespace String.prototype.trim removes, which PHP's trim does not).
function trimText(value: string): string {
  return value.replace(/^[ \n]+/, "").replace(/[ \n]+$/, "");
}

// Checks one plain-text value and returns the first failing rule. Length counts code points.
function checkText(
  raw: string,
  rules: TextRules,
  placeholders: string[],
): { code: string } | { value: string } {
  const value = trimText(raw);
  const probe = rules.multiline === true ? value.replaceAll("\n", "") : value;
  if (CONTROL.test(probe)) return { code: "text.control_char" };
  if (value.includes("<") || value.includes(">")) return { code: "text.markup" };
  const length = Array.from(value).length;
  if (length < rules.min) return { code: "text.empty" };
  if (length > rules.max) return { code: "text.too_long" };
  if (rules.placeholders === true) {
    let rest = value;
    for (const name of placeholders) rest = rest.replaceAll(`{${name}}`, "");
    if (rest.includes("{") || rest.includes("}")) return { code: "text.placeholder_unknown" };
  }
  return { value };
}

class Reader {
  readonly errors: LayoutError[] = [];
  readonly map: LayoutMap;

  constructor(map: LayoutMap) {
    this.map = map;
  }

  add(code: string, path: string): void {
    this.errors.push({ code, path });
  }

  checkKeys(value: JsonObject, path: string, allowed: string[]): void {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) this.add("field.unknown", pointer(path, key));
    }
  }

  object(parent: JsonObject, key: string, parentPath: string, allowed: string[]) {
    const path = pointer(parentPath, key);
    if (!Object.hasOwn(parent, key)) {
      this.add("field.required", path);
      return null;
    }
    const value = parent[key];
    if (!isObject(value)) {
      this.add("field.wrong_type", path);
      return null;
    }
    this.checkKeys(value, path, allowed);
    return value;
  }

  bool(parent: JsonObject, key: string, parentPath: string): boolean | null {
    const path = pointer(parentPath, key);
    if (!Object.hasOwn(parent, key)) {
      this.add("field.required", path);
      return null;
    }
    const value = parent[key];
    if (typeof value !== "boolean") {
      this.add("field.wrong_type", path);
      return null;
    }
    return value;
  }

  string(parent: JsonObject, key: string, parentPath: string): string | null {
    const path = pointer(parentPath, key);
    if (!Object.hasOwn(parent, key)) {
      this.add("field.required", path);
      return null;
    }
    const value = parent[key];
    if (typeof value !== "string") {
      this.add("field.wrong_type", path);
      return null;
    }
    return value;
  }

  enum(
    parent: JsonObject,
    key: string,
    parentPath: string,
    allowed: string[],
    code: string,
  ): string | null {
    const value = this.string(parent, key, parentPath);
    if (value === null) return null;
    if (!allowed.includes(value)) {
      this.add(code, pointer(parentPath, key));
      return null;
    }
    return value;
  }

  textValue(raw: string, path: string, rules: TextRules): string | null {
    const checked = checkText(raw, rules, this.map.placeholders);
    if ("code" in checked) {
      this.add(checked.code, path);
      return null;
    }
    return checked.value;
  }

  text(parent: JsonObject, key: string, parentPath: string, rules: TextRules): string | null {
    const raw = this.string(parent, key, parentPath);
    return raw === null ? null : this.textValue(raw, pointer(parentPath, key), rules);
  }

  // URLs are not trimmed: whitespace makes them invalid.
  url(
    parent: JsonObject,
    key: string,
    parentPath: string,
    grammar: "url" | "urlHttps",
    required: boolean,
  ): string | null {
    const value = this.string(parent, key, parentPath);
    if (value === null) return null;
    const path = pointer(parentPath, key);
    if (value === "") {
      if (required) {
        this.add("url.empty", path);
        return null;
      }
      return "";
    }
    if (
      value.length > this.map.limits.urlLength ||
      !new RegExp(this.map.grammars[grammar]).test(value)
    ) {
      this.add("url.invalid", path);
      return null;
    }
    return value;
  }
}

// The validate* functions collect errors in the reader and return the normalized section
// (null where a part failed). The output is only used when there is no error.
function validateHeader(root: JsonObject, reader: Reader): JsonObject | null {
  const { map } = reader;
  const header = reader.object(root, "header", "", [
    "sticky",
    "usp",
    "logo",
    "cta",
    "search",
    "mobileMenu",
  ]);
  if (header === null) return null;
  const out: JsonObject = {
    sticky: reader.bool(header, "sticky", "/header"),
    usp: null,
    logo: reader.enum(header, "logo", "/header", map.enums.logo, "header.logo.invalid"),
    cta: null,
    search: reader.bool(header, "search", "/header"),
    mobileMenu: reader.enum(
      header,
      "mobileMenu",
      "/header",
      map.enums.mobileMenu,
      "header.mobile_menu.invalid",
    ),
  };

  const usp = reader.object(header, "usp", "/header", ["enabled", "items"]);
  if (usp !== null) {
    const enabled = reader.bool(usp, "enabled", "/header/usp");
    let items: (string | null)[] | null = null;
    if (!Object.hasOwn(usp, "items")) {
      reader.add("field.required", "/header/usp/items");
    } else if (!Array.isArray(usp["items"])) {
      reader.add("field.wrong_type", "/header/usp/items");
    } else {
      items = (usp["items"] as unknown[]).map((item, index) => {
        const path = `/header/usp/items/${index}`;
        if (typeof item !== "string") {
          reader.add("field.wrong_type", path);
          return null;
        }
        return reader.textValue(item, path, { min: 1, max: map.limits.uspItemLength });
      });
      if (items.length > map.limits.uspItems) {
        reader.add("header.usp.too_many", "/header/usp/items");
      } else if (enabled === true && items.length === 0) {
        reader.add("header.usp.empty", "/header/usp/items");
      }
    }
    out["usp"] = { enabled, items };
  }

  const cta = reader.object(header, "cta", "/header", ["enabled", "text", "url"]);
  if (cta !== null) {
    const enabled = reader.bool(cta, "enabled", "/header/cta");
    out["cta"] = {
      enabled,
      text: reader.text(cta, "text", "/header/cta", {
        min: enabled === true ? 1 : 0,
        max: map.limits.ctaTextLength,
      }),
      url: reader.url(cta, "url", "/header/cta", "url", enabled === true),
    };
  }
  return out;
}

function validateFooter(root: JsonObject, reader: Reader): JsonObject | null {
  const { map } = reader;
  const footer = reader.object(root, "footer", "", [
    "stickToBottom",
    "columns",
    "contact",
    "social",
    "copyright",
    "backToTop",
  ]);
  if (footer === null) return null;
  const out: JsonObject = {
    stickToBottom: reader.bool(footer, "stickToBottom", "/footer"),
    columns: null,
    contact: reader.text(footer, "contact", "/footer", {
      multiline: true,
      min: 0,
      max: map.limits.contactLength,
    }),
    social: null,
    copyright: null,
    backToTop: reader.bool(footer, "backToTop", "/footer"),
  };

  const columns = footer["columns"];
  if (!Object.hasOwn(footer, "columns")) {
    reader.add("field.required", "/footer/columns");
  } else if (typeof columns !== "number") {
    reader.add("field.wrong_type", "/footer/columns");
  } else if (
    !Number.isInteger(columns) ||
    columns < map.limits.columnsMin ||
    columns > map.limits.columnsMax
  ) {
    reader.add("footer.columns.invalid", "/footer/columns");
  } else {
    out["columns"] = columns;
  }

  const social = footer["social"];
  if (!Object.hasOwn(footer, "social")) {
    reader.add("field.required", "/footer/social");
  } else if (!Array.isArray(social)) {
    reader.add("field.wrong_type", "/footer/social");
  } else {
    const links = (social as unknown[]).map((item, index) => {
      const path = `/footer/social/${index}`;
      if (!isObject(item)) {
        reader.add("field.wrong_type", path);
        return null;
      }
      reader.checkKeys(item, path, ["service", "url"]);
      return {
        service: reader.enum(
          item,
          "service",
          path,
          map.enums.service,
          "footer.social.service_invalid",
        ),
        url: reader.url(item, "url", path, "urlHttps", true),
      };
    });
    if (links.length > map.limits.socialItems) {
      reader.add("footer.social.too_many", "/footer/social");
    }
    out["social"] = links;
  }

  const copyright = reader.object(footer, "copyright", "/footer", ["enabled", "text"]);
  if (copyright !== null) {
    const enabled = reader.bool(copyright, "enabled", "/footer/copyright");
    out["copyright"] = {
      enabled,
      text: reader.text(copyright, "text", "/footer/copyright", {
        min: enabled === true ? 1 : 0,
        max: map.limits.copyrightLength,
        placeholders: true,
      }),
    };
  }
  return out;
}

function validateObject(root: JsonObject, map: LayoutMap): LayoutResult {
  if (!Object.hasOwn(root, "schemaVersion")) {
    return { ok: false, errors: [{ code: "field.required", path: "/schemaVersion" }] };
  }
  const version = root["schemaVersion"];
  if (typeof version !== "number") {
    return { ok: false, errors: [{ code: "field.wrong_type", path: "/schemaVersion" }] };
  }
  if (version !== map.contractVersion) {
    return { ok: false, errors: [{ code: "schema.version_unsupported", path: "/schemaVersion" }] };
  }

  const reader = new Reader(map);
  reader.checkKeys(root, "", ["schemaVersion", "theme", "layout", "header", "footer"]);
  const output: LayoutConfig = { schemaVersion: map.contractVersion };
  const theme = reader.object(root, "theme", "", ["slug"]);
  if (theme !== null) {
    const slug = reader.string(theme, "slug", "/theme");
    if (slug !== null && !new RegExp(map.grammars.slug).test(slug)) {
      reader.add("theme.slug.invalid", "/theme/slug");
    } else {
      output["theme"] = { slug };
    }
  }
  output["layout"] = reader.enum(root, "layout", "", map.enums.layout, "layout.invalid");
  output["header"] = validateHeader(root, reader);
  output["footer"] = validateFooter(root, reader);

  if (reader.errors.length > 0) {
    reader.errors.sort((a, b) => byteCompare(a.path, b.path) || byteCompare(a.code, b.code));
    return { ok: false, errors: reader.errors };
  }
  return { ok: true, config: migrateLayoutConfig(output), errors: [] };
}

// Brings a config that already passed validation at its own version up to the current one.
// Version 1 is the only version, so there is no step yet.
export function migrateLayoutConfig(config: LayoutConfig): LayoutConfig {
  return config;
}

// The default configuration: blank layout, plain header, one-column footer with a copyright
// line. Defaults belong to the wizard, not to the validator.
export function layoutDefaults(slug = "blixis-starter", map: LayoutMap = layoutMap): LayoutConfig {
  return {
    schemaVersion: map.contractVersion,
    theme: { slug },
    ...structuredClone(map.defaults),
  };
}

export function validateLayoutBytes(bytes: Uint8Array, map: LayoutMap = layoutMap): LayoutResult {
  if (bytes.byteLength > map.limits.maxBytes) return fail("config.too_large");
  if (exceedsDepth(bytes, map.limits.maxDepth)) return fail("config.too_deep");
  let root: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    root = JSON.parse(text) as unknown;
  } catch {
    return fail("config.invalid_json");
  }
  if (!isRepresentable(root)) return fail("config.invalid_json");
  if (!isObject(root)) return fail("config.not_object");
  return validateObject(root, map);
}

export function validateLayoutText(text: string, map: LayoutMap = layoutMap): LayoutResult {
  return validateLayoutBytes(encode(text), map);
}
