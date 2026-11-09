// A labelled range slider with a linked number field. Native input type=range gives Arrow,
// Page Up/Down, Home and End; the number field gives exact entry.
import type { SliderRange } from "@blixis/tokens";
import { el } from "./dom.ts";
import { formatNumber } from "./number.ts";

export type NumberSlider = {
  root: HTMLElement;
  slider: HTMLInputElement;
  number: HTMLInputElement;
  // Shows a value and range without raising events.
  set: (value: number | null, range: SliderRange) => void;
};

function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : Math.min(6, text.length - dot - 1);
}

export function numberSlider(options: {
  numberId: string;
  labelledBy: string;
  describedBy?: string | undefined;
  valueText: (value: number) => string;
  onInput: (value: number | null, source: "slider" | "number") => void;
  extra?: HTMLElement | undefined;
}): NumberSlider {
  const slider = el("input", {
    type: "range",
    class: "blixis-range blixis-ctl-range",
    "aria-labelledby": options.labelledBy,
    "aria-describedby": options.describedBy,
  });
  const number = el("input", {
    type: "number",
    id: options.numberId,
    class: "blixis-group__value blixis-ctl-number",
    inputmode: "decimal",
    dir: "ltr",
    autocomplete: "off",
    "aria-describedby": options.describedBy,
  });
  const group = el("div", { class: "blixis-group blixis-group--narrow" }, number);
  if (options.extra !== undefined) group.append(options.extra);
  const root = el("div", { class: "blixis-ctl-slider" }, slider, group);
  // The filled part of the track, up to the thumb (Chromium and Safari; Firefox has its own).
  const fill = (): void => {
    const min = Number.parseFloat(slider.min);
    const max = Number.parseFloat(slider.max);
    const value = Number.parseFloat(slider.value);
    const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
    slider.style.setProperty("--blixis-range-pct", `${Math.min(100, Math.max(0, pct))}%`);
  };
  let decimals = 0;

  const announce = (value: number): void => {
    slider.setAttribute("aria-valuetext", options.valueText(value));
  };
  slider.addEventListener("input", () => {
    const value = Number.parseFloat(slider.value);
    number.value = formatNumber(value, decimals);
    fill();
    announce(value);
    options.onInput(value, "slider");
  });
  number.addEventListener("input", () => {
    const value = number.value.trim() === "" ? null : Number.parseFloat(number.value);
    const usable = value !== null && Number.isFinite(value) ? value : null;
    if (usable !== null) {
      slider.value = String(usable);
      fill();
      announce(usable);
    }
    options.onInput(usable, "number");
  });

  return {
    root,
    slider,
    number,
    set(value, range) {
      decimals = decimalsOf(range.step);
      for (const input of [slider, number]) {
        input.min = String(range.min);
        input.max = String(range.max);
      }
      slider.step = String(range.step);
      // A stored value off the step grid would make the number field invalid; "any" accepts it.
      const onGrid =
        value === null ||
        Math.abs((value - range.min) / range.step - Math.round((value - range.min) / range.step)) <
          1e-6;
      number.step = onGrid ? String(range.step) : "any";
      if (value !== null) {
        slider.value = String(value);
        number.value = formatNumber(value, Math.max(decimals, 4));
        announce(value);
      }
      fill();
    },
  };
}
