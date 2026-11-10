// The Header and footer step: dependent rows, the social link list, inline validation with the
// layout validator, and a live preview. Without this script the step is a plain form and the
// server validates everything.
import { type LayoutConfig, type LayoutError } from "@blixis/tokens";
import { type Context, el, format, t } from "./dom.ts";
import { checkLayout, fieldIdFor, trimUrl, valuesOf } from "./layout-form.ts";

export type LayoutPreview = { url: string; action: string; nonce: string };

// The switch that turns a group of rows on, and the fields in those rows.
const DEPENDENTS: Record<string, string[]> = {
  usp: ['[name^="layout[header][usp][items]"]'],
  cta: ['[name="layout[header][cta][text]"]', '[name="layout[header][cta][url]"]'],
  copyright: ['[name="layout[footer][copyright][text]"]'],
};

const DEBOUNCE_MS = 450;

function setupDependents(form: HTMLFormElement): void {
  for (const [key, selectors] of Object.entries(DEPENDENTS)) {
    const toggle = form.querySelector<HTMLInputElement>(`[data-blixis-controls="${key}"]`);
    if (toggle === null) continue;
    const rows = new Set<HTMLElement>();
    for (const selector of selectors) {
      for (const field of form.querySelectorAll(selector)) {
        const row = field.closest<HTMLElement>(".blixis-row");
        if (row !== null) rows.add(row);
      }
    }
    const apply = (): void => {
      for (const row of rows) {
        // A row with an error stays visible so the error can be seen.
        row.hidden = !toggle.checked && row.querySelector('[aria-invalid="true"]') === null;
      }
    };
    toggle.addEventListener("change", apply);
    apply();
  }
}

