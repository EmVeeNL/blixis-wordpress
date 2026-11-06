// Throwaway proof for task 01-05. The PHP twin is wp/plugins/blixis-doc-contract-lib/validator.php.
import {
  BREAKPOINTS,
  CURRENT_SCHEMA_VERSION,
  FORBIDDEN_KEYS,
  FORBIDDEN_PROPS,
  isObject,
  LIMITS,
  NODE_FIELDS,
  PATTERNS,
  PRESERVE_CODES,
  TOP_LEVEL_FIELDS,
  URL_SCHEMES,
  WP_OWNED_FIELDS,
} from "./contract.ts";
import type {
  Json,
  JsonObject,
  PropDescriptor,
  Registry,
  RegistryElement,
  ValidationError,
  ValidationResult,
} from "./contract.ts";

const encoder = new TextEncoder();
const byteLength = (text: string): number => encoder.encode(text).length;
const pointer = (part: string): string => part.replaceAll("~", "~0").replaceAll("/", "~1");
const compareBytes = (a: string, b: string): number =>
  Buffer.compare(Buffer.from(a), Buffer.from(b));
const isInt = (value: unknown): value is number => Number.isSafeInteger(value);
const hasKey = (object: JsonObject, key: string): boolean => Object.hasOwn(object, key);

/** Outermost array/object nesting of raw text, ignoring strings. Works on malformed input too. */
export function rawNesting(text: string): number {
  let depth = 0;
  let max = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (c === 0x5c) i++;
      else if (c === 0x22) inString = false;
    } else if (c === 0x22) inString = true;
    else if (c === 0x7b || c === 0x5b) max = Math.max(max, ++depth);
    else if (c === 0x7d || c === 0x5d) depth--;
  }
  return max;
}

/** Finds repeated keys and NUL-leading keys in text that already parsed as JSON. */
export function scanKeys(text: string): { duplicate: boolean; nulKey: boolean } {
  const stack: (Set<string> | null)[] = [];
  let duplicate = false;
  let nulKey = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x22) {
      const start = i++;
      while (text.charCodeAt(i) !== 0x22) i += text.charCodeAt(i) === 0x5c ? 2 : 1;
      let next = i + 1;
      while (/\s/.test(text.charAt(next))) next++;
      const keys = stack.at(-1);
      if (text.charAt(next) === ":" && keys) {
        const key = JSON.parse(text.slice(start, i + 1)) as string;
        if (key.startsWith("\u0000")) nulKey = true;
        if (keys.has(key)) duplicate = true;
        keys.add(key);
      }
    } else if (c === 0x7b) stack.push(new Set());
    else if (c === 0x5b) stack.push(null);
    else if (c === 0x7d || c === 0x5d) stack.pop();
  }
  return { duplicate, nulKey };
}

function hasLoneSurrogate(value: Json): boolean {
  if (typeof value === "string") return /\p{Cs}/u.test(value);
  if (Array.isArray(value)) return value.some(hasLoneSurrogate);
  if (isObject(value)) {
    return Object.keys(value).some((k) => /\p{Cs}/u.test(k) || hasLoneSurrogate(value[k] as Json));
  }
  return false;
}

export function deepEqual(a: Json | undefined, b: Json | undefined): boolean {
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isObject(a)) {
    if (!isObject(b)) return false;
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((k) => hasKey(b, k) && deepEqual(a[k], b[k]))
    );
  }
  return a === b;
}

export function isSafeUrl(url: string): boolean {
  if (url === "") return true;
  if (PATTERNS.urlControl.test(url) || url.includes("\\") || url.startsWith("//")) return false;
  if (url.startsWith("/") || url.startsWith("#") || url.startsWith("?")) return true;
  const scheme = PATTERNS.urlScheme.exec(url)?.[1];
  if (scheme !== undefined) return URL_SCHEMES.includes(scheme.toLowerCase());
  const firstSegment = url.split(/[/?]/, 1)[0] ?? "";
  return !firstSegment.includes(":");
}

