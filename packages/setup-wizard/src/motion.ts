// Motion: named speeds and easing presets with plain names.
export type Easing = { id: string; value: string };

export const EASINGS: readonly Easing[] = [
  { id: "smooth", value: "cubic-bezier(0.4, 0, 0.2, 1)" },
  { id: "gentle-start", value: "ease-in" },
  { id: "gentle-stop", value: "ease-out" },
  { id: "linear", value: "linear" },
  { id: "springy", value: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
];

export const SPEEDS = [
  { id: "fast", key: "durationFast" },
  { id: "normal", key: "durationBase" },
  { id: "slow", key: "durationSlow" },
] as const;

export function easingFor(value: string): Easing | null {
  return EASINGS.find((easing) => easing.value === value.trim()) ?? null;
}
