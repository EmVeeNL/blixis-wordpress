// Builds the layout contract v1 files that are derived rather than written by hand:
// layout-map.json (the contract copy and its two shipped copies) and the JSON Schema.
// Grammars are composed from named parts here so that a character class is defined once.
//
//   node scripts/layout-contract.ts           write the files
//   node scripts/layout-contract.ts --check   fail if a file differs (used by the tests)
//
// Run from packages/tokens. A changed output is a contract change: review it.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT_MAP = join(ROOT, "docs/contracts/layout/v1/layout-map.json");
const OUT_SCHEMA = join(ROOT, "docs/contracts/layout/v1/blixis-layout-config.schema.json");
const COPIES = [
  join(ROOT, "packages/tokens/src/layout-map.json"),
  join(ROOT, "plugins/blixis-blocks/inc/layout/layout-map.json"),
];

type Json = Record<string, unknown>;

// URL grammar. ASCII only: a non-ASCII character must be percent-encoded, so both validators
// agree without Unicode rules. The host is a list of DNS labels (an internationalized name is
// written in punycode), so there is no user information, no IP literal, and no backslash.
const URL_CHARS = String.raw`(?:%[0-9A-Fa-f]{2}|[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=])`;
const LABEL = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?";
const HOST = String.raw`${LABEL}(?:\.${LABEL})*`;
const AUTHORITY = `${HOST}(?::[0-9]{1,5})?(?:[/?#]${URL_CHARS}*)?`;

const grammars = {
  slug: "^[a-z][a-z0-9-]{0,62}$",
  // http(s) or a site-relative path. "//host" is not relative.
  url: `^(?:https?://${AUTHORITY}|/(?!/)${URL_CHARS}*)$`,
  urlHttps: `^https://${AUTHORITY}$`,
};

const enums = {
  layout: ["blank", "business", "portfolio", "blog", "landing"],
  logo: ["start", "center"],
  mobileMenu: ["mobile", "always"],
  service: [
    "facebook",
    "instagram",
    "linkedin",
    "x",
    "youtube",
    "tiktok",
    "mastodon",
    "bluesky",
    "github",
    "other",
  ],
};

const limits = {
  maxBytes: 32768,
  maxDepth: 8,
  urlLength: 2048,
  uspItems: 3,
  uspItemLength: 60,
  ctaTextLength: 30,
  contactLength: 200,
  copyrightLength: 120,
  socialItems: 6,
  columnsMin: 1,
  columnsMax: 4,
};

const errorCodes = [
  "config.invalid_json",
  "config.not_object",
  "config.too_deep",
  "config.too_large",
  "field.required",
  "field.unknown",
  "field.wrong_type",
  "footer.columns.invalid",
  "footer.social.service_invalid",
  "footer.social.too_many",
  "header.logo.invalid",
  "header.mobile_menu.invalid",
  "header.usp.empty",
  "header.usp.too_many",
  "layout.invalid",
  "schema.version_unsupported",
  "text.control_char",
  "text.empty",
  "text.markup",
  "text.placeholder_unknown",
  "text.too_long",
  "theme.slug.invalid",
  "url.empty",
  "url.invalid",
];

const defaults = {
  layout: "blank",
  header: {
    sticky: false,
    usp: { enabled: false, items: [] },
    logo: "start",
    cta: { enabled: false, text: "", url: "" },
    search: false,
    mobileMenu: "mobile",
  },
  footer: {
    stickToBottom: true,
    columns: 1,
    contact: "",
    social: [],
    copyright: { enabled: true, text: "© {year} {site}" },
    backToTop: false,
  },
};

const map: Json = {
  contractVersion: 1,
  limits,
  grammars,
  enums,
  placeholders: ["year", "site"],
  errorCodes,
  defaults,
};

