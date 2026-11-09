// Slider, number field and unit menu for lengths: type scale, spacing, radius, layout widths.
// The original text input stays in the form as a hidden field, so the submit is unchanged.
import { type Context, announceChange, el, fieldOf, t, uid } from "./dom.ts";
import { type Parts, controls, describedBy } from "./field.ts";
import { type Length, convertUnit, effectiveRange, formatLength, parseLength } from "./length.ts";
import { numberSlider } from "./slider.ts";

export function enhanceLength(ctx: Context, input: HTMLInputElement, parts: Parts): boolean {
  const field = fieldOf(ctx, parts.section, parts.key);
  const parsed = parseLength(input.value);
  if (field === null || parsed === null) return false;
  const start: Length =
    parsed.unit === "" ? { amount: parsed.amount, unit: field.defaultUnit } : parsed;
  if (!field.units.includes(start.unit)) return false;

  const originalId = input.id;
  const description = describedBy(input);
  const label = parts.label.textContent?.trim() ?? "";
  input.type = "hidden";
  input.id = uid(`${originalId}-value`);
  input.removeAttribute("aria-describedby");
  input.removeAttribute("aria-invalid");

  const unit = el("select", {
    class: "blixis-ctl-unit",
    "aria-label": t(ctx, "unitFor", label),
  });
  for (const name of field.units) unit.append(el("option", { value: name }, name));
  unit.value = start.unit;

  let current: Length = start;
  const widget = numberSlider({
    numberId: originalId,
    labelledBy: parts.label.id,
    describedBy: description,
    valueText: (value) => `${value} ${unit.value}`,
    extra: unit,
    onInput(value) {
      if (value === null) {
        input.value = "";
      } else {
        current = { amount: value, unit: unit.value };
        input.value = formatLength(current);
      }
      announceChange(input);
    },
  });
  widget.set(current.amount, effectiveRange(field, current));

  unit.addEventListener("change", () => {
    const amount =
      widget.number.value.trim() === "" ? null : Number.parseFloat(widget.number.value);
    const converted = convertUnit({ amount: amount ?? 0, unit: current.unit }, unit.value, field);
    current = converted;
    widget.set(converted.amount, effectiveRange(field, converted));
    input.value = formatLength(converted);
    announceChange(input);
  });

  widget.root.append(input);
  if (parts.control === null) parts.wrap.append(widget.root);
  else parts.control.replaceWith(widget.root);
  controls.set(input, {
    set(value) {
      const next = parseLength(value);
      if (next === null) return;
      const length = next.unit === "" ? { amount: next.amount, unit: field.defaultUnit } : next;
      if (!field.units.includes(length.unit)) return;
      current = length;
      unit.value = length.unit;
      widget.set(length.amount, effectiveRange(field, length));
      input.value = formatLength(length);
    },
  });
  return true;
}
