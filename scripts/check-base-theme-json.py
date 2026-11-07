#!/usr/bin/env python3
"""Keep Base's neutral theme.json equal to the accepted generic-fonts contract."""

import json
from pathlib import Path


root = Path(__file__).resolve().parents[1]
base_path = root / "themes/blixis-base/theme.json"
golden_path = root / "docs/contracts/tokens/v1/golden/generic-fonts.theme.json"

base = json.loads(base_path.read_text(encoding="utf-8"))
golden = json.loads(golden_path.read_text(encoding="utf-8"))

if base.pop("$schema", None) != "https://schemas.wp.org/trunk/theme.json":
    raise SystemExit("Base theme.json must declare the WordPress theme.json schema")

if base != golden:
    raise SystemExit(
        "Base theme.json differs from generic-fonts.theme.json; "
        "review the token contract and update both intentionally"
    )

print("Base theme.json matches the accepted generic-fonts contract")
