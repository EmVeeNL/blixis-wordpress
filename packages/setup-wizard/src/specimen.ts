// Small specimens for each step. They use the --blixis-* custom properties, which are set on
// each specimen from the same previewProperties() the front-page preview uses.
import { type Config, previewProperties } from "@blixis/tokens";
import { ratioText } from "./color-control.ts";
import { checkPalette } from "./contrast.ts";
import { type Context, el, t, uid } from "./dom.ts";

type Builder = (ctx: Context, scheme: "light" | "dark") => HTMLElement;

function spec(
  ctx: Context,
  titleKey: string,
  scheme: "light" | "dark",
  ...content: Node[]
): HTMLElement {
  const heading = el("h3", { id: uid("blixis-spec-heading") }, t(ctx, titleKey));
  return el(
    "section",
    { class: "blixis-spec", "data-scheme": scheme, "aria-labelledby": heading.id },
    heading,
    ...content,
  );
}

const SWATCH_KEYS = ["primary", "surface", "foreground", "muted", "accent"];

const colors: Builder = (ctx, scheme) => {
  const canvas = el(
    "div",
    { class: "blixis-spec-canvas blixis-spec-sample" },
    el(
      "p",
      {},
      t(ctx, "sampleText"),
      " ",
      el("span", { class: "blixis-spec-link" }, t(ctx, "sampleLink")),
      " ",
      el("span", { class: "blixis-spec-muted" }, t(ctx, "sampleMuted")),
    ),
    el(
      "p",
      {},
      el("span", { class: "blixis-spec-button" }, t(ctx, "sampleButton")),
      " ",
      el("span", { class: "blixis-spec-chip" }, t(ctx, "sampleAccent")),
    ),
  );
  const list = el("ul", { class: "blixis-spec-swatches" });
  for (const key of SWATCH_KEYS) {
    list.append(
      el(
        "li",
        { "data-key": key },
        el("span", {
          class: "blixis-spec-dot",
          style: `background:var(--blixis-color-${key})`,
          "aria-hidden": "true",
        }),
        el("span", { class: "blixis-spec-name" }, key.charAt(0).toUpperCase() + key.slice(1)),
        el("span", { class: "blixis-spec-value" }),
        el("span", { class: "blixis-spec-ratio" }),
      ),
    );
  }
  const note = el("p", { class: "blixis-setup-hint blixis-spec-note" });
  return spec(
    ctx,
    scheme === "dark" ? "specimenDark" : "specimenLight",
    scheme,
    canvas,
    list,
    note,
  );
};

const type: Builder = (ctx, scheme) => {
  const line = (key: string, text: string, tag: "p" | "div" = "p"): HTMLElement =>
    el(
      tag,
      { class: "blixis-spec-type", style: `font-size:var(--blixis-text-${key})`, "data-size": key },
      text,
    );
  const heads = el(
    "div",
    { class: "blixis-spec-heading-font" },
    line("3xl", t(ctx, "sampleH1")),
    line("2xl", t(ctx, "sampleH2")),
    line("xl", t(ctx, "sampleH3")),
    line("lg", t(ctx, "sampleH4")),
  );
  const body = el(
    "div",
    { class: "blixis-spec-body-font" },
    line("base", t(ctx, "sampleBody")),
    line("sm", t(ctx, "sampleSmall")),
    line("xs", t(ctx, "sampleXs")),
    el("code", { class: "blixis-spec-mono" }, "const tokens = { ok: true };"),
  );
  return spec(ctx, "specimenType", scheme, el("div", { class: "blixis-spec-canvas" }, heads, body));
};

const spacing: Builder = (ctx, scheme) => {
  const list = el("ul", { class: "blixis-spec-ruler" });
  for (const key of ["xs", "sm", "md", "lg", "xl"]) {
    list.append(
      el(
        "li",
        {},
        el("span", { class: "blixis-spec-name" }, key.toUpperCase()),
        el("span", { class: "blixis-spec-bar", style: `inline-size:var(--blixis-spacing-${key})` }),
        el("span", { class: "blixis-spec-value", "data-var": `spacing-${key}` }),
      ),
    );
  }
  return spec(ctx, "specimenSpacing", scheme, list);
};

