// Shadows: named presets, and a single-layer model for the Adjust panel.
import { clamp, formatNumber } from "./number.ts";
import { PX_PER_REM } from "./length.ts";

export type ShadowLayer = {
  inset: boolean;
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
};

export type ShadowPreset = { id: string; value: string };

// The preset values are plain contract values, so they pass the PHP validator unchanged.
export const SHADOW_PRESETS: readonly ShadowPreset[] = [
  { id: "none", value: "none" },
  { id: "subtle", value: "0 1px 2px 0 #0000001a" },
  { id: "soft", value: "0 4px 6px -1px #0000001a, 0 2px 4px -2px #0000001a" },
  { id: "medium", value: "0 10px 15px -3px #0000001a, 0 4px 6px -4px #0000001a" },
  { id: "strong", value: "0 20px 25px -5px #00000026, 0 8px 10px -6px #00000026" },
];

export function presetFor(value: string): ShadowPreset | null {
  return SHADOW_PRESETS.find((preset) => preset.value === value.trim()) ?? null;
}

// Splits a validated shadow into layers at ", " (outside colour functions, which use spaces
// and slashes but no commas in the contract syntax). Returns null for anything unreadable.
export function parseShadow(value: string): ShadowLayer[] | null {
  const text = value.trim();
  if (text === "none") return [];
  const layers: ShadowLayer[] = [];
  for (let part of text.split(", ")) {
    let inset = false;
    if (part.startsWith("inset ")) {
      inset = true;
      part = part.slice(6);
    }
    const tokens = part.split(" ");
    if (tokens.length < 5) return null;
    const lengths = tokens.slice(0, 4).map(toPxNumber);
    if (lengths.some((n) => n === null)) return null;
    const [x = 0, y = 0, blur = 0, spread = 0] = lengths as number[];
    layers.push({ inset, x, y, blur, spread, color: tokens.slice(4).join(" ") });
  }
  return layers;
}

function toPxNumber(token: string): number | null {
  const match = /^(-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?)(px|rem)?$/.exec(token);
  if (match === null) return null;
  const n = Number.parseFloat(match[1] ?? "");
  return match[2] === "rem" ? n * PX_PER_REM : n;
}

const px = (n: number): string => (n === 0 ? "0" : `${formatNumber(n, 3)}px`);

export function formatShadow(layers: readonly ShadowLayer[]): string {
  if (layers.length === 0) return "none";
  return layers
    .map(
      (l) =>
        `${l.inset ? "inset " : ""}${px(l.x)} ${px(l.y)} ${px(l.blur)} ${px(l.spread)} ${l.color}`,
    )
    .join(", ");
}

// A shadow colour is a hex colour with alpha: the colour from the picker and the opacity.
export function shadowColor(hex: string, opacity: number): string {
  const rgb = /^#([0-9a-f]{6})/i.exec(hex)?.[1] ?? "000000";
  const a = Math.round(clamp(opacity, 0, 1) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${rgb.toLowerCase()}${a}`;
}
