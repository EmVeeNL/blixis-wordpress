// Pure renderer semantics shared by the admin preview. Mirrors render.php.
import { Buffer } from "node:buffer";
import { readContractJson } from "./contract.ts";

type PropSpec = {
  kind: "text" | "int" | "url" | "enum";
  default: unknown;
  min?: number;
  max?: number;
  values?: string[];
};
export type ElementSpec = {
  version: number;
  baseClass: string;
  props: Record<string, PropSpec>;
  responsive: string[];
};
export type Registry = {
  rendererVersion: number;
  breakpoints: string[];
  urlPattern: string;
  urlProtocols: string[];
  classes: Record<string, Record<string, string>>;
  elements: Record<string, ElementSpec>;
};
export type Diagnostic = { code: string; path: string };
export type Node = {
  id?: string;
  type?: unknown;
  version?: unknown;
  props?: unknown;
  responsive?: unknown;
  children?: unknown;
};

export const registry = readContractJson<Registry>("renderer/registry.json");

export function resolveResponsive(
  base: string | null,
  overrides: Record<string, string>,
  breakpoints: string[] = registry.breakpoints,
): Record<string, string | null> {
  const out: Record<string, string | null> = { base };
  let current = base;
  for (const breakpoint of breakpoints) {
    current = overrides[breakpoint] ?? current;
    out[breakpoint] = current;
  }
  return out;
}

export function responsiveClasses(
  prop: string,
  resolved: Record<string, string | null>,
  breakpoints: string[] = registry.breakpoints,
): string[] {
  const table = registry.classes[prop] ?? {};
  const out: string[] = [];
  let previous: string | null = null;
  for (const step of ["base", ...breakpoints]) {
    const value = resolved[step] ?? null;
    if (value !== null && value !== previous) {
      const prefix = step === "base" ? "" : `${step}:`;
      for (const name of (table[value] ?? "").split(" ")) out.push(prefix + name);
    }
    previous = value;
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pointerKey(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1");
}

export type Resolved = {
  element: ElementSpec;
  values: Record<string, unknown>;
  classes: string;
  diagnostics: Diagnostic[];
} | null;

export function isSafeUrl(url: string): boolean {
  return new RegExp(registry.urlPattern).test(url);
}

export function resolveNode(node: Node): { resolved: Resolved; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const type = typeof node.type === "string" ? node.type : "";
  const element = Object.hasOwn(registry.elements, type) ? registry.elements[type] : undefined;
  if (element === undefined) {
    return { resolved: null, diagnostics: [{ code: "render.unknown_type", path: "/type" }] };
  }
  if (node.version !== element.version) {
    return { resolved: null, diagnostics: [{ code: "render.unknown_version", path: "/version" }] };
  }
  const props = isRecord(node.props) ? node.props : {};
  const values: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(element.props)) values[name] = spec.default;
  for (const key of Object.keys(props)) {
    if (!Object.hasOwn(element.props, key) && !element.responsive.includes(key)) {
      diagnostics.push({ code: "render.unknown_prop", path: `/props/${pointerKey(key)}` });
    }
  }
  for (const [name, spec] of Object.entries(element.props)) {
    if (!Object.hasOwn(props, name)) continue;
    const value = props[name];
    let ok = false;
    if (spec.kind === "text") ok = typeof value === "string";
    else if (spec.kind === "url") ok = typeof value === "string";
    else if (spec.kind === "enum")
      ok = typeof value === "string" && (spec.values ?? []).includes(value);
    else if (spec.kind === "int") {
      ok =
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= (spec.min ?? 0) &&
        value <= (spec.max ?? 0);
    }
    if (ok) values[name] = value;
    else diagnostics.push({ code: "render.invalid_prop", path: `/props/${name}` });
  }
  const bases: Record<string, string | null> = {};
  const overrides: Record<string, Record<string, string>> = {};
  for (const prop of element.responsive) {
    bases[prop] = null;
    overrides[prop] = {};
    if (!Object.hasOwn(props, prop)) continue;
    const value = props[prop];
    const table = registry.classes[prop] ?? {};
    if (typeof value === "string" && Object.hasOwn(table, value)) bases[prop] = value;
    else diagnostics.push({ code: "render.invalid_prop", path: `/props/${prop}` });
  }
  const responsive = isRecord(node.responsive) ? node.responsive : {};
  for (const [breakpoint, rawSet] of Object.entries(responsive)) {
    const bpPath = `/responsive/${pointerKey(breakpoint)}`;
    if (!registry.breakpoints.includes(breakpoint) || !isRecord(rawSet)) {
      diagnostics.push({ code: "render.invalid_responsive", path: bpPath });
      continue;
    }
    for (const [prop, value] of Object.entries(rawSet)) {
      const path = `${bpPath}/${pointerKey(prop)}`;
      if (!element.responsive.includes(prop)) {
        diagnostics.push({ code: "render.invalid_responsive", path });
        continue;
      }
      const table = registry.classes[prop] ?? {};
      if (typeof value === "string" && Object.hasOwn(table, value)) {
        (overrides[prop] as Record<string, string>)[breakpoint] = value;
      } else {
        diagnostics.push({ code: "render.invalid_prop", path });
      }
    }
  }
  const classes = [element.baseClass];
  for (const prop of element.responsive) {
    classes.push(
      ...responsiveClasses(prop, resolveResponsive(bases[prop] ?? null, overrides[prop] ?? {})),
    );
  }
  return {
    resolved: { element, values, classes: classes.join(" "), diagnostics },
    diagnostics,
  };
}

export function sortDiagnostics(list: Diagnostic[]): Diagnostic[] {
  return list.sort(
    (a, b) =>
      Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)) ||
      Buffer.compare(Buffer.from(a.code), Buffer.from(b.code)),
  );
}
