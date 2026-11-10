// The layout config a Header and footer form describes, and where a validator error belongs.
// Pure functions over form values, so node tests cover them without a DOM. The PHP validator
// stays authoritative; this only drives inline errors and the live preview.
import { type LayoutConfig, type LayoutError, validateLayoutBytes } from "@blixis/tokens";

export type LayoutValues = ReadonlyMap<string, string>;

export type BuiltLayout = {
  config: LayoutConfig;
  // Index in the config's list -> index of the row the user typed in.
  uspMap: number[];
  socialMap: number[];
};

// Rows past this are ignored, as on the server.
const MAX_ROWS = 20;

const USP = /^layout\[header\]\[usp\]\[items\]\[(\d+)\]$/;
const SOCIAL = /^layout\[footer\]\[social\]\[(\d+)\]\[(service|url)\]$/;

// Spaces and line feeds at both ends, nothing else: the same trim as the contract.
export function trimText(value: string): string {
  return value.replace(/^[ \n]+|[ \n]+$/g, "");
}

// PHP's trim(): what the server removes from a URL before validating it.
export function trimUrl(value: string): string {
  const space = " \t\n\r\0\v";
  let start = 0;
  let end = value.length;
  while (start < end && space.includes(value.charAt(start))) start += 1;
  while (end > start && space.includes(value.charAt(end - 1))) end -= 1;
  return value.slice(start, end);
}

// One entry per form field. A checkbox that is off is absent, as in a submitted form.
export function valuesOf(entries: Iterable<[string, FormDataEntryValue]>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, value] of entries) {
    if (name.startsWith("layout[") && typeof value === "string") out.set(name, value);
  }
  return out;
}

export function buildLayout(values: LayoutValues, base: LayoutConfig): BuiltLayout {
  const get = (name: string): string => values.get(name) ?? "";
  const on = (name: string): boolean => values.get(name) === "1";

  const uspRows: { index: number; text: string }[] = [];
  const socialRows = new Map<number, { service: string; url: string }>();
  for (const [name, value] of values) {
    const usp = USP.exec(name);
    if (usp !== null) {
      uspRows.push({ index: Number.parseInt(usp[1] ?? "0", 10), text: value });
      continue;
    }
    const social = SOCIAL.exec(name);
    if (social !== null) {
      const index = Number.parseInt(social[1] ?? "0", 10);
      const row = socialRows.get(index) ?? { service: "", url: "" };
      if (social[2] === "service") row.service = value;
      else row.url = value;
      socialRows.set(index, row);
    }
  }
  uspRows.sort((a, b) => a.index - b.index);

  const items: string[] = [];
  const uspMap: number[] = [];
  for (const row of uspRows.slice(0, MAX_ROWS)) {
    if (trimText(row.text) !== "") {
      items.push(row.text);
      uspMap.push(row.index);
    }
  }
  const social: { service: string; url: string }[] = [];
  const socialMap: number[] = [];
  for (const index of [...socialRows.keys()].sort((a, b) => a - b).slice(0, MAX_ROWS)) {
    const row = socialRows.get(index);
    // The contract does not trim URLs, so the form does.
    const url = trimUrl(row?.url ?? "");
    if (url !== "") {
      social.push({ service: row?.service ?? "", url });
      socialMap.push(index);
    }
  }
  const columns = get("layout[footer][columns]");

  const config: LayoutConfig = {
    schemaVersion: base["schemaVersion"],
    theme: base["theme"],
    layout: base["layout"],
    header: {
      sticky: on("layout[header][sticky]"),
      usp: { enabled: on("layout[header][usp][enabled]"), items },
      logo: get("layout[header][logo]"),
      cta: {
        enabled: on("layout[header][cta][enabled]"),
        text: get("layout[header][cta][text]"),
        url: trimUrl(get("layout[header][cta][url]")),
      },
      search: on("layout[header][search]"),
      mobileMenu: get("layout[header][mobileMenu]"),
    },
    footer: {
      stickToBottom: on("layout[footer][stickToBottom]"),
      columns: /^\d{1,3}$/.test(columns) ? Number.parseInt(columns, 10) : columns,
      contact: get("layout[footer][contact]").replaceAll("\r\n", "\n"),
      social,
      copyright: {
        enabled: on("layout[footer][copyright][enabled]"),
        text: get("layout[footer][copyright][text]"),
      },
      backToTop: on("layout[footer][backToTop]"),
    },
  };
  return { config, uspMap, socialMap };
}

// Errors on the rows the user typed in, not on the compacted lists.
export function remapErrors(errors: LayoutError[], built: BuiltLayout): LayoutError[] {
  return errors.map((error) => {
    const usp = /^\/header\/usp\/items\/(\d+)$/.exec(error.path);
    if (usp !== null) {
      const at = Number.parseInt(usp[1] ?? "0", 10);
      return { code: error.code, path: `/header/usp/items/${built.uspMap[at] ?? at}` };
    }
    const social = /^\/footer\/social\/(\d+)\/(service|url)$/.exec(error.path);
    if (social !== null) {
      const at = Number.parseInt(social[1] ?? "0", 10);
      return { code: error.code, path: `/footer/social/${built.socialMap[at] ?? at}/${social[2]}` };
    }
    return error;
  });
}

// The same id the server gives a field for a contract path (PHP field_id()).
export function fieldIdFor(path: string): string {
  return `blixis${path.replaceAll("/", "-").toLowerCase()}`;
}

export function checkLayout(
  values: LayoutValues,
  base: LayoutConfig,
): { built: BuiltLayout; errors: LayoutError[] } {
  const built = buildLayout(values, base);
  const bytes = new TextEncoder().encode(JSON.stringify(built.config));
  const result = validateLayoutBytes(bytes);
  return { built, errors: result.ok ? [] : remapErrors(result.errors, built) };
}
