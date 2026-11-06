// Throwaway proof for task 01-05. Shared constants of document contract v1.
export const LIMITS = {
  maxBytes: 1_048_576,
  maxJsonNesting: 32,
  maxNodes: 2000,
  maxDepth: 16,
  maxStringBytes: 65_536,
  maxErrors: 100,
} as const;

export const CURRENT_SCHEMA_VERSION = 1;
export const BREAKPOINTS = ["sm", "md", "lg", "xl"];
export const TOP_LEVEL_FIELDS = ["schemaVersion", "documentId", "root", "nodes", "themeRef"];
export const NODE_FIELDS = ["id", "type", "version", "props", "responsive", "children", "locked"];
export const FORBIDDEN_KEYS = ["__proto__", "constructor", "prototype"];
export const FORBIDDEN_PROPS = [
  "html",
  "innerhtml",
  "outerhtml",
  "dangerouslysetinnerhtml",
  "script",
  "style",
  "css",
  "class",
  "classname",
  "srcdoc",
];
export const WP_OWNED_FIELDS = [
  "ID",
  "id",
  "title",
  "slug",
  "status",
  "author",
  "date",
  "modified",
  "excerpt",
  "password",
  "parent",
  "menu_order",
  "template",
  "meta",
  "guid",
  "comment_status",
  "ping_status",
  "post_title",
  "post_name",
  "post_status",
  "post_author",
  "post_date",
  "post_date_gmt",
  "post_modified",
  "post_modified_gmt",
  "post_content",
  "post_excerpt",
  "post_password",
  "post_parent",
  "post_type",
];

// Codes that mean "keep the bytes, do not render through this code path, do not write".
export const PRESERVE_CODES = [
  "unsupported_schema_version",
  "unsupported_element_version",
  "unknown_element_type",
];

export const PATTERNS = {
  nodeId: /^[A-Za-z][A-Za-z0-9_-]{0,63}$/,
  documentId: /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/,
  type: /^[a-z0-9-]+\/[a-z0-9-]+$/,
  themeSlug: /^[a-z0-9][a-z0-9-]{0,63}$/,
  token: /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,63}$/,
  iconId: /^[a-z0-9-]+:[a-z0-9-]+$/,
  // Linear: each attempt stops at the next "<". "a<b" and "a<b 5 > 3" stay legal text.
  tag: /<(?:\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s+[a-zA-Z_:@][^<>]*|\s*\/?)?>|[!?][^<>]*>)/,
  rawTag: /<(?:script|style|iframe|object|embed|svg|math)\b/i,
  eventProp: /^on[a-z]+$/i,
  urlScheme: /^([a-zA-Z][a-zA-Z0-9+.-]*):/,
  // eslint-disable-next-line no-control-regex
  urlControl: /[\u0000- \u007f]/,
};
export const URL_SCHEMES = ["http", "https", "mailto", "tel"];

export type PropDescriptor =
  | { kind: "text" | "textList" | "token" | "url" | "bool" | "ref" | "iconId" }
  | { kind: "int"; min: number; max: number }
  | { kind: "enum"; values: string[] }
  | { kind: "items"; fields: string[] };

export interface RegistryElement {
  version: number;
  allowedParents: string[];
  allowedChildren: string[];
  props: Record<string, PropDescriptor>;
  responsive: string[];
}
export type Registry = Record<string, RegistryElement>;

export interface ValidationError {
  code: string;
  path: string;
}
export type ValidationStatus = "valid" | "preserve" | "rejected";
export interface ValidationResult {
  status: ValidationStatus;
  codes: string[];
  errors: ValidationError[];
  truncated: boolean;
  preserved: string[];
}
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