const hasMarkup = (text: string): boolean => PATTERNS.tag.test(text) || PATTERNS.rawTag.test(text);

class Run {
  errors: ValidationError[] = [];
  add(code: string, path: string): void {
    this.errors.push({ code, path });
  }

  walkForbidden(value: Json, path: string): void {
    if (Array.isArray(value)) {
      value.forEach((item, i) => this.walkForbidden(item, `${path}/${i}`));
    } else if (isObject(value)) {
      for (const key of Object.keys(value)) {
        const child = `${path}/${pointer(key)}`;
        if (FORBIDDEN_KEYS.includes(key)) this.add("forbidden_key", child);
        else this.walkForbidden(value[key] as Json, child);
      }
    }
  }

  text(value: Json | undefined, path: string): void {
    if (typeof value !== "string") return this.add("invalid_prop_value", path);
    if (byteLength(value) > LIMITS.maxStringBytes) return this.add("string_too_long", path);
    if (hasMarkup(value)) this.add("html_in_text", path);
  }

  value(descriptor: PropDescriptor, value: Json | undefined, path: string): void {
    switch (descriptor.kind) {
      case "text":
        return this.text(value, path);
      case "textList":
        if (!Array.isArray(value) || value.length > 200)
          return this.add("invalid_prop_value", path);
        return value.forEach((item, i) => this.text(item, `${path}/${i}`));
      case "items":
        if (!Array.isArray(value) || value.length > 200)
          return this.add("invalid_prop_value", path);
        return value.forEach((item, i) => {
          const itemPath = `${path}/${i}`;
          if (!isObject(item)) return this.add("invalid_prop_value", itemPath);
          for (const key of Object.keys(item)) {
            if (FORBIDDEN_KEYS.includes(key)) continue;
            const child = `${itemPath}/${pointer(key)}`;
            if (descriptor.fields.includes(key)) this.text(item[key], child);
            else this.unknownProp(key, child);
          }
        });
      case "token":
        if (typeof value !== "string" || !PATTERNS.token.test(value)) {
          this.add("invalid_prop_value", path);
        }
        return;
      case "iconId":
        if (typeof value !== "string" || !PATTERNS.iconId.test(value)) {
          this.add("invalid_prop_value", path);
        }
        return;
      case "url":
        if (typeof value !== "string") return this.add("invalid_prop_value", path);
        if (byteLength(value) > 2048 || !isSafeUrl(value)) this.add("unsafe_url", path);
        return;
      case "bool":
        if (typeof value !== "boolean") this.add("invalid_prop_value", path);
        return;
      case "ref":
        if (value !== null && !(isInt(value) && value > 0)) this.add("invalid_prop_value", path);
        return;
      case "int":
        if (!isInt(value) || value < descriptor.min || value > descriptor.max) {
          this.add("invalid_prop_value", path);
        }
        return;
      case "enum":
        if (typeof value !== "string" || !descriptor.values.includes(value)) {
          this.add("invalid_prop_value", path);
        }
    }
  }

  unknownProp(key: string, path: string): void {
    const lower = key.toLowerCase();
    const forbidden = FORBIDDEN_PROPS.includes(lower) || PATTERNS.eventProp.test(key);
    this.add(forbidden ? "forbidden_prop" : "unknown_prop", path);
  }

  props(element: RegistryElement, props: JsonObject, path: string): void {
    for (const key of Object.keys(props)) {
      if (FORBIDDEN_KEYS.includes(key)) continue;
      const child = `${path}/${pointer(key)}`;
      const declared = hasKey(element.props as JsonObject, key) ? element.props[key] : undefined;
      if (declared) this.value(declared, props[key], child);
      else if (key === "visibility") this.value({ kind: "bool" }, props[key], child);
      else if (element.responsive.includes(key)) this.value({ kind: "token" }, props[key], child);
      else this.unknownProp(key, child);
    }
  }

