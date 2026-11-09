// Colour parsing and contrast for token contract v2 (task 03-06). The PHP twin is
// plugins/blixis-blocks/inc/tokens/color.php; both must give the same results.
// Understands hex, rgb(), hsl() and oklch() in the contract's modern space-separated syntax.
import { type TokenMap, tokenMap } from "./token-map.ts";

export type ParsedColor = {
  space: "rgb" | "hsl" | "oklch";
  c: [number, number, number];
  alpha: number;
};
export type Srgb = [number, number, number, number];
type Range = { min: number; max: number };

const HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
const FUNCTION = /^(rgb|hsl|oklch)\((.*)\)$/;

// A percentage p becomes p / 100 * full; a plain number is returned as is.
function component(
  text: string,
  number: Range | null,
  percent: Range | null,
  full: number,
): number | null {
  if (text.endsWith("%")) {
    if (percent === null) return null;
    const v = Number.parseFloat(text.slice(0, -1));
    return v < percent.min || v > percent.max ? null : (v / 100) * full;
  }
  if (number === null) return null;
  const v = Number.parseFloat(text);
  return v < number.min || v > number.max ? null : v;
}

// Parses a colour that matched the contract grammar and checks component ranges.
// Returns null when malformed or out of range.
export function parseColor(value: string, map: TokenMap = tokenMap): ParsedColor | null {
  const hex = HEX.exec(value);
  if (hex !== null) {
    let digits = hex[1] ?? "";
    if (digits.length === 3) {
      const [r = "", g = "", b = ""] = digits;
      digits = `${r}${r}${g}${g}${b}${b}`;
    }
    const channel = (at: number): number => Number.parseInt(digits.slice(at, at + 2), 16);
    return {
      space: "rgb",
      c: [channel(0), channel(2), channel(4)],
      alpha: digits.length === 8 ? channel(6) / 255 : 1,
    };
  }
  const match = FUNCTION.exec(value);
  if (match === null) return null;
  const space = match[1] as "rgb" | "hsl" | "oklch";
  const ranges = map.colorRanges;
  const parts = (match[2] ?? "").split(" / ");
  if (parts.length > 2) return null;
  const comps = (parts[0] ?? "").split(" ");
  if (comps.length !== 3) return null;
  let alpha = 1;
  if (parts[1] !== undefined) {
    const a = component(parts[1], ranges.alphaNumber, ranges.percent, 1);
    if (a === null) return null;
    alpha = a;
  }
  const [x = "", y = "", z = ""] = comps;
  if (space === "rgb") {
    const out = [x, y, z].map((item) => component(item, ranges.rgbNumber, ranges.percent, 255));
    if (out.includes(null)) return null;
    return { space, c: out as [number, number, number], alpha };
  }
  if (space === "hsl") {
    const h = component(x, ranges.hue, null, 1);
    const s = component(y, null, ranges.percent, 1);
    const l = component(z, null, ranges.percent, 1);
    if (h === null || s === null || l === null) return null;
    return { space, c: [h, s, l], alpha };
  }
  const lightness = component(x, ranges.oklchLightness, ranges.percent, 1);
  const chroma = component(y, ranges.oklchChroma, null, 1);
  const hue = component(z, ranges.hue, null, 1);
  if (lightness === null || chroma === null || hue === null) return null;
  return { space, c: [lightness, chroma, hue], alpha };
}

export function isColor(value: string, map: TokenMap = tokenMap): boolean {
  return new RegExp(map.grammars["color"] ?? "^$").test(value) && parseColor(value, map) !== null;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// Gamma-encoded sRGB in [0, 1] plus alpha. oklch outside the sRGB gamut is clipped
// per channel in linear light.
export function toSrgb(value: string, map: TokenMap = tokenMap): Srgb | null {
  const p = parseColor(value, map);
  if (p === null) return null;
  const [c0, c1, c2] = p.c;
  if (p.space === "rgb") return [c0 / 255, c1 / 255, c2 / 255, p.alpha];
  if (p.space === "hsl") {
    const k = c1 * Math.min(c2, 1 - c2);
    const f = (n: number): number => {
      const x = (n + c0 / 30) % 12;
      return c2 - k * Math.max(-1, Math.min(x - 3, 9 - x, 1));
    };
    return [clamp01(f(0)), clamp01(f(8)), clamp01(f(4)), p.alpha];
  }
  const rad = (c2 * Math.PI) / 180;
  const a = c1 * Math.cos(rad);
  const b = c1 * Math.sin(rad);
  const l = (c0 + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (c0 - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (c0 - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => {
    const clipped = clamp01(v);
    return clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055;
  });
  return [linear[0] ?? 0, linear[1] ?? 0, linear[2] ?? 0, p.alpha];
}

// WCAG relative luminance of opaque gamma-encoded sRGB.
export function relativeLuminance(rgb: readonly [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG contrast ratio, 1 to 21. A translucent background is composited over white, then a
// translucent foreground over that, in gamma-encoded sRGB as browsers do. Null when a
// colour is invalid.
export function contrastRatio(
  foreground: string,
  background: string,
  map: TokenMap = tokenMap,
): number | null {
  const fg = toSrgb(foreground, map);
  const bg = toSrgb(background, map);
  if (fg === null || bg === null) return null;
  const base = [0, 1, 2].map((i) => bg[3] * (bg[i] ?? 0) + (1 - bg[3]) * 1) as [
    number,
    number,
    number,
  ];
  const top = [0, 1, 2].map((i) => fg[3] * (fg[i] ?? 0) + (1 - fg[3]) * (base[i] ?? 0)) as [
    number,
    number,
    number,
  ];
  const l1 = relativeLuminance(top);
  const l2 = relativeLuminance(base);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Colours inside a validated shadow value.
export function shadowColors(shadow: string): string[] {
  if (shadow === "none") return [];
  const out: string[] = [];
  for (let layer of shadow.split(", ")) {
    if (layer.startsWith("inset ")) layer = layer.slice(6);
    const tokens = layer.split(" ");
    if (tokens.length >= 5) out.push(tokens.slice(4).join(" "));
  }
  return out;
}
