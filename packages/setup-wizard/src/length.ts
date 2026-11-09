// Lengths such as 1.5rem: parsing, unit conversion and slider ranges from the token map.
import type { Field, SliderRange } from "@blixis/tokens";
import { clamp, formatNumber, snap } from "./number.ts";

export type Length = { amount: number; unit: string };

const LENGTH = /^(-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?)(rem|px|em|%|ch|vw|ms)?$/;

// Root font size used to move between absolute (px) and font-relative (rem, em) units.
export const PX_PER_REM = 16;

export function parseLength(value: string): Length | null {
  const match = LENGTH.exec(value.trim());
  if (match === null) return null;
  const amount = Number.parseFloat(match[1] ?? "");
  if (!Number.isFinite(amount)) return null;
  return { amount, unit: match[2] ?? "" };
}

export function formatLength(length: Length): string {
  return `${formatNumber(length.amount, 4)}${length.unit}`;
}

const FONT_RELATIVE = new Set(["rem", "em"]);

// Size in px for units that have a fixed relation to the root font size; null otherwise.
export function toPx(length: Length): number | null {
  if (length.unit === "px") return length.amount;
  if (FONT_RELATIVE.has(length.unit)) return length.amount * PX_PER_REM;
  return null;
}

export function rangeOf(field: Field, unit: string): SliderRange | null {
  return field.ranges[unit] ?? null;
}

// The slider range for a value: the contract range, widened when a stored value lies outside
// it, so the control never hides a legal value.
export function effectiveRange(field: Field, length: Length): SliderRange {
  const base = rangeOf(field, length.unit) ?? { min: 0, max: 100, step: 1 };
  return {
    min: Math.min(base.min, length.amount),
    max: Math.max(base.max, length.amount),
    step: base.step,
  };
}

// Changes the unit and keeps the size: rem, em and px convert at 16 px per rem; units without a
// fixed relation (%, ch, vw) keep the value's relative position in the new range.
export function convertUnit(length: Length, unit: string, field: Field): Length {
  if (length.unit === unit) return length;
  const target = rangeOf(field, unit);
  if (target === null) return { amount: length.amount, unit };
  const px = toPx(length);
  let amount: number;
  if (px !== null && (unit === "px" || FONT_RELATIVE.has(unit))) {
    amount = unit === "px" ? px : px / PX_PER_REM;
  } else {
    const source = rangeOf(field, length.unit);
    const fraction =
      source === null || source.max === source.min
        ? 0
        : (length.amount - source.min) / (source.max - source.min);
    amount = target.min + clamp(fraction, 0, 1) * (target.max - target.min);
  }
  return { amount: snap(clamp(amount, target.min, target.max), target.min, target.step), unit };
}

// Scales a size by a factor, staying inside the unit's range and on its step grid.
export function scaleLength(length: Length, factor: number, field: Field): Length {
  const range = rangeOf(field, length.unit);
  const scaled = length.amount * factor;
  if (range === null) return { amount: scaled, unit: length.unit };
  return {
    amount: snap(clamp(scaled, range.min, range.max), range.min, range.step),
    unit: length.unit,
  };
}

// "Keep proportions": when the base size moves from `before` to `after`, every other size is
// scaled by the same ratio. The ratio is taken in px, so changing only the unit of the base
// size (1rem to 16px) leaves the others alone. Sizes that cannot be read are left as they are.
export function scaleScale(
  values: Record<string, string>,
  baseKey: string,
  before: string,
  after: string,
  fields: Record<string, Field>,
): Record<string, string> {
  const from = parseLength(before);
  const to = parseLength(after);
  const fromPx = from === null ? null : toPx(from);
  const toPxValue = to === null ? null : toPx(to);
  if (fromPx === null || toPxValue === null || fromPx <= 0 || toPxValue < 0) return { ...values };
  const factor = toPxValue / fromPx;
  const out: Record<string, string> = { ...values };
  for (const [key, value] of Object.entries(values)) {
    const field = fields[key];
    const length = parseLength(value);
    if (key === baseKey || field === undefined || length === null) continue;
    out[key] = formatLength(scaleLength(length, factor, field));
  }
  out[baseKey] = after;
  return out;
}
