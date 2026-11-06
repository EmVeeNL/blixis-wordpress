# Roadmap status workflow

The canonical path is `New → Backlog → Ready → Busy → In Review → Done → Closed`. Exceptions are `Blocked` (with reason and blocker), `Bug` (defect/rework), and `Cancelled` (with reason). `In Review → Busy` is valid for requested changes. Content review states in the editor are separate.

| New status | Required evidence |
|---|---|
| Ready | Clear criteria, satisfied dependencies, assigned owner |
| Busy | Start date, branch when created, history entry |
| Blocked | Reason, blocker IDs, escalation owner |
| In Review | Real PR number/URL and test evidence; commit SHA when known |
| Done | Review and merge evidence, merge SHA/date, completion date |
| Closed | Release or acceptance evidence, version and close date |
| Cancelled | Reason and follow-up impact |

Use ISO dates. Update YAML, readable status history, phase index, and roadmap when status changes. Never fill a placeholder PR URL or invent a commit. Git/PR evidence determines the record. Automation may check metadata or propose changes; it must not silently mutate `main`.
