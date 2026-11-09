// The main button names what happens (owner decision 6). The server renders the button with
// three labels; this picks one from the state of the form.
export type LabelKey = "continue" | "save" | "create";

export type LabelState = {
  // The "Create a new child theme" choice is selected.
  creating: boolean;
  // The step shows the theme choice, where picking an existing theme is not an edit.
  themeStep: boolean;
  // Some field differs from the value it had when the page loaded.
  changed: boolean;
  // The label the server rendered: "save" when the saved draft already differs from the
  // saved configuration, so restoring the page's own values returns to it.
  initial: LabelKey;
};

export function labelFor(state: LabelState): LabelKey {
  if (state.creating) return "create";
  if (state.themeStep) return "continue";
  if (state.changed) return "save";
  return state.initial === "create" ? "continue" : state.initial;
}

// Which fields differ from their initial values.
export function hasChanged(
  initial: ReadonlyMap<string, string>,
  current: ReadonlyMap<string, string>,
): boolean {
  for (const [name, value] of current) {
    if ((initial.get(name) ?? "") !== value) return true;
  }
  return false;
}
