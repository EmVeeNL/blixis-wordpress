// Colour picker, format menu, editable text and contrast lines for colour fields.
import { toSrgb } from "@blixis/tokens";
import { checkPalette } from "./contrast.ts";
import {
  type ColorFormat,
  COLOR_FORMATS,
  convertColor,
  detectFormat,
  fromPicker,
  pickerHex,
} from "./colorformat.ts";
import { type Context, announceChange, el, t, uid } from "./dom.ts";
import { type Parts, controls } from "./field.ts";

const FORMAT_LABEL: Record<ColorFormat, string> = {
  hex: "formatHex",
  rgb: "formatRgb",
  hsl: "formatHsl",
  oklch: "formatOklch",
};

export type ColorField = {
  input: HTMLInputElement;
  key: string;
  contrast: HTMLElement;
};

export function ratioText(ratio: number): string {
  return (Math.floor(ratio * 100) / 100).toFixed(2);
}

export function enhanceColor(ctx: Context, input: HTMLInputElement, parts: Parts): ColorField {
  const label = parts.label.textContent?.trim() ?? "";
  const control = parts.control ?? parts.wrap;
  control.querySelector(".blixis-setup-swatch")?.remove();

  const picker = el("input", {
    type: "color",
    class: "blixis-ctl-picker",
    "aria-label": t(ctx, "pickFor", label),
  });
  const swatch = el("span", { class: "blixis-setup-swatch", "aria-hidden": "true" });
  const formatId = uid("blixis-format");
  const select = el("select", {
    id: formatId,
    class: "blixis-ctl-format-select",
    "aria-label": t(ctx, "formatFor", label),
  });
  for (const format of COLOR_FORMATS) {
    select.append(el("option", { value: format }, ctx.strings[FORMAT_LABEL[format]] ?? format));
  }
  const row = el(
    "div",
    { class: "blixis-ctl-format" },
    el("span", { "aria-hidden": "true" }, t(ctx, "format")),
    select,
  );
  const contrast = el("ul", { class: "blixis-ctl-contrast" });
  control.prepend(picker);
  control.append(swatch);
  control.after(row);
  row.after(contrast);

  const show = (): void => {
    const value = input.value.trim();
    const hex = pickerHex(value, ctx.map);
    if (hex !== null) picker.value = hex;
    const valid = toSrgb(value, ctx.map) !== null;
    swatch.style.backgroundColor = valid ? value : "";
    swatch.classList.toggle("is-empty", !valid);
    const format = detectFormat(value);
    if (format !== null) select.value = format;
  };
  show();

  input.addEventListener("input", show);
  picker.addEventListener("input", () => {
    const next = fromPicker(picker.value, input.value, select.value as ColorFormat, ctx.map);
    if (next === null) return;
    input.value = next;
    show();
    announceChange(input);
  });
  select.addEventListener("change", () => {
    const converted = convertColor(input.value, select.value as ColorFormat, ctx.map);
    if (converted === null) return;
    input.value = converted;
    show();
    announceChange(input);
  });
  controls.set(input, {
    set(value) {
      input.value = value;
      show();
    },
  });
  return { input, key: parts.key, contrast };
}

// Contrast lines for one palette (light or dark). With an empty dark palette there is nothing
// to check.
export function refreshContrast(
  ctx: Context,
  fields: readonly ColorField[],
  optional: boolean,
): void {
  const palette: Record<string, string> = {};
  for (const field of fields) palette[field.key] = field.input.value.trim();
  const empty = Object.values(palette).every((value) => value === "");
  for (const field of fields) field.contrast.replaceChildren();
  if (optional && empty) return;
  const surface = fields.find((field) => field.key === "surface");
  if (surface !== undefined) {
    surface.contrast.append(el("li", { class: "is-note" }, t(ctx, "contrastSurface")));
  }
  for (const result of checkPalette(palette, ctx.map)) {
    const field = fields.find((candidate) => candidate.key === result.key);
    if (field === undefined) continue;
    const kind = t(ctx, `contrastKind_${result.kind}`);
    let state: string;
    let text: string;
    if (result.ratio === null) {
      state = "is-note";
      text = t(ctx, "contrastInvalid", kind);
    } else if (result.pass) {
      state = "is-pass";
      text = t(ctx, "contrastPass", kind, ratioText(result.ratio));
    } else {
      state = "is-warn";
      text = t(ctx, "contrastWarn", kind, ratioText(result.ratio), result.required);
    }
    const icon = state === "is-pass" ? "✓" : state === "is-warn" ? "⚠" : "•";
    field.contrast.append(
      el(
        "li",
        { class: state },
        el("span", { class: "blixis-ctl-icon", "aria-hidden": "true" }, icon),
        el("span", {}, text),
      ),
    );
  }
}
