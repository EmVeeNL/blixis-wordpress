// Entry point. Reads the JSON the page prints (token map, draft, translated strings), then
// enhances the server-rendered fields. Without this script the wizard still works with plain
// fields and server validation.
import type { Config, TokenMap } from "@blixis/tokens";
import { type ColorField, enhanceColor, refreshContrast } from "./color-control.ts";
import { previewConfig, isValidValue } from "./config.ts";
import { type Context, el, t, uid } from "./dom.ts";
import { controls, partsOf } from "./field.ts";
import { type LabelKey, hasChanged, labelFor } from "./label.ts";
import { enhanceLength } from "./length-control.ts";
import { scaleScale } from "./length.ts";
import { buildMotionSample, enhanceDuration, enhanceEasing } from "./motion-control.ts";
import { setupPreview } from "./preview.ts";
import { enhanceShadow } from "./shadow-control.ts";
import { buildSpecimens, updateSpecimens } from "./specimen.ts";

type PageData = {
  tokenMap: TokenMap;
  config: Config;
  step: string;
  strings: Record<string, string>;
};

function readData(): PageData | null {
  const node = document.getElementById("blixis-setup-data");
  if (node === null) return null;
  try {
    return JSON.parse(node.textContent ?? "") as PageData;
  } catch {
    return null;
  }
}

// Fields whose change makes the main button say "Save and continue".
const TRACKED = /^(config\[|scheme$|choice$|new_)/;

function snapshot(form: HTMLFormElement): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, value] of new FormData(form)) {
    if (TRACKED.test(name) && typeof value === "string") out.set(name, value);
  }
  return out;
}

function setupLabels(form: HTMLFormElement, themeStep: boolean): void {
  const button = form.querySelector<HTMLButtonElement>(
    "button[data-label-continue][data-label-save][data-label-create]",
  );
  if (button === null) return;
  const labels = {
    continue: button.dataset["labelContinue"] ?? "",
    save: button.dataset["labelSave"] ?? "",
    create: button.dataset["labelCreate"] ?? "",
  };
  const initial = snapshot(form);
  // The server renders one span per label and marks the current one; only the marking changes.
  const spans = [
    ...button.querySelectorAll<HTMLElement>(".blixis-setup-button-label[data-label-value]"),
  ];
  const shown =
    (spans.find((span) => span.classList.contains("is-current-label"))?.dataset["labelValue"] as
      | LabelKey
      | undefined) ??
    (Object.keys(labels) as LabelKey[]).find((key) => labels[key] === button.textContent?.trim());
  const refresh = (): void => {
    const key = labelFor({
      creating:
        form.querySelector<HTMLInputElement>('input[name="choice"]:checked')?.value === "__new",
      themeStep,
      changed: hasChanged(initial, snapshot(form)),
      initial: shown ?? "continue",
    });
    if (spans.length > 0) {
      for (const span of spans)
        span.classList.toggle("is-current-label", span.dataset["labelValue"] === key);
    } else if (labels[key] !== "" && button.textContent !== labels[key]) {
      button.textContent = labels[key];
    }
  };
  form.addEventListener("input", refresh);
  form.addEventListener("change", refresh);
}

