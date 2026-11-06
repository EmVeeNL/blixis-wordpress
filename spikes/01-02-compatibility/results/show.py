#!/usr/bin/env python3
"""Summarize results/wordpress-matrix.jsonl. Exits 1 when an expectation failed."""
import json, pathlib
bad = 0
for line in (pathlib.Path(__file__).parent / "wordpress-matrix.jsonl").read_text().splitlines():
    d = json.loads(line); m = d.get("meta", {})
    if not str(m.get("php", "")).startswith(str(m.get("requested_php", "?"))):
        print(f'WRONG RUNTIME: requested PHP {m.get("requested_php")}, ran {m.get("php")}'); bad += 1
    if m.get("expect") == "reject":
        ok = m["plugin_rc"] != 0 or m["theme_rc"] != 0
        print(f'WP {m["wp"]} PHP {m["php"]}: rejected={ok} plugin_rc={m["plugin_rc"]} theme_rc={m["theme_rc"]} | {m["plugin_out"][:110]} | {m["theme_out"][:110]}')
        bad += not ok
        continue
    s = d.get("smoke") or {}
    fails = [c for c in s.get("checks", []) if not c["ok"]]
    n = len(s.get("checks", []))
    print(f'WP {m.get("wp")} PHP {m.get("php")} DB {m.get("db")}: {n-len(fails)}/{n} plugin_rc={m.get("plugin_rc")} theme_rc={m.get("theme_rc")} home={d.get("base_home_status")} debug_lines={d.get("debug",{}).get("lines")} own={len(d.get("debug",{}).get("blixis_lines",[]))} obs={s.get("observed")}')
    for f in fails: print("   FAIL", f["name"], f["detail"])
    if d.get("smoke_stderr"): print("   STDERR", d["smoke_stderr"][:300])
    if d.get("debug",{}).get("sample"): print("   LOG", d["debug"]["sample"][:3])
    bad += bool(fails) or n == 0 or m.get("plugin_rc") != 0 or m.get("theme_rc") != 0
print("FAILED" if bad else "ALL EXPECTATIONS MET")
raise SystemExit(1 if bad else 0)
