// A searchable font picker: an editable combobox with a listbox popup (WAI-ARIA 1.2). The native
// select stays in the form, hidden, and carries the value; without this script it is the control.
import { type Context, announceChange, el, t, uid } from "./dom.ts";
import { type Parts, controls } from "./field.ts";

type Option = { value: string; group: string; node: HTMLLIElement };

const SEARCH =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
const CHEVRON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>';

function icon(markup: string, className: string): HTMLSpanElement {
  const span = el("span", { class: className, "aria-hidden": "true" });
  span.innerHTML = markup;
  return span;
}

export function enhanceFontSelect(ctx: Context, select: HTMLSelectElement, parts: Parts): void {
  if (parts.control === null) return;
  const originalId = select.id;
  const described = select.getAttribute("aria-describedby");
  const invalid = select.getAttribute("aria-invalid");
  const listId = uid("blixis-combo-list");

  const options: Option[] = [];
  for (const node of select.querySelectorAll("option")) {
    const group = node.parentElement instanceof HTMLOptGroupElement ? node.parentElement.label : "";
    const li = el("li", { role: "option", id: uid("blixis-combo-opt"), "aria-selected": "false" });
    li.append(el("span", { class: "blixis-combo__name" }, node.value));
    if (group !== "") li.append(el("small", {}, group));
    options.push({ value: node.value, group, node: li });
  }

  const input = el("input", {
    type: "text",
    id: originalId,
    class: "blixis-combo__input",
    role: "combobox",
    "aria-autocomplete": "list",
    "aria-expanded": "false",
    "aria-controls": listId,
    "aria-haspopup": "listbox",
    autocomplete: "off",
    spellcheck: "false",
    dir: "ltr",
  });
  if (described !== null) input.setAttribute("aria-describedby", described);
  if (invalid !== null) input.setAttribute("aria-invalid", invalid);
  const list = el("ul", {
    class: "blixis-combo__list",
    role: "listbox",
    id: listId,
    "aria-label": t(ctx, "fontOptions"),
    hidden: true,
  });
  const empty = el("li", { class: "blixis-combo__empty", role: "presentation" }, t(ctx, "noMatch"));
  const status = el("div", { class: "screen-reader-text", role: "status", "aria-live": "polite" });
  const chevron = icon(CHEVRON, "blixis-combo__chevron");
  const combo = el(
    "div",
    { class: "blixis-combo" },
    icon(SEARCH, "blixis-combo__icon"),
    input,
    chevron,
    list,
    status,
  );

  select.hidden = true;
  select.id = `${originalId}-native`;
  select.removeAttribute("aria-describedby");
  select.removeAttribute("aria-invalid");
  select.after(combo);

  let open = false;
  let query = "";
  let visible: Option[] = options;
  let active = -1;

  const render = (): void => {
    const needle = query.trim().toLowerCase();
    visible =
      needle === ""
        ? options
        : options.filter((option) => option.value.toLowerCase().includes(needle));
    list.replaceChildren(
      ...visible.map((option) => option.node),
      ...(visible.length === 0 ? [empty] : []),
    );
    for (const option of options) {
      option.node.setAttribute("aria-selected", String(option.value === select.value));
    }
    status.textContent = open && visible.length === 0 ? t(ctx, "noMatch") : "";
  };
  const highlight = (index: number): void => {
    active = visible.length === 0 ? -1 : Math.max(0, Math.min(visible.length - 1, index));
    for (const [position, option] of visible.entries()) {
      option.node.classList.toggle("is-active", position === active);
    }
    const current = visible[active];
    if (current === undefined) {
      input.removeAttribute("aria-activedescendant");
    } else {
      input.setAttribute("aria-activedescendant", current.node.id);
      current.node.scrollIntoView({ block: "nearest" });
    }
  };
  const show = (): void => {
    if (!open) {
      open = true;
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }
    render();
    const selected = visible.findIndex((option) => option.value === select.value);
    highlight(query === "" ? selected : 0);
  };
  const hide = (): void => {
    open = false;
    query = "";
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    input.value = select.value;
    status.textContent = "";
  };
  const choose = (option: Option | undefined): void => {
    if (option === undefined) return;
    select.value = option.value;
    hide();
    render();
    announceChange(select);
  };

  input.value = select.value;
  render();

  input.addEventListener("focus", () => input.select());
  input.addEventListener("click", () => {
    if (!open) {
      show();
      input.select();
    }
  });
  input.addEventListener("input", () => {
    query = input.value;
    show();
  });
  input.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) show();
        else highlight(active + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) show();
        else highlight(active - 1);
        break;
      case "Home":
        if (open) {
          event.preventDefault();
          highlight(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          highlight(visible.length - 1);
        }
        break;
      case "Enter":
        if (open) {
          event.preventDefault();
          choose(visible[active]);
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          hide();
          input.select();
        }
        break;
      case "Tab":
        if (open) hide();
        break;
      default:
        break;
    }
  });
  list.addEventListener("mousedown", (event) => event.preventDefault());
  list.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("li[role=option]") : null;
    choose(options.find((option) => option.node === target));
  });
  chevron.addEventListener("mousedown", (event) => {
    event.preventDefault();
    input.focus();
    if (open) hide();
    else show();
  });
  combo.addEventListener("focusout", (event) => {
    if (open && !(event.relatedTarget instanceof Node && combo.contains(event.relatedTarget)))
      hide();
  });

  controls.set(select as unknown as HTMLInputElement, {
    set(value) {
      select.value = value;
      input.value = select.value;
      render();
    },
  });
}
