// Shadow presets as cards, an Adjust panel with sliders, and the raw CSS behind Edit as CSS.
import { toSrgb } from "@blixis/tokens";
import { pickerHex } from "./colorformat.ts";
import { type Context, announceChange, el, isInternalChange, t, uid } from "./dom.ts";
import { type Parts, controls } from "./field.ts";
import { formatNumber } from "./number.ts";
import { type NumberSlider, numberSlider } from "./slider.ts";
import {
  SHADOW_PRESETS,
  type ShadowLayer,
  formatShadow,
  parseShadow,
  presetFor,
  shadowColor,
} from "./shadow.ts";

const START: ShadowLayer = { inset: false, x: 0, y: 1, blur: 2, spread: 0, color: "#0000001a" };

// The raw text input moves behind a disclosure; the visible label keeps naming it. The
// disclosure and the controls go where the input's row was.
export function rawDetails(ctx: Context, control: HTMLElement): HTMLDetailsElement {
  const details = el(
    "details",
    { class: "blixis-ctl-details" },
    el("summary", {}, t(ctx, "editCss")),
  );
  details.append(control);
  return details;
}

export function enhanceShadow(ctx: Context, input: HTMLInputElement, parts: Parts): void {
  const limits = ctx.map.shadowControls;
  const offset = limits["offset"];
  const blur = limits["blur"];
  const spread = limits["spread"];
  const opacity = limits["opacity"];
  if (offset === undefined || blur === undefined || spread === undefined || opacity === undefined)
    return;

  const group = uid("blixis-shadow");
  const cards = el("div", {
    class: "blixis-ctl-cards",
    role: "radiogroup",
    "aria-labelledby": parts.label.id,
  });
  const radios = new Map<string, HTMLInputElement>();
  for (const preset of SHADOW_PRESETS) {
    const radio = el("input", { type: "radio", name: group, value: preset.id });
    radios.set(preset.id, radio);
    cards.append(
      el(
        "label",
        { class: "blixis-card" },
        radio,
        el("span", {
          class: "blixis-card-sample",
          "aria-hidden": "true",
          style: `box-shadow:${preset.value}`,
        }),
        el("span", { class: "blixis-card-name" }, t(ctx, `shadowPreset_${preset.id}`)),
      ),
    );
  }
  const status = el("p", { class: "blixis-ctl-status" });

  // Adjust panel.
  let layer: ShadowLayer = { ...START };
  let rest: ShadowLayer[] = [];
  const rows = el("div", { class: "blixis-ctl-rows" });
  const note = el("p", { class: "blixis-setup-hint" });

  const sliders = new Map<string, NumberSlider>();
  const slider = (key: string): NumberSlider => {
    const found = sliders.get(key);
    if (found === undefined) throw new Error(`No slider ${key}`);
    return found;
  };
  const writeColor = (): void => {
    const percent = Number.parseFloat(slider("opacity").number.value);
    layer = {
      ...layer,
      color: shadowColor(colorInput.value, (Number.isFinite(percent) ? percent : 10) / 100),
    };
  };
  const commit = (): void => {
    input.value = formatShadow([layer, ...rest]);
    announceChange(input);
  };
  const colorInput = el("input", {
    type: "color",
    class: "blixis-ctl-picker",
    id: uid("blixis-shadow-color"),
  });
  const addRow = (
    key: "x" | "y" | "blur" | "spread" | "opacity",
    name: string,
    range: { min: number; max: number; step: number },
    unit: string,
    scale: number,
  ): void => {
    const labelId = uid("blixis-shadow-label");
    const numberId = uid("blixis-shadow-number");
    const widget = numberSlider({
      numberId,
      labelledBy: labelId,
      valueText: (value) => `${value}${unit}`,
      extra: el("span", { class: "blixis-ctl-unit-text", "aria-hidden": "true" }, unit),
      onInput(value) {
        if (value === null) return;
        if (key === "opacity") {
          writeColor();
        } else {
          layer = { ...layer, [key]: value };
        }
        commit();
      },
    });
    widget.set(null, { min: range.min * scale, max: range.max * scale, step: range.step * scale });
    sliders.set(key, widget);
    rows.append(
      el(
        "div",
        { class: "blixis-ctl-row" },
        el("label", { id: labelId, for: numberId }, name),
        widget.root,
      ),
    );
  };
  addRow("x", t(ctx, "shadowX"), offset, "px", 1);
  addRow("y", t(ctx, "shadowY"), offset, "px", 1);
  addRow("blur", t(ctx, "shadowBlur"), blur, "px", 1);
  addRow("spread", t(ctx, "shadowSpread"), spread, "px", 1);
  addRow("opacity", t(ctx, "shadowOpacity"), opacity, "%", 100);
  const colorLabel = el("label", { for: colorInput.id }, t(ctx, "shadowColor"));
  rows.append(
    el(
      "div",
      { class: "blixis-ctl-row" },
      colorLabel,
      el("div", { class: "blixis-ctl-slider" }, colorInput),
    ),
  );
  colorInput.addEventListener("input", () => {
    writeColor();
    commit();
  });

  const panel = el(
    "details",
    { class: "blixis-ctl-details" },
    el("summary", {}, t(ctx, "adjust")),
    rows,
    note,
  );

  const showPanel = (): void => {
    const layers = parseShadow(input.value);
    const first = layers?.[0];
    layer = first ?? { ...START };
    rest = layers?.slice(1) ?? [];
    const srgb = toSrgb(layer.color, ctx.map);
    slider("x").set(layer.x, {
      min: Math.min(offset.min, layer.x),
      max: Math.max(offset.max, layer.x),
      step: offset.step,
    });
    slider("y").set(layer.y, {
      min: Math.min(offset.min, layer.y),
      max: Math.max(offset.max, layer.y),
      step: offset.step,
    });
    slider("blur").set(layer.blur, {
      min: Math.min(blur.min, layer.blur),
      max: Math.max(blur.max, layer.blur),
      step: blur.step,
    });
    slider("spread").set(layer.spread, {
      min: Math.min(spread.min, layer.spread),
      max: Math.max(spread.max, layer.spread),
      step: spread.step,
    });
    const alpha = Number(formatNumber((srgb?.[3] ?? 0.1) * 100, 0));
    slider("opacity").set(alpha, {
      min: opacity.min * 100,
      max: opacity.max * 100,
      step: opacity.step * 100,
    });
    colorInput.value = pickerHex(layer.color, ctx.map) ?? "#000000";
    note.textContent = rest.length > 0 ? t(ctx, "shadowLayers", rest.length + 1) : "";
  };
  const showCards = (): void => {
    const preset = presetFor(input.value);
    for (const [id, radio] of radios) radio.checked = preset?.id === id;
    status.textContent = preset === null ? t(ctx, "shadowCustom") : "";
  };

  for (const [id, radio] of radios) {
    radio.addEventListener("change", () => {
      const preset = SHADOW_PRESETS.find((candidate) => candidate.id === id);
      if (preset === undefined) return;
      input.value = preset.value;
      showCards();
      showPanel();
      announceChange(input);
    });
  }
  input.addEventListener("input", () => {
    showCards();
    // Edits made in the panel already know their state; refresh it for typed CSS only.
    if (!isInternalChange()) showPanel();
  });
  // Panel edits update the cards through the same input event.
  showCards();
  showPanel();

  if (parts.control !== null) {
    const host = el("div", { class: "blixis-ctl-host" });
    parts.control.replaceWith(host);
    host.append(cards, status, panel, rawDetails(ctx, parts.control));
  }
  controls.set(input, {
    set(value) {
      input.value = value;
      showCards();
      showPanel();
    },
  });
}
