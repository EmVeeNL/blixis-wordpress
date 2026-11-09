// Contrast checks for a palette. Thresholds follow WCAG 2.2: 4.5:1 for text, links and
// buttons, 3:1 for large text and interface parts.
import { type TokenMap, contrastRatio, tokenMap } from "@blixis/tokens";

export type Check = {
  // The colour the check is shown next to.
  key: string;
  // "text" needs 4.5:1; "ui" needs 3:1.
  kind: "text" | "link" | "button" | "ui";
  foreground: string;
  background: string;
};

export type Result = Check & { ratio: number | null; required: number; pass: boolean };

export const REQUIRED: Record<Check["kind"], number> = { text: 4.5, link: 4.5, button: 4.5, ui: 3 };

// Which pair each colour is checked as. Surface is the background everything is checked on;
// the primary colour is both a link on the surface and a button with surface-coloured text.
export const CHECKS: readonly Check[] = [
  { key: "foreground", kind: "text", foreground: "foreground", background: "surface" },
  { key: "muted", kind: "text", foreground: "muted", background: "surface" },
  { key: "primary", kind: "link", foreground: "primary", background: "surface" },
  { key: "primary", kind: "button", foreground: "surface", background: "primary" },
  { key: "accent", kind: "ui", foreground: "accent", background: "surface" },
];

export function checkPalette(palette: Record<string, string>, map: TokenMap = tokenMap): Result[] {
  return CHECKS.map((check) => {
    const fg = palette[check.foreground] ?? "";
    const bg = palette[check.background] ?? "";
    const ratio = fg === "" || bg === "" ? null : contrastRatio(fg, bg, map);
    const required = REQUIRED[check.kind];
    return { ...check, ratio, required, pass: ratio !== null && ratio >= required };
  });
}