function start(): void {
  const data = readData();
  const form = document.querySelector<HTMLFormElement>("form.blixis-setup-form");
  if (data === null || form === null) return;
  const ctx: Context = {
    map: data.tokenMap,
    strings: data.strings,
    base: data.config,
    form,
    step: data.step,
  };

  setupLabels(form, data.step === "theme");

  // Fields.
  const palettes = new Map<string, ColorField[]>();
  let base: HTMLInputElement | null = null;
  for (const input of form.querySelectorAll<HTMLInputElement>("input[data-blixis-kind]")) {
    const parts = partsOf(input);
    if (parts === null) continue;
    switch (input.dataset["blixisKind"]) {
      case "color": {
        const list = palettes.get(parts.section) ?? [];
        list.push(enhanceColor(ctx, input, parts));
        palettes.set(parts.section, list);
        break;
      }
      case "length":
        enhanceLength(ctx, input, parts);
        if (parts.section === "typeScale" && parts.key === "base") base = input;
        break;
      case "shadow":
        enhanceShadow(ctx, input, parts);
        break;
      case "duration":
        enhanceDuration(ctx, input, parts);
        break;
      case "easing":
        enhanceEasing(ctx, input, parts);
        break;
      default:
        break;
    }
  }

  // Keep proportions: moving the base size scales the others by the same ratio. Registered
  // before the preview listener so the previews see the scaled values.
  if (base !== null) {
    const baseInput = base;
    const legend = baseInput.closest("fieldset")?.querySelector("legend");
    const box = el("input", { type: "checkbox", id: uid("blixis-keep") });
    // The base size when the page loaded or the last edit ended: the "before" of an edit.
    let lastBase = baseInput.value;
    form.addEventListener("change", () => {
      lastBase = baseInput.value;
    });
    legend?.after(
      el(
        "div",
        { class: "blixis-setup-field blixis-ctl-keep" },
        el(
          "p",
          { class: "blixis-setup-choice" },
          box,
          el("label", { for: box.id }, t(ctx, "keepProportions")),
        ),
        el("p", { class: "blixis-setup-hint" }, t(ctx, "keepHint")),
      ),
    );
    // Scaling always starts from the sizes as they were when this edit began, so typing
    // 1.25 digit by digit, or dragging, does not pile up rounding steps. An edit ends on
    // "change", or when another size is edited directly.
    let anchor: { values: Record<string, string>; base: string } | null = null;
    form.addEventListener("change", () => {
      anchor = null;
    });
    form.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.dataset["section"] !== "typeScale")
        return;
      if (target !== baseInput) {
        anchor = null;
        return;
      }
      const next = baseInput.value;
      const sizes = ctx.map.fields["typeScale"] ?? {};
      if (!(box as HTMLInputElement).checked) {
        anchor = null;
        return;
      }
      if (!isValidValue(ctx, "typeScale", "base", next)) return;
      if (anchor === null) {
        const values: Record<string, string> = {};
        for (const key of Object.keys(sizes)) {
          values[key] =
            form.querySelector<HTMLInputElement>(`input[name="config[typeScale][${key}]"]`)
              ?.value ?? "";
        }
        anchor = { values, base: lastBase };
      }
      const scaled = scaleScale(anchor.values, "base", anchor.base, next, sizes);
      for (const [key, value] of Object.entries(scaled)) {
        if (key === "base") continue;
        const field = form.querySelector<HTMLInputElement>(
          `input[name="config[typeScale][${key}]"]`,
        );
        if (field !== null) controls.get(field)?.set(value);
      }
    });
    box.addEventListener("change", () => {
      anchor = null;
    });
  }

  // Specimens, motion sample and the front-page preview.
  buildSpecimens(ctx);
  const sample = form.querySelector<HTMLElement>('.blixis-spec-slot[data-specimen="motion"]');
  if (sample !== null) {
    buildMotionSample(ctx, sample, () => {
      const value = (key: string): string =>
        form.querySelector<HTMLInputElement>(`input[name="config[motion][${key}]"]`)?.value ?? "";
      return {
        durations: [value("durationFast"), value("durationBase"), value("durationSlow")],
        easing: value("easing"),
      };
    });
  }

  let preview: ReturnType<typeof setupPreview> = null;
  let frame = 0;
  const refresh = (): void => {
    frame = 0;
    const config = previewConfig(ctx);
    for (const [section, fields] of palettes)
      refreshContrast(ctx, fields, section === "colorsDark");
    updateSpecimens(ctx, config);
    preview?.update(config);
    // Mark values the server would refuse. The server stays authoritative.
    for (const input of form.querySelectorAll<HTMLInputElement>("input[data-blixis-kind]")) {
      const section = input.dataset["section"] ?? "";
      const key = input.dataset["key"] ?? "";
      const optional = section === "colorsDark" && input.value.trim() === "";
      const bad = !optional && !isValidValue(ctx, section, key, input.value);
      const target =
        input.type === "hidden"
          ? input.closest(".blixis-setup-field")?.querySelector(".blixis-ctl-number")
          : input;
      target?.toggleAttribute("data-invalid", bad);
    }
  };
  preview = setupPreview(ctx, refresh);
  const schedule = (): void => {
    if (frame === 0) frame = requestAnimationFrame(refresh);
  };
  form.addEventListener("input", schedule);
  form.addEventListener("change", schedule);

  // Dark palette helper.
  const copy = form.querySelector<HTMLButtonElement>("button[data-blixis-copy-light]");
  if (copy !== null) copy.hidden = false;
  copy?.addEventListener("click", () => {
    for (const input of form.querySelectorAll<HTMLInputElement>('input[name^="config[colors]["]')) {
      const key = /\]\[([^\]]+)\]$/.exec(input.name)?.[1] ?? "";
      const target = form.querySelector<HTMLInputElement>(
        `input[name="config[colorsDark][${key}]"]`,
      );
      if (target !== null) controls.get(target)?.set(input.value);
    }
    schedule();
  });
  refresh();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
