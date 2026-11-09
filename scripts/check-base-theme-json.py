#!/usr/bin/env python3
"""Keep Base's neutral theme.json consistent with the accepted generic-fonts contract.

Base `settings` must equal the golden `settings` exactly (the presets are the token
contract). The golden `styles` must be a subset of Base `styles`: Base may add
preset-driven styles (typography, headings, links, buttons, block gap) on top of them.
Every `var:preset|<type>|<slug>` reference in Base styles must name a preset that
Base defines.
"""

import json
from pathlib import Path


root = Path(__file__).resolve().parents[1]
base_path = root / "themes/blixis-base/theme.json"
golden_path = root / "docs/contracts/tokens/v2/golden/generic-fonts.theme.json"

base = json.loads(base_path.read_text(encoding="utf-8"))
golden = json.loads(golden_path.read_text(encoding="utf-8"))

if base.pop("$schema", None) != "https://schemas.wp.org/trunk/theme.json":
    raise SystemExit("Base theme.json must declare the WordPress theme.json schema")

# Template-part registration is theme structure, not part of the shared token
# contract represented by the generic-fonts golden file.
template_parts = base.pop("templateParts", None)
if template_parts != [
    {"name": "header", "area": "header"},
    {"name": "footer", "area": "footer"},
]:
    raise SystemExit("Base theme.json must register the header and footer parts")

if base.get("version") != golden.get("version"):
    raise SystemExit("Base theme.json version differs from the generic-fonts golden")

if base.get("settings") != golden.get("settings"):
    raise SystemExit(
        "Base theme.json settings differ from generic-fonts.theme.json; "
        "review the token contract and update both intentionally"
    )


def missing(expected, actual, path="styles"):
    """Paths in `expected` that `actual` lacks or holds with another value."""
    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            return [path]
        out = []
        for key, value in expected.items():
            if key not in actual:
                out.append(f"{path}.{key}")
            else:
                out.extend(missing(value, actual[key], f"{path}.{key}"))
        return out
    return [] if expected == actual else [path]


gaps = missing(golden.get("styles", {}), base.get("styles", {}))
if gaps:
    raise SystemExit(
        "Base theme.json styles must include the generic-fonts golden styles; "
        "missing or different: " + ", ".join(gaps)
    )

# Preset reference types in styles and the settings that define them.
PRESET_DEFINITIONS = {
    "color": ("color", "palette"),
    "font-family": ("typography", "fontFamilies"),
    "font-size": ("typography", "fontSizes"),
    "spacing": ("spacing", "spacingSizes"),
    "border-radius": ("border", "radiusSizes"),
    "shadow": ("shadow", "presets"),
}
settings = base.get("settings", {})
defined = {
    kind: {entry["slug"] for entry in settings.get(group, {}).get(key, [])}
    for kind, (group, key) in PRESET_DEFINITIONS.items()
}


def references(value):
    if isinstance(value, dict):
        for item in value.values():
            yield from references(item)
    elif isinstance(value, list):
        for item in value:
            yield from references(item)
    elif isinstance(value, str) and value.startswith("var:preset|"):
        yield value


for reference in references(base.get("styles", {})):
    parts = reference.split("|")
    if len(parts) != 3 or parts[1] not in defined or parts[2] not in defined[parts[1]]:
        raise SystemExit(f"Base styles point at a preset Base does not define: {reference}")

print("Base theme.json settings match the generic-fonts contract; styles extend it with defined presets")