function setupSocial(ctx: Context, form: HTMLFormElement): void {
  const box = form.querySelector<HTMLElement>("[data-blixis-social]");
  if (box === null) return;
  const max = Number.parseInt(box.dataset["max"] ?? "6", 10);
  const items = [...box.querySelectorAll<HTMLElement>(".blixis-social__item")];
  const urlOf = (item: HTMLElement): HTMLInputElement | null =>
    item.querySelector<HTMLInputElement>('input[type="text"]');
  const visible = (): HTMLElement[] => items.filter((item) => !item.hidden);

  const add = el(
    "button",
    { type: "button", class: "blixis-btn blixis-btn--secondary blixis-btn--small" },
    t(ctx, "addLink"),
  );
  const actions = el("p", { class: "blixis-social__actions" }, add);
  box.append(actions);

  const refresh = (): void => {
    add.hidden = visible().length >= Math.min(max, items.length);
  };
  // Show the filled rows and one empty row; the add button shows the others.
  let blankShown = false;
  items.forEach((item, index) => {
    if (item.hidden) return;
    const filled = (urlOf(item)?.value ?? "") !== "" || item.querySelector('[aria-invalid="true"]');
    if (filled) return;
    if (!blankShown && visible().length < max) {
      blankShown = true;
      return;
    }
    if (index > 0) item.hidden = true;
  });

  items.forEach((item, index) => {
    const remove = el(
      "button",
      {
        type: "button",
        class: "blixis-btn blixis-btn--secondary blixis-btn--small",
        "aria-label": format(ctx.strings["removeLink"] ?? "", index + 1),
      },
      "×",
    );
    item.append(remove);
    remove.addEventListener("click", () => {
      const url = urlOf(item);
      if (url !== null) url.value = "";
      for (const error of item.querySelectorAll("[data-client-error], .blixis-setup-error"))
        error.remove();
      for (const field of item.querySelectorAll("[aria-invalid]"))
        field.removeAttribute("aria-invalid");
      const open = visible();
      if (open.length > 1) {
        item.hidden = true;
        const previous = visible().at(Math.max(0, open.indexOf(item) - 1));
        (previous === undefined ? add : (urlOf(previous) ?? add)).focus();
      } else {
        url?.focus();
      }
      refresh();
      // The form hears the change like any edit: validation and the preview follow.
      form.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
  add.addEventListener("click", () => {
    const next = items.find((item) => item.hidden);
    if (next === undefined) return;
    next.hidden = false;
    urlOf(next)?.focus();
    refresh();
  });
  refresh();
}

function clearErrors(form: HTMLFormElement): void {
  for (const node of form.querySelectorAll("[data-client-error]")) node.remove();
  for (const field of form.querySelectorAll<HTMLElement>("[data-client-invalid]")) {
    field.removeAttribute("data-client-invalid");
    field.removeAttribute("aria-invalid");
    const was = field.dataset["describedBy"];
    if (was === undefined) field.removeAttribute("aria-describedby");
    else field.setAttribute("aria-describedby", was);
    delete field.dataset["describedBy"];
  }
}

function showErrors(ctx: Context, form: HTMLFormElement, errors: LayoutError[]): void {
  clearErrors(form);
  for (const error of errors) {
    // A path without a field of its own (a whole list) falls back to its parent.
    let path = error.path;
    let target: HTMLElement | null = null;
    while (path !== "" && target === null) {
      target = document.getElementById(fieldIdFor(path));
      path = path.slice(0, Math.max(0, path.lastIndexOf("/")));
    }
    if (target === null || !form.contains(target)) continue;
    // Server errors already sit on this field.
    if (document.getElementById(`${target.id}-error`) !== null) continue;
    const row = target.closest<HTMLElement>(".blixis-row");
    if (row !== null) row.hidden = false;
    const message = el(
      "p",
      { class: "blixis-setup-error", id: `${target.id}-client-error`, "data-client-error": true },
      ctx.strings[`layoutErr_${error.code}`] ?? ctx.strings["layoutErr_other"] ?? error.code,
    );
    const label = target.closest("label.blixis-switch");
    (label ?? target).before(message);
    if (target.matches("input, select, textarea")) {
      const before = target.getAttribute("aria-describedby");
      if (before !== null) target.dataset["describedBy"] = before;
      target.setAttribute("aria-invalid", "true");
      target.setAttribute("aria-describedby", `${before ?? ""} ${message.id}`.trim());
      target.setAttribute("data-client-invalid", "");
    }
  }
}

export function setupLayoutStep(
  ctx: Context,
  base: LayoutConfig,
  preview: LayoutPreview | undefined,
): void {
  const form = ctx.form;
  setupDependents(form);
  setupSocial(ctx, form);

  const frame = document.querySelector<HTMLIFrameElement>(".blixis-setup-preview iframe");
  const status = el("p", {
    class: "screen-reader-text",
    role: "status",
    "aria-live": "polite",
    "aria-atomic": "true",
  });
  frame?.closest(".blixis-setup-frame")?.after(status);

  let timer = 0;
  let sequence = 0;
  const run = async (): Promise<void> => {
    timer = 0;
    const values = valuesOf(new FormData(form));
    const { errors } = checkLayout(values, base);
    showErrors(ctx, form, errors);
    // Only a layout the validator accepts goes to the server, so the preview shows what the
    // site would render.
    if (errors.length > 0 || preview === undefined) return;
    sequence += 1;
    const mine = sequence;
    const body = new FormData();
    body.set("action", preview.action);
    body.set("_wpnonce", preview.nonce);
    // URLs are trimmed here as in the validated config: the contract does not trim them.
    for (const [name, value] of values)
      body.append(name, name.endsWith("[url]") ? trimUrl(value) : value);
    try {
      const response = await fetch(preview.url, {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      if (mine !== sequence) return;
      if (!response.ok) throw new Error(String(response.status));
      status.textContent = "";
      frame?.contentWindow?.location.reload();
    } catch {
      if (mine === sequence) status.textContent = t(ctx, "previewFailed");
    }
  };
  const schedule = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLElement && target !== form) {
      const name = target.getAttribute("name") ?? "";
      if (!name.startsWith("layout[")) return;
    }
    if (timer !== 0) window.clearTimeout(timer);
    timer = window.setTimeout(() => void run(), DEBOUNCE_MS);
  };
  form.addEventListener("input", schedule);
  form.addEventListener("change", schedule);
}
