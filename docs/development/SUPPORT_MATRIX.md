# Support matrix

**Status: provisional.** Task `01-02` must test and pin exact WordPress, PHP, Node, browser, React, Tailwind v4, and drag/drop versions. The current local site and CI syntax check are not a supported-version matrix.

| Component | Intended policy | Verification |
|---|---|---|
| WordPress and PHP | Supported stable combinations, pinned after spike | WordPress integration and PHP CI matrix |
| Node | One tested LTS line | Lockfile and build CI |
| Browsers | Current Chrome, Firefox, Safari, Edge | Cross-browser editor tests |
| Tailwind CSS | v4.x pinned in lockfile | CSS contract/build tests |
| Drag/drop | Select package after compatibility spike | Nested pointer and keyboard tests |