  responsive(element: RegistryElement, responsive: JsonObject, path: string): void {
    for (const breakpoint of Object.keys(responsive)) {
      if (FORBIDDEN_KEYS.includes(breakpoint)) continue;
      const bpPath = `${path}/${pointer(breakpoint)}`;
      if (!BREAKPOINTS.includes(breakpoint)) {
        this.add("unknown_breakpoint", bpPath);
        continue;
      }
      const overrides = responsive[breakpoint];
      if (!isObject(overrides)) {
        this.add("invalid_responsive", bpPath);
        continue;
      }
      for (const key of Object.keys(overrides)) {
        if (FORBIDDEN_KEYS.includes(key)) continue;
        const child = `${bpPath}/${pointer(key)}`;
        if (element.responsive.includes(key)) {
          const declared = hasKey(element.props as JsonObject, key)
            ? element.props[key]
            : undefined;
          const descriptor: PropDescriptor =
            declared ?? (key === "visibility" ? { kind: "bool" } : { kind: "token" });
          this.value(descriptor, overrides[key], child);
        } else if (FORBIDDEN_PROPS.includes(key.toLowerCase()) || PATTERNS.eventProp.test(key)) {
          this.add("forbidden_prop", child);
        } else {
          this.add("unknown_responsive_prop", child);
        }
      }
    }
  }
}

function finish(run: Run, preserved: string[] = []): ValidationResult {
  const sorted = run.errors.sort(
    (a, b) => compareBytes(a.path, b.path) || compareBytes(a.code, b.code),
  );
  const unique = sorted.filter(
    (e, i) => i === 0 || e.code !== sorted[i - 1]?.code || e.path !== sorted[i - 1]?.path,
  );
  const blocking = unique.some((e) => !PRESERVE_CODES.includes(e.code));
  const status = unique.length === 0 ? "valid" : blocking ? "rejected" : "preserve";
  return {
    status,
    codes: [...new Set(unique.map((e) => e.code))].sort(compareBytes),
    errors: unique.slice(0, LIMITS.maxErrors),
    truncated: unique.length > LIMITS.maxErrors,
    preserved: preserved.sort(compareBytes),
  };
}

function fatal(code: string, path = ""): ValidationResult {
  const run = new Run();
  run.add(code, path);
  return finish(run);
}

function decodeStored(stored: Uint8Array | undefined): JsonObject | undefined {
  if (!stored) return undefined;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(stored)) as Json;
    return isObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Validates raw document bytes. `stored` is the currently stored document on the write path: an
 * unknown-version or unknown-type node passes only if it is unchanged from that stored document.
 */
