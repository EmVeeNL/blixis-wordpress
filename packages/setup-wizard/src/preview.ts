// The front-page preview on every step. The server renders the iframe from the user's draft;
// this layer sets the current form values on its document, so it follows edits as they happen.
// Nothing is announced while typing: a button fills a polite live region on request.
import { type Config, contrastRatio, previewProperties } from "@blixis/tokens";
import { ratioText } from "./color-control.ts";
import { type Context, el, t, uid } from "./dom.ts";

export type PreviewScheme = "light" | "dark";

export type Preview = {
  update: (config: Config) => void;
  scheme: () => PreviewScheme;
};

export function setupPreview(ctx: Context, onScheme: () => void): Preview | null {
  const section = document.querySelector<HTMLElement>(".blixis-setup-preview");
  const frame = section?.querySelector<HTMLIFrameElement>("iframe");
  if (section === null || section === undefined || frame === null || frame === undefined)
    return null;

  const group = uid("blixis-preview-scheme");
  const mk = (value: PreviewScheme, checked: boolean): HTMLElement =>
    el(
      "label",
      { class: "blixis-seg__opt" },
      el("input", { type: "radio", name: group, value, checked }),
      el("span", {}, t(ctx, value === "light" ? "light" : "dark")),
    );
  const choice = el(
    "fieldset",
    { class: "blixis-seg blixis-preview-scheme" },
    el("legend", { class: "screen-reader-text" }, t(ctx, "previewColours")),
    mk("light", true),
    mk("dark", false),
  );
  const live = el("div", {
    class: "screen-reader-text",
    role: "status",
    "aria-live": "polite",
    "aria-atomic": "true",
  });
  const describe = el(
    "button",
    { type: "button", class: "blixis-btn blixis-btn--secondary blixis-btn--small" },
    t(ctx, "describe"),
  );
  const schemeSlot = section.querySelector('[data-blixis-slot="preview-scheme"]');
  const describeSlot = section.querySelector('[data-blixis-slot="preview-describe"]');
  if (schemeSlot !== null) schemeSlot.replaceWith(choice);
  else section.querySelector(".blixis-setup-widths")?.after(choice);
  if (describeSlot !== null) describeSlot.replaceWith(describe, live);
  else frame.closest(".blixis-setup-frame")?.after(el("p", {}, describe), live);

  let last: Config = ctx.base;
  const currentScheme = (): PreviewScheme =>
    choice.querySelector<HTMLInputElement>('input[value="dark"]')?.checked === true
      ? "dark"
      : "light";

  const apply = (): void => {
    const doc = frame.contentDocument;
    const root = doc?.documentElement;
    if (root === undefined || root === null) return;
    const scheme = currentScheme();
    for (const [name, value] of previewProperties(last, ctx.map, scheme))
      root.style.setProperty(name, value);
    root.style.colorScheme = scheme;
  };
  frame.addEventListener("load", apply);
  choice.addEventListener("change", () => {
    apply();
    onScheme();
  });

  describe.addEventListener("click", () => {
    const scheme = currentScheme();
    const props = previewProperties(last, ctx.map, scheme);
    const get = (name: string): string => props.get(name) ?? "";
    const ratio = contrastRatio(
      get("--blixis-color-foreground"),
      get("--blixis-color-surface"),
      ctx.map,
    );
    live.textContent = "";
    // A changed text node is what makes a polite region speak; clear first, then set.
    window.setTimeout(() => {
      live.textContent = t(
        ctx,
        "describeText",
        t(ctx, scheme),
        get("--blixis-color-foreground"),
        get("--blixis-color-surface"),
        ratio === null ? "?" : ratioText(ratio),
        get("--blixis-color-primary"),
        get("--blixis-font-heading").split(",")[0]?.replaceAll('"', "") ?? "",
        get("--blixis-font-body").split(",")[0]?.replaceAll('"', "") ?? "",
        get("--blixis-text-base"),
      );
    }, 50);
  });

  return {
    update(config) {
      last = config;
      apply();
    },
    scheme: currentScheme,
  };
}