const radius: Builder = (ctx, scheme) => {
  const row = el("div", { class: "blixis-spec-row" });
  for (const key of ["sm", "md", "lg"]) {
    row.append(
      el(
        "div",
        { class: "blixis-spec-box", style: `border-radius:var(--blixis-radius-${key})` },
        key.toUpperCase(),
      ),
    );
  }
  return spec(ctx, "specimenRadius", scheme, row);
};

const layout: Builder = (ctx, scheme) => {
  const bar = (key: string, name: string): HTMLElement =>
    el(
      "div",
      { class: "blixis-spec-width", style: `max-inline-size:var(--blixis-layout-${key})` },
      name,
    );
  const frame = el(
    "div",
    { class: "blixis-spec-widths", style: "padding-inline:var(--blixis-layout-gutter)" },
    bar("wide-width", t(ctx, "sampleWide")),
    bar("content-width", t(ctx, "sampleContent")),
  );
  return spec(ctx, "specimenLayout", scheme, frame);
};

const shadows: Builder = (ctx, scheme) => {
  const row = el("div", { class: "blixis-spec-row" });
  for (const key of ["sm", "md", "lg"]) {
    row.append(
      el(
        "div",
        { class: "blixis-spec-box", style: `box-shadow:var(--blixis-shadow-${key})` },
        key.toUpperCase(),
      ),
    );
  }
  return spec(ctx, "specimenShadows", scheme, row);
};

const BUILDERS: Record<string, Builder> = {
  colors,
  "colors-light": colors,
  "colors-dark": (ctx) => colors(ctx, "dark"),
  typeScale: type,
  spacing,
  radius,
  layout,
  shadows,
};

export function buildSpecimens(ctx: Context): void {
  for (const slot of ctx.form.querySelectorAll<HTMLElement>(".blixis-spec-slot")) {
    const name = slot.dataset["specimen"] ?? "";
    const builder = BUILDERS[name];
    if (builder === undefined) continue;
    slot.replaceChildren(builder(ctx, name === "colors-dark" ? "dark" : "light"));
  }
}

// Sets the custom properties on every specimen and refreshes the colour readouts.
export function updateSpecimens(ctx: Context, config: Config): void {
  const light = previewProperties(config, ctx.map, "light");
  const dark = previewProperties(config, ctx.map, "dark");
  const hasDark = config["colorsDark"] !== undefined;
  for (const node of ctx.form.querySelectorAll<HTMLElement>(".blixis-spec[data-scheme]")) {
    const scheme = node.dataset["scheme"] === "dark" ? "dark" : "light";
    const props = scheme === "dark" ? dark : light;
    for (const [name, value] of props) node.style.setProperty(name, value);
    node.style.colorScheme = scheme;
    for (const output of node.querySelectorAll<HTMLElement>("[data-var]")) {
      output.textContent = props.get(`--blixis-${output.dataset["var"] ?? ""}`) ?? "";
    }
    const swatches = node.querySelector(".blixis-spec-swatches");
    if (swatches === null) continue;
    const palette = (scheme === "dark" && hasDark ? config["colorsDark"] : config["colors"]) as
      | Record<string, string>
      | undefined;
    const results = checkPalette(palette ?? {}, ctx.map);
    for (const item of swatches.querySelectorAll<HTMLElement>("li")) {
      const key = item.dataset["key"] ?? "";
      const value = item.querySelector(".blixis-spec-value");
      if (value !== null) value.textContent = palette?.[key] ?? "";
      const ratio = item.querySelector(".blixis-spec-ratio");
      if (ratio === null) continue;
      const own = results.filter((result) => result.key === key);
      ratio.replaceChildren(
        ...own.map((result) =>
          el(
            "span",
            { class: result.pass ? "is-pass" : "is-warn" },
            el("span", { "aria-hidden": "true" }, result.pass ? "✓ " : "⚠ "),
            `${result.ratio === null ? "?" : ratioText(result.ratio)}:1 `,
            el("span", { class: "screen-reader-text" }, t(ctx, result.pass ? "passes" : "fails")),
          ),
        ),
      );
    }
    const note = node.querySelector(".blixis-spec-note");
    if (note !== null) note.textContent = scheme === "dark" && !hasDark ? t(ctx, "noDark") : "";
  }
}
