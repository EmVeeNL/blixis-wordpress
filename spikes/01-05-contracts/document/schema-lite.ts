// Throwaway proof for task 01-05. A tiny JSON Schema evaluator for the keywords the contract schema
// uses, because the spike adds no dependencies. It throws on any keyword it does not implement.
import { isObject } from "./contract.ts";
import type { Json, JsonObject } from "./contract.ts";

const KNOWN = new Set([
  "$schema",
  "$id",
  "$comment",
  "$defs",
  "$ref",
  "title",
  "description",
  "type",
  "const",
  "pattern",
  "minimum",
  "required",
  "properties",
  "additionalProperties",
  "propertyNames",
  "maxProperties",
  "items",
  "uniqueItems",
]);

function typeMatches(type: string, v: Json): boolean {
  if (type === "object") return isObject(v);
  if (type === "array") return Array.isArray(v);
  if (type === "integer") return Number.isSafeInteger(v);
  return typeof v === type;
}

export function schemaErrors(schema: JsonObject, root: JsonObject, v: Json, path = ""): string[] {
  for (const key of Object.keys(schema)) {
    if (!KNOWN.has(key)) throw new Error(`Unimplemented keyword ${key}`);
  }
  if (typeof schema["$ref"] === "string") {
    const name = schema["$ref"].replace("#/$defs/", "");
    return schemaErrors((root["$defs"] as JsonObject)[name] as JsonObject, root, v, path);
  }
  const out: string[] = [];
  if (typeof schema["type"] === "string" && !typeMatches(schema["type"], v))
    return [`${path}: type`];
  if ("const" in schema && schema["const"] !== v) out.push(`${path}: const`);
  if (
    typeof schema["pattern"] === "string" &&
    typeof v === "string" &&
    !new RegExp(schema["pattern"]).test(v)
  ) {
    out.push(`${path}: pattern`);
  }
  if (typeof schema["minimum"] === "number" && typeof v === "number" && v < schema["minimum"]) {
    out.push(`${path}: minimum`);
  }
  if (Array.isArray(v)) {
    if (
      schema["uniqueItems"] === true &&
      new Set(v.map((x) => JSON.stringify(x))).size !== v.length
    ) {
      out.push(`${path}: uniqueItems`);
    }
    if (isObject(schema["items"])) {
      v.forEach((x, i) =>
        out.push(...schemaErrors(schema["items"] as JsonObject, root, x, `${path}/${i}`)),
      );
    }
  }
  if (isObject(v)) {
    const props = isObject(schema["properties"]) ? schema["properties"] : {};
    for (const r of (schema["required"] as string[] | undefined) ?? []) {
      if (!Object.hasOwn(v, r)) out.push(`${path}/${r}: required`);
    }
    if (
      typeof schema["maxProperties"] === "number" &&
      Object.keys(v).length > schema["maxProperties"]
    ) {
      out.push(`${path}: maxProperties`);
    }
    for (const key of Object.keys(v)) {
      const child = `${path}/${key}`;
      if (isObject(schema["propertyNames"])) {
        out.push(...schemaErrors(schema["propertyNames"], root, key, `${child}#name`));
      }
      if (Object.hasOwn(props, key)) {
        out.push(...schemaErrors(props[key] as JsonObject, root, v[key] as Json, child));
      } else if (schema["additionalProperties"] === false) {
        out.push(`${child}: additionalProperties`);
      } else if (isObject(schema["additionalProperties"])) {
        out.push(...schemaErrors(schema["additionalProperties"], root, v[key] as Json, child));
      }
    }
  }
  return out;
}