// Text in the normalized form: trimmed (space and line feed), no control characters (a line
// feed only where the field is multi-line), no angle brackets. The validators trim first.
const BAD = String.raw`\u0000-\u0009\u000B-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF<>`;
const BAD_SINGLE = String.raw`\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF<>`;
const trimmed = (bad: string): string => `^(?:(?![ \\n])[^${bad}]*(?<![ \\n]))?$`;
const PLACEHOLDERS = String.raw`^(?:[^{}]|\{year\}|\{site\})*$`;

function text(min: number, max: number, multiline = false): Json {
  return {
    type: "string",
    minLength: min,
    maxLength: max,
    pattern: trimmed(multiline ? BAD : BAD_SINGLE),
  };
}
const bool: Json = { type: "boolean" };
const closed = (properties: Json, required: string[] = Object.keys(properties)): Json => ({
  type: "object",
  additionalProperties: false,
  required,
  properties,
});
const when = (enabled: Json): Json => ({
  if: { properties: { enabled: { const: true } }, required: ["enabled"] },
  then: enabled, // oxlint-disable-line unicorn/no-thenable
});

function schema(): Json {
  const cta = closed({
    enabled: bool,
    text: text(0, limits.ctaTextLength),
    url: { type: "string", maxLength: limits.urlLength, pattern: `${grammars.url}|^$` },
  });
  Object.assign(cta, {
    ...when({
      properties: {
        text: { minLength: 1 },
        url: { minLength: 1 },
      },
    }),
  });
  const usp = closed({
    enabled: bool,
    items: {
      type: "array",
      maxItems: limits.uspItems,
      items: text(1, limits.uspItemLength),
    },
  });
  Object.assign(usp, when({ properties: { items: { minItems: 1 } } }));
  const copyright = closed({
    enabled: bool,
    text: {
      allOf: [text(0, limits.copyrightLength), { pattern: PLACEHOLDERS }],
    },
  });
  Object.assign(copyright, when({ properties: { text: { minLength: 1 } } }));
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://blixis.invalid/contracts/layout/v1/blixis-layout-config.schema.json",
    title: "BlixisLayoutConfig v1",
    description:
      "Generated from layout-map.json by packages/tokens/scripts/layout-contract.ts. Patterns use ECMA-262 semantics; a PCRE implementation must add the D modifier, or $ accepts a trailing newline. The schema describes the normalized form: the validators trim a text value (space and line feed) before they check it, and a CTA url may be empty only while the CTA is off. Length counts Unicode code points.",
    ...closed({
      schemaVersion: { const: 1 },
      theme: closed({ slug: { type: "string", pattern: grammars.slug } }),
      layout: { enum: enums.layout },
      header: closed({
        sticky: bool,
        usp,
        logo: { enum: enums.logo },
        cta,
        search: bool,
        mobileMenu: { enum: enums.mobileMenu },
      }),
      footer: closed({
        stickToBottom: bool,
        columns: { type: "integer", minimum: limits.columnsMin, maximum: limits.columnsMax },
        contact: text(0, limits.contactLength, true),
        social: {
          type: "array",
          maxItems: limits.socialItems,
          items: closed({
            service: { enum: enums.service },
            url: { type: "string", maxLength: limits.urlLength, pattern: grammars.urlHttps },
          }),
        },
        copyright,
        backToTop: bool,
      }),
    }),
  };
}

const outputs: [string, string][] = [
  [OUT_SCHEMA, `${JSON.stringify(schema(), null, 2)}\n`],
  [OUT_MAP, `${JSON.stringify(map, null, 2)}\n`],
  ...COPIES.map((copy): [string, string] => [copy, `${JSON.stringify(map, null, 2)}\n`]),
];

if (process.argv.includes("--check")) {
  const stale = outputs.filter(([path, body]) => {
    try {
      return readFileSync(path, "utf8") !== body;
    } catch {
      return true;
    }
  });
  if (stale.length > 0) {
    console.error(`stale: ${stale.map(([path]) => path).join(", ")}`);
    process.exit(1);
  }
} else {
  for (const [path, body] of outputs) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, body);
  }
}
