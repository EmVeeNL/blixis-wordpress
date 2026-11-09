// Colour formats for the picker: detect, convert between hex, RGB, HSL and OKLCH in the
// contract's space-separated syntax, and give the opaque hex the native colour input needs.
import { type TokenMap, tokenMap, toSrgb, type Srgb } from "@blixis/tokens";
import { clamp, formatNumber } from "./number.ts";

export type ColorFormat = "hex" | "rgb" | "hsl" | "oklch";
export const COLOR_FORMATS: readonly ColorFormat[] = ["hex", "rgb", "hsl", "oklch"];

export function detectFormat(value: string): ColorFormat | null {
  const text = value.trim();
  if (text.startsWith("#")) return "hex";
  const name = /^(rgb|hsl|oklch)\(/.exec(text)?.[1];
  return name === "rgb" || name === "hsl" || name === "oklch" ? name : null;
}

const hex2 = (v: number): string =>
  Math.round(clamp(v, 0, 1) * 255)
    .toString(16)
    .padStart(2, "0");

function alphaPart(alpha: number): string {
  return alpha >= 1 ? "" : ` / ${formatNumber(alpha, 4)}`;
}

function toHsl([r, g, b]: Srgb): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-9) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, clamp(s, 0, 1), l];
}

const linearize = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

// Inverse of the OKLab transform in @blixis/tokens (Björn Ottosson's matrices).
function toOklch([r, g, b]: Srgb): [number, number, number] {
  const lr = linearize(r);
  const lg = linearize(g);
  const lb = linearize(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.hypot(a, bb);
  const hue = chroma < 1e-4 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return [lightness, chroma, hue];
}

// Writes a gamma-encoded sRGB colour in the given format.
export function formatSrgb(rgb: Srgb, format: ColorFormat): string {
  const [r, g, b, alpha] = rgb;
  if (format === "hex") {
    return `#${hex2(r)}${hex2(g)}${hex2(b)}${alpha >= 1 ? "" : hex2(alpha)}`;
  }
  if (format === "rgb") {
    const c = [r, g, b].map((v) => String(Math.round(clamp(v, 0, 1) * 255)));
    return `rgb(${c.join(" ")}${alphaPart(alpha)})`;
  }
  if (format === "hsl") {
    const [h, s, l] = toHsl([r, g, b, alpha]);
    return `hsl(${formatNumber(h, 1)} ${formatNumber(s * 100, 1)}% ${formatNumber(l * 100, 1)}%${alphaPart(alpha)})`;
  }
  const [lightness, chroma, hue] = toOklch([r, g, b, alpha]);
  return `oklch(${formatNumber(clamp(lightness, 0, 1), 4)} ${formatNumber(chroma, 4)} ${formatNumber(hue, 2)}${alphaPart(alpha)})`;
}

// Converts a valid colour to another format; null when the input is not a valid colour.
// OKLCH colours outside sRGB are clipped (hex, RGB and HSL cannot hold them).
export function convertColor(
  value: string,
  format: ColorFormat,
  map: TokenMap = tokenMap,
): string | null {
  const rgb = toSrgb(value.trim(), map);
  return rgb === null ? null : formatSrgb(rgb, format);
}

// The opaque #rrggbb a native colour input shows for any valid colour, or null.
export function pickerHex(value: string, map: TokenMap = tokenMap): string | null {
  const rgb = toSrgb(value.trim(), map);
  return rgb === null ? null : `#${hex2(rgb[0])}${hex2(rgb[1])}${hex2(rgb[2])}`;
}

// A colour chosen in the native input, written in the field's current format. The picker is
// opaque; a transparency in the current value is kept.
export function fromPicker(
  hex: string,
  current: string,
  format: ColorFormat,
  map: TokenMap = tokenMap,
): string | null {
  const picked = toSrgb(hex, map);
  if (picked === null) return null;
  const previous = toSrgb(current.trim(), map);
  const alpha = previous === null ? 1 : previous[3];
  return formatSrgb([picked[0], picked[1], picked[2], alpha], format);
}