export function validate(
  bytes: Uint8Array,
  registry: Registry,
  options: { stored?: Uint8Array; readerVersion?: number } = {},
): ValidationResult {
  if (bytes.length > LIMITS.maxBytes) return fatal("document_too_large");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return fatal("invalid_json");
  }
  if (rawNesting(text) > LIMITS.maxJsonNesting) return fatal("json_nesting_exceeded");
  let doc: Json;
  try {
    doc = JSON.parse(text) as Json;
  } catch {
    return fatal("invalid_json");
  }
  const keys = scanKeys(text);
  if (keys.nulKey || hasLoneSurrogate(doc)) return fatal("invalid_json");
  if (keys.duplicate) return fatal("duplicate_key");
  if (!isObject(doc)) return fatal("not_object");

  const run = new Run();
  run.walkForbidden(doc, "");

  const version = hasKey(doc, "schemaVersion") ? doc["schemaVersion"] : undefined;
  if (version === undefined) run.add("missing_field", "/schemaVersion");
  else if (!isInt(version) || version < 1) run.add("invalid_schema_version", "/schemaVersion");
  else if (version > (options.readerVersion ?? CURRENT_SCHEMA_VERSION)) {
    // A future shape is unknowable: keep the bytes, make no further claim about them.
    run.errors = [];
    run.add("unsupported_schema_version", "/schemaVersion");
    return finish(run);
  }

  for (const key of Object.keys(doc)) {
    if (FORBIDDEN_KEYS.includes(key) || TOP_LEVEL_FIELDS.includes(key)) continue;
    const path = `/${pointer(key)}`;
    run.add(WP_OWNED_FIELDS.includes(key) ? "wp_owned_field" : "unknown_top_level_field", path);
  }
  for (const key of ["documentId", "root", "nodes", "themeRef"]) {
    if (!hasKey(doc, key)) run.add("missing_field", `/${key}`);
  }
  if (hasKey(doc, "documentId")) {
    const id = doc["documentId"];
    if (typeof id !== "string" || !PATTERNS.documentId.test(id)) {
      run.add("invalid_document_id", "/documentId");
    }
  }
  if (hasKey(doc, "themeRef")) {
    const ref = doc["themeRef"];
    const ok =
      isObject(ref) &&
      Object.keys(ref).every((k) => k === "theme" || k === "tokensVersion") &&
      typeof ref["theme"] === "string" &&
      PATTERNS.themeSlug.test(ref["theme"]) &&
      isInt(ref["tokensVersion"]) &&
      ref["tokensVersion"] >= 1;
    if (!ok) run.add("invalid_theme_ref", "/themeRef");
  }

  const rootValue = hasKey(doc, "root") ? doc["root"] : undefined;
  const nodesValue = hasKey(doc, "nodes") ? doc["nodes"] : undefined;
  if (rootValue !== undefined && !Array.isArray(rootValue)) run.add("invalid_root", "/root");
  if (nodesValue !== undefined && !isObject(nodesValue)) run.add("invalid_nodes", "/nodes");
  if (!Array.isArray(rootValue) || !isObject(nodesValue)) return finish(run);

  const nodes = nodesValue;
  const allIds = Object.keys(nodes)
    .filter((id) => !FORBIDDEN_KEYS.includes(id))
    .sort(compareBytes);
  if (allIds.length > LIMITS.maxNodes) {
    run.errors = [];
    run.add("too_many_nodes", "/nodes");
    return finish(run);
  }

  const stored = decodeStored(options.stored);
  const storedNodes = stored && isObject(stored["nodes"]) ? stored["nodes"] : undefined;
  const preserved: string[] = [];
  const children = new Map<string, string[]>();
  const typeOf = new Map<string, string>();

  for (const id of allIds) {
    const path = `/nodes/${pointer(id)}`;
    const node = nodes[id];
    if (!PATTERNS.nodeId.test(id)) run.add("invalid_node_id", path);
    if (!isObject(node)) {
      run.add("invalid_node", path);
      children.set(id, []);
      continue;
    }
    for (const key of Object.keys(node)) {
      if (!FORBIDDEN_KEYS.includes(key) && !NODE_FIELDS.includes(key)) {
        run.add("unknown_node_field", `${path}/${pointer(key)}`);
      }
    }
    for (const key of ["id", "type", "version", "props", "children"]) {
      if (!hasKey(node, key)) run.add("missing_field", `${path}/${key}`);
    }
    if (hasKey(node, "id") && node["id"] !== id) run.add("id_key_mismatch", `${path}/id`);
    if (hasKey(node, "locked") && typeof node["locked"] !== "boolean") {
      run.add("invalid_node_field", `${path}/locked`);
    }

    const list: string[] = [];
    if (hasKey(node, "children")) {
      const raw = node["children"];
      if (Array.isArray(raw)) {
        raw.forEach((child, i) => {
          if (typeof child === "string") list.push(child);
          else run.add("invalid_children", `${path}/children/${i}`);
        });
      } else {
        run.add("invalid_children", `${path}/children`);
      }
    }
    children.set(id, list);

    const type = hasKey(node, "type") ? node["type"] : undefined;
    const nodeVersion = hasKey(node, "version") ? node["version"] : undefined;
    const props = hasKey(node, "props") ? node["props"] : undefined;
    const responsive = hasKey(node, "responsive") ? node["responsive"] : undefined;
    if (props !== undefined && !isObject(props)) run.add("non_object_props", `${path}/props`);
    if (responsive !== undefined && !isObject(responsive)) {
      run.add("invalid_responsive", `${path}/responsive`);
    }
    if (type !== undefined && (typeof type !== "string" || !PATTERNS.type.test(type))) {
      run.add("invalid_type", `${path}/type`);
      continue;
    }
    if (nodeVersion !== undefined && (!isInt(nodeVersion) || nodeVersion < 1)) {
      run.add("invalid_version", `${path}/version`);
      continue;
    }
    if (typeof type !== "string" || nodeVersion === undefined) continue;

    const element = hasKey(registry as unknown as JsonObject, type) ? registry[type] : undefined;
    if (!element || element.version !== nodeVersion) {
      const carried = storedNodes && hasKey(storedNodes, id) && deepEqual(storedNodes[id], node);
      if (carried) preserved.push(id);
      else if (!element) run.add("unknown_element_type", `${path}/type`);
      else run.add("unsupported_element_version", `${path}/version`);
      continue;
    }
    typeOf.set(id, type);
    if (isObject(props)) run.props(element, props, `${path}/props`);
    if (isObject(responsive)) run.responsive(element, responsive, `${path}/responsive`);
  }

  // Graph: references and parents.
  const known = new Set(allIds);
  const parents = new Map<string, number>();
  const addParent = (id: string): void => {
    const count = (parents.get(id) ?? 0) + 1;
    parents.set(id, count);
    if (count === 2) run.add("multiple_parents", `/nodes/${pointer(id)}`);
  };
  const roots: string[] = [];
  const seenRoots = new Set<string>();
  rootValue.forEach((id, i) => {
    if (typeof id !== "string") return run.add("invalid_root", `/root/${i}`);
    if (seenRoots.has(id)) return run.add("duplicate_root", `/root/${i}`);
    seenRoots.add(id);
    if (!known.has(id)) return run.add("missing_reference", `/root/${i}`);
    roots.push(id);
    addParent(id);
    const type = typeOf.get(id);
    if (type && !registry[type]?.allowedParents.includes("root")) {
      run.add("invalid_nesting", `/root/${i}`);
    }
  });
  const resolved = new Map<string, string[]>();
  for (const id of allIds) {
    const list: string[] = [];
    const parentType = typeOf.get(id);
    (children.get(id) ?? []).forEach((child, i) => {
      const path = `/nodes/${pointer(id)}/children/${i}`;
      if (!known.has(child)) return run.add("missing_reference", path);
      list.push(child);
      addParent(child);
      const childType = typeOf.get(child);
      if (
        parentType &&
        childType &&
        (!registry[parentType]?.allowedChildren.includes(childType) ||
          !registry[childType]?.allowedParents.includes(parentType))
      ) {
        run.add("invalid_nesting", path);
      }
    });
    resolved.set(id, list);
  }

  // Graph: cycles, with an explicit stack so hostile depth cannot overflow the call stack.
  const color = new Map<string, 1 | 2>();
  for (const start of allIds) {
    if (color.has(start)) continue;
    const stack: [string, number][] = [[start, 0]];
    color.set(start, 1);
    while (stack.length > 0) {
      const frame = stack.at(-1) as [string, number];
      const next = resolved.get(frame[0])?.[frame[1]++];
      if (next === undefined) {
        color.set(frame[0], 2);
        stack.pop();
      } else if (color.get(next) === 1) {
        run.add("cycle", `/nodes/${pointer(frame[0])}/children`);
      } else if (!color.has(next)) {
        color.set(next, 1);
        stack.push([next, 0]);
      }
    }
  }

  // Graph: reachability and depth, breadth first.
  const reached = new Set<string>(roots);
  let level = roots;
  let depth = 1;
  while (level.length > 0) {
    const nextLevel: string[] = [];
    for (const id of level) {
      if (depth === LIMITS.maxDepth + 1) run.add("depth_exceeded", `/nodes/${pointer(id)}`);
      for (const child of resolved.get(id) ?? []) {
        if (!reached.has(child)) {
          reached.add(child);
          nextLevel.push(child);
        }
      }
    }
    level = nextLevel;
    depth++;
  }
  for (const id of allIds) {
    if (!reached.has(id)) run.add("orphan_node", `/nodes/${pointer(id)}`);
  }

  return finish(run, preserved);
}
