// BlixisThemeConfig v1 validator for the browser (task 03-02). Must return the same
// {code, path} errors as plugins/blixis-blocks/inc/tokens/validate.php for every input;
// tests/03-02 compares them. The server result stays authoritative.
import { type TokenMap, tokenMap } from "./token-map.ts";

export type ValidationError = { code: string; path: string };
export type Config = Record<string, unknown>;
export type ValidationResult =
  | { ok: true; config: Config; errors: [] }
  | { ok: false; errors: ValidationError[] };

type JsonObject = Record<string, unknown>;

const LONE_SURROGATE = /\p{Cs}/u;
const ENCODER = new TextEncoder();

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pointer(parent: string, key: string): string {
  return `${parent}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

// PHP's json_decode refuses lone surrogates anywhere and object keys starting
// with NUL. JSON.parse accepts both, so the rule is enforced here to keep parity.
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

// Runs on the raw bytes, before parsing. PHP's parser fails with a syntax error on very
// deep input (bison stack limit), so depth cannot be measured after json_decode. Applies
// to malformed text too, so both languages report the same code.
export function exceedsDepth(bytes: Uint8Array, limit: number): boolean {
  const QUOTE = 0x22;
  const BACKSLASH = 0x5c;
  let depth = 0;
  let inString = false;
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i];
    if (inString) {
      if (byte === BACKSLASH) i += 1;
      else if (byte === QUOTE) inString = false;
    } else if (byte === QUOTE) inString = true;
    else if (byte === 0x5b || byte === 0x7b) {
      depth += 1;
      if (depth > limit) return true;
    } else if (byte === 0x5d || byte === 0x7d) depth -= 1;
  }
  return false;
}

function fail(code: string, path: string): ValidationResult {
  return { ok: false, errors: [{ code, path }] };
}

function byteCompare(a: string, b: string): number {
  const left = ENCODER.encode(a);
  const right = ENCODER.encode(b);
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return left.length - right.length;
}

export function normalizeColor(value: string): string {
  const lower = value.toLowerCase();
  if (lower.length === 4) {
    const [, r = "", g = "", b = ""] = lower;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return lower;
}

function checkToken(
  map: TokenMap,
  kind: string,
  key: string,
  value: string,
): { code: string } | { value: string } {
  let grammar = kind;
  if (kind === "motion") grammar = key === "easing" ? "easing" : "duration";
  const pattern = new RegExp(map.grammars[grammar] ?? "^$");
  if (!pattern.test(value)) return { code: map.errorCodes[grammar] ?? "token.invalid" };
  if (kind === "color") return { value: normalizeColor(value) };
  if (kind === "shadow") return { value: value.toLowerCase() };
  return { value };
}

function checkBreakpoints(
  map: TokenMap,
  section: JsonObject,
  errors: ValidationError[],
  hadGrammarError: boolean,
): void {
  if (hadGrammarError) return;
  const keys = Object.keys(map.breakpointPreset);
  let previous = -1;
  let ascending = true;
  for (const key of keys) {
    const current = section[key];
    if (typeof current !== "string") return;
    const size = Number.parseFloat(current);
    if (size <= previous) {
      errors.push({ code: "token.breakpoint.not_ascending", path: `/breakpoints/${key}` });
      ascending = false;
    }
    previous = size;
  }
  if (!ascending) return;
  for (const key of keys) {
    if (section[key] !== map.breakpointPreset[key]) {
      errors.push({ code: "token.breakpoint.not_preset", path: `/breakpoints/${key}` });
    }
  }
}

function validateObject(root: JsonObject, map: TokenMap): ValidationResult {
  if (!Object.hasOwn(root, "schemaVersion")) return fail("field.required", "/schemaVersion");
  const version = root["schemaVersion"];
  if (typeof version !== "number") return fail("field.wrong_type", "/schemaVersion");
  if (version !== map.contractVersion) return fail("schema.version_unsupported", "/schemaVersion");

  const errors: ValidationError[] = [];
  const output: Config = { schemaVersion: map.contractVersion };
  const known = new Set(["schemaVersion", "theme", ...map.sections.map((s) => s.section)]);
  for (const key of Object.keys(root)) {
    if (!known.has(key)) errors.push({ code: "field.unknown", path: pointer("", key) });
  }

  validateTheme(root, map, errors, output);
  for (const section of map.sections) {
    const name = section.section;
    if (!Object.hasOwn(root, name)) {
      errors.push({ code: "field.required", path: `/${name}` });
      continue;
    }
    const raw = root[name];
    if (!isObject(raw)) {
      errors.push({ code: "field.wrong_type", path: `/${name}` });
      continue;
    }
    for (const key of Object.keys(raw)) {
      if (!Object.hasOwn(section.tokens, key)) {
        errors.push({ code: "field.unknown", path: pointer(`/${name}`, key) });
      }
    }
    const clean: JsonObject = {};
    let shapeOk = true;
    let grammarError = false;
    for (const key of Object.keys(section.tokens)) {
      const path = `/${name}/${key}`;
      if (!Object.hasOwn(raw, key)) {
        errors.push({ code: "field.required", path });
        shapeOk = false;
        continue;
      }
      const value = raw[key];
      if (typeof value !== "string") {
        errors.push({ code: "field.wrong_type", path });
        shapeOk = false;
        continue;
      }
      const checked = checkToken(map, section.kind, key, value);
      if ("code" in checked) {
        errors.push({ code: checked.code, path });
        grammarError = true;
        continue;
      }
      clean[key] = checked.value;
    }
    if (section.kind === "breakpoint") checkBreakpoints(map, raw, errors, grammarError || !shapeOk);
    output[name] = clean;
  }

  if (errors.length > 0) {
    errors.sort((a, b) => byteCompare(a.path, b.path) || byteCompare(a.code, b.code));
    return { ok: false, errors };
  }
  return { ok: true, config: output, errors: [] };
}

function validateTheme(
  root: JsonObject,
  map: TokenMap,
  errors: ValidationError[],
  output: Config,
): void {
  if (!Object.hasOwn(root, "theme")) {
    errors.push({ code: "field.required", path: "/theme" });
    return;
  }
  const theme = root["theme"];
  if (!isObject(theme)) {
    errors.push({ code: "field.wrong_type", path: "/theme" });
    return;
  }
  for (const key of Object.keys(theme)) {
    if (key !== "slug" && key !== "parent") {
      errors.push({ code: "field.unknown", path: pointer("/theme", key) });
    }
  }
  const slug = theme["slug"];
  if (!Object.hasOwn(theme, "slug")) errors.push({ code: "field.required", path: "/theme/slug" });
  else if (typeof slug !== "string") errors.push({ code: "field.wrong_type", path: "/theme/slug" });
  else if (!new RegExp(map.grammars["slug"] ?? "^$").test(slug))
    errors.push({ code: "token.slug.invalid", path: "/theme/slug" });

  const parent = theme["parent"];
  if (!Object.hasOwn(theme, "parent"))
    errors.push({ code: "field.required", path: "/theme/parent" });
  else if (typeof parent !== "string")
    errors.push({ code: "field.wrong_type", path: "/theme/parent" });
  else if (parent !== map.theme.parent)
    errors.push({ code: "token.parent.invalid", path: "/theme/parent" });

  output["theme"] = { slug, parent };
}

export function validateBytes(bytes: Uint8Array, map: TokenMap = tokenMap): ValidationResult {
  if (bytes.byteLength > map.limits.maxBytes) return fail("config.too_large", "");
  if (exceedsDepth(bytes, map.limits.maxDepth)) return fail("config.too_deep", "");
  let root: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    root = JSON.parse(text) as unknown;
  } catch {
    return fail("config.invalid_json", "");
  }
  if (!isRepresentable(root)) return fail("config.invalid_json", "");
  if (!isObject(root)) return fail("config.not_object", "");
  return validateObject(root, map);
}

export function validateText(text: string, map: TokenMap = tokenMap): ValidationResult {
  return validateBytes(ENCODER.encode(text), map);
}
