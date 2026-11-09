// Named speeds with millisecond sliders, easing presets with plain names, and the Play sample.
import { type Context, announceChange, el, fieldOf, prefersReducedMotion, t, uid } from "./dom.ts";
import { type Parts, controls, describedBy } from "./field.ts";
import { type Length, formatLength, parseLength } from "./length.ts";
import { numberSlider } from "./slider.ts";
import { rawDetails } from "./shadow-control.ts";
import { EASINGS, easingFor } from "./motion.ts";

export function enhanceDuration(ctx: Context, input: HTMLInputElement, parts: Parts): boolean {
  const field = fieldOf(ctx, parts.section, parts.key);
  const parsed = parseLength(input.value);
  const range = field?.ranges["ms"];
  if (field === null || range === undefined || parsed === null || parsed.unit !== "ms")
    return false;
  const originalId = input.id;
  const description = describedBy(input);
  input.type = "hidden";
  input.id = uid(`${originalId}-value`);
  input.removeAttribute("aria-describedby");
  input.removeAttribute("aria-invalid");
  const widget = numberSlider({
    numberId: originalId,
    labelledBy: parts.label.id,
    describedBy: description,
    valueText: (value) => `${value} ms`,
    extra: el("span", { class: "blixis-ctl-unit-text", "aria-hidden": "true" }, "ms"),
    onInput(value) {
      input.value = value === null ? "" : formatLength({ amount: value, unit: "ms" });
      announceChange(input);
    },
  });
  const show = (length: Length): void => {
    widget.set(length.amount, {
      min: Math.min(range.min, length.amount),
      max: Math.max(range.max, length.amount),
      step: range.step,
    });
  };
  show(parsed);
  widget.root.append(input);
  if (parts.control === null) parts.wrap.append(widget.root);
  else parts.control.replaceWith(widget.root);
  controls.set(input, {
    set(value) {
      const next = parseLength(value);
      if (next !== null && next.unit === "ms") {
        show(next);
        input.value = value;
      }
    },
  });
  return true;
}

// A small curve for an easing, drawn from its control points.
const POINTS: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

export function bezierPoints(value: string): [number, number, number, number] | null {
  const keyword = POINTS[value];
  if (keyword !== undefined) return keyword;
  const match = /^cubic-bezier\(([^,]+), ([^,]+), ([^,]+), ([^)]+)\)$/.exec(value);
  if (match === null) return null;
  const numbers = match.slice(1, 5).map(Number.parseFloat);
  return numbers.every(Number.isFinite) ? (numbers as [number, number, number, number]) : null;
}

function curve(value: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "-4 -4 48 48");
  svg.setAttribute("class", "blixis-card-curve");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const p = bezierPoints(value) ?? POINTS["linear"] ?? [0, 0, 1, 1];
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  const y = (v: number): number => 40 - v * 40;
  path.setAttribute("d", `M0 40 C${p[0] * 40} ${y(p[1])} ${p[2] * 40} ${y(p[3])} 40 0`);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2.5");
  svg.append(path);
  return svg;
}

export function enhanceEasing(ctx: Context, input: HTMLInputElement, parts: Parts): void {
  const group = uid("blixis-easing");
  const cards = el("div", {
    class: "blixis-ctl-cards",
    role: "radiogroup",
    "aria-labelledby": parts.label.id,
  });
  const radios = new Map<string, HTMLInputElement>();
  for (const easing of EASINGS) {
    const radio = el("input", { type: "radio", name: group, value: easing.id });
    radios.set(easing.id, radio);
    cards.append(
      el(
        "label",
        { class: "blixis-card" },
        radio,
        curve(easing.value),
        el("span", { class: "blixis-card-name" }, t(ctx, `easing_${easing.id}`)),
      ),
    );
  }
  const status = el("p", { class: "blixis-ctl-status" });
  const show = (): void => {
    const known = easingFor(input.value);
    for (const [id, radio] of radios) radio.checked = known?.id === id;
    status.textContent = known === null ? t(ctx, "easingCustom") : "";
  };
  for (const [id, radio] of radios) {
    radio.addEventListener("change", () => {
      const easing = EASINGS.find((candidate) => candidate.id === id);
      if (easing === undefined) return;
      input.value = easing.value;
      show();
      announceChange(input);
    });
  }
  input.addEventListener("input", show);
  show();
  if (parts.control !== null) {
    const host = el("div", { class: "blixis-ctl-host" });
    parts.control.replaceWith(host);
    host.append(cards, status, rawDetails(ctx, parts.control));
  }
  controls.set(input, {
    set(value) {
      input.value = value;
      show();
    },
  });
}

// The Play sample: three lanes, one per speed. Never starts by itself; under reduced motion it
// shows a static explanation instead of moving.
export function buildMotionSample(
  ctx: Context,
  slot: HTMLElement,
  read: () => { durations: string[]; easing: string },
): void {
  const lanes = ["fast", "normal", "slow"].map((id) => {
    const dot = el("span", { class: "blixis-motion-dot" });
    const track = el("span", { class: "blixis-motion-track", "aria-hidden": "true" }, dot);
    return {
      id,
      dot,
      row: el(
        "div",
        { class: "blixis-motion-lane" },
        el("span", { class: "blixis-motion-name" }, t(ctx, `speed_${id}`)),
        track,
      ),
    };
  });
  const play = el("button", { type: "button", class: "button" }, t(ctx, "play"));
  const still = el("p", { class: "blixis-motion-still", role: "note" });
  const heading = el("h3", { id: uid("blixis-spec-heading") }, t(ctx, "specimenMotion"));
  const section = el(
    "section",
    { class: "blixis-spec blixis-spec-motion", "aria-labelledby": heading.id },
    heading,
    ...lanes.map((lane) => lane.row),
    play,
    still,
  );
  slot.replaceChildren(section);

  const media = prefersReducedMotion();
  const describe = (): void => {
    const { durations, easing } = read();
    const known = easingFor(easing);
    still.textContent = t(
      ctx,
      "motionStill",
      durations[0] ?? "",
      durations[1] ?? "",
      durations[2] ?? "",
      known === null ? easing : t(ctx, `easing_${known.id}`),
    );
    const reduced = media.matches;
    play.hidden = reduced;
    still.hidden = !reduced;
  };
  describe();
  media.addEventListener("change", describe);
  ctx.form.addEventListener("input", describe);
  ctx.form.addEventListener("change", describe);

  play.addEventListener("click", () => {
    if (media.matches) return;
    const { durations, easing } = read();
    lanes.forEach((lane, index) => {
      const ms = Number.parseFloat(durations[index] ?? "200");
      const distance = Math.max(0, lane.dot.parentElement!.clientWidth - lane.dot.offsetWidth);
      lane.dot.animate(
        [{ transform: "translateX(0)" }, { transform: `translateX(${distance}px)` }],
        { duration: Number.isFinite(ms) ? ms : 200, easing, direction: "alternate", iterations: 2 },
      );
    });
  });
}
