// Small DOM helpers. Text always goes in with textContent, never innerHTML.
import type { Config, Field, TokenMap } from "@blixis/tokens";

export type Context = {
  map: TokenMap;
  // Translated strings from the page.
  strings: Record<string, string>;
  // The configuration the page was rendered from (the user's draft).
  base: Config;
  form: HTMLFormElement;
  step: string;
};

let counter = 0;
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

type Attrs = Record<string, string | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children) node.append(child);
  return node;
}

// %s, %1$s, %2$s placeholders, as in the PHP translations.
export function format(template: string, ...args: (string | number)[]): string {
  let next = 0;
  return template.replace(/%(?:(\d+)\$)?[sd]/g, (_match, position: string | undefined) => {
    const index = position === undefined ? next++ : Number.parseInt(position, 10) - 1;
    return String(args[index] ?? "");
  });
}

export function t(ctx: Context, key: string, ...args: (string | number)[]): string {
  return format(ctx.strings[key] ?? key, ...args);
}

let dispatching = false;

// Tells the form (and the live previews listening on it) that a script changed a value.
export function announceChange(input: HTMLInputElement | HTMLSelectElement): void {
  dispatching = true;
  try {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  } finally {
    dispatching = false;
  }
}

// True while a control's own change is travelling to the form, so listeners can tell it from
// the user typing in the field itself.
export function isInternalChange(): boolean {
  return dispatching;
}

export function fieldOf(ctx: Context, section: string, key: string): Field | null {
  return ctx.map.fields[section]?.[key] ?? null;
}

export function labelText(input: HTMLElement): string {
  const id = input.getAttribute("id");
  const label = id === null ? null : document.querySelector(`label[for="${CSS.escape(id)}"]`);
  return label?.textContent?.trim() ?? input.getAttribute("name") ?? "";
}

export const prefersReducedMotion = (): MediaQueryList =>
  window.matchMedia("(prefers-reduced-motion: reduce)");

// A switch: a native checkbox with role="switch", labelled by the text beside it.
export function makeSwitch(
  text: string,
  checked: boolean,
): { root: HTMLLabelElement; input: HTMLInputElement } {
  const input = el("input", { type: "checkbox", role: "switch", id: uid("blixis-switch") });
  input.checked = checked;
  const root = el("label", { class: "blixis-switch", for: input.id }, input, el("span", {}, text));
  return { root, input };
}
