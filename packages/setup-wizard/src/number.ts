// Number formatting shared by the controls. Output must match the contract grammars:
// no exponent, no sign on zero, no leading zeros, at most `decimals` decimal places.
export function formatNumber(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Number(value.toFixed(decimals));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Snaps to the step grid that starts at min, without float drift (0.0625 steps are exact).
export function snap(value: number, min: number, step: number): number {
  if (step <= 0) return value;
  const snapped = min + Math.round((value - min) / step) * step;
  return Number(snapped.toFixed(6));
}
