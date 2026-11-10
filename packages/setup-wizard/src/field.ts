// Finding the parts of a server-rendered field, and the registry the controls share.
import { uid } from "./dom.ts";

export type Parts = {
  wrap: HTMLElement;
  label: HTMLLabelElement;
  hint: HTMLElement | null;
  control: HTMLElement | null;
  section: string;
  key: string;
};

export type Control = {
  // Shows a value that a script (not the user) chose, without raising events.
  set: (value: string) => void;
};

// Controls by their form input, for scripts that change another control's value.
export const controls = new WeakMap<HTMLInputElement, Control>();

export function partsOf(input: HTMLElement): Parts | null {
  const wrap = input.closest<HTMLElement>(".blixis-setup-field");
  const id = input.id;
  const label = wrap?.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`) ?? null;
  const section = input.dataset["section"];
  const key = input.dataset["key"];
  if (wrap === null || label === null || section === undefined || key === undefined) return null;
  if (label.id === "") label.id = uid("blixis-label");
  return {
    wrap,
    label,
    hint: wrap.querySelector<HTMLElement>(`#${CSS.escape(id)}-hint`),
    control: input.closest<HTMLElement>(".blixis-setup-control"),
    section,
    key,
  };
}

// The text input hands its id, description and error state to a replacement control.
export function describedBy(input: HTMLInputElement): string | undefined {
  const value = input.getAttribute("aria-describedby");
  return value === null || value === "" ? undefined : value;
}
