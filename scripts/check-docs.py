#!/usr/bin/env python3
"""Validate local Markdown links and roadmap metadata without dependencies."""
from pathlib import Path
import re
import sys
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
TASK_ROOT = DOCS / "roadmap" / "phases"
REQUIRED = {"id", "title", "phase", "status", "priority", "depends_on", "branch", "pr_number", "pr_url", "commit_sha", "started_at", "completed_at", "closed_at"}
STATUSES = {"New", "Backlog", "Ready", "Busy", "Blocked", "In Review", "Bug", "Done", "Closed", "Cancelled"}
errors = []
ids = {}
dependencies = {}
for path in [ROOT / "README.md", ROOT / "AGENTS.md", ROOT / "CONTRIBUTING.md", *DOCS.rglob("*.md")]:
    content = path.read_text(encoding="utf-8")
    for target in re.findall(r"(?<!!)\[[^\]]+\]\(([^)]+)\)|!\[[^\]]*\]\(([^)]+)\)", content):
        url = next(v for v in target if v).split("#", 1)[0]
        if not url or re.match(r"^[a-z]+://", url):
            continue
        link = (path.parent / unquote(url)).resolve()
        if not link.exists():
            errors.append(f"{path.relative_to(ROOT)}: missing link {url}")
    if TASK_ROOT not in path.parents or path.name == "_index.md":
        continue
    if not content.startswith("---\n"):
        errors.append(f"{path.relative_to(ROOT)}: missing frontmatter")
        continue
    front = content.split("---", 2)[1]
    fields = dict(re.findall(r"^([a-z_]+):\s*(.*)$", front, re.M))
    for field in sorted(REQUIRED - fields.keys()):
        errors.append(f"{path.relative_to(ROOT)}: missing {field}")
    task_id = fields.get("id", "").strip('"')
    if task_id in ids:
        errors.append(f"duplicate task ID {task_id}: {path} and {ids[task_id]}")
    ids[task_id] = path
    if fields.get("status") not in STATUSES:
        errors.append(f"{path.relative_to(ROOT)}: invalid status")
    dependencies[task_id] = re.findall(r'"([A-Z0-9-]+)"', fields.get("depends_on", ""))
    if fields.get("status") in {"Done", "Closed"} and fields.get("completed_at") == "null":
        errors.append(f"{path.relative_to(ROOT)}: completed status without date")
for task_id, deps in dependencies.items():
    for dep in deps:
        if dep not in ids:
            errors.append(f"{task_id}: unknown dependency {dep}")
if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)
print(f"Documentation links and {len(ids)} unique roadmap tasks OK")
