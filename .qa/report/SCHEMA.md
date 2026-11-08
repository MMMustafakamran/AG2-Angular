# assignment.json

One file per repo (each repo is handed off separately). It is the single source of truth for everything the framework HTML shows; `build.py` combines the React and Vue files of one framework into one HTML. Formal schema: [assignment.schema.json](assignment.schema.json).

```json
{
 "framework": "LangGraph JS", "ui": "react", "repo": "LangGraph-react",
 "docBase": "https://docs.copilotkit.ai/langgraph-typescript/",
 "versions": {"@copilotkit/react-core": "1.84.1", "@copilotkit/runtime": "1.84.1", "...": "..."},
 "testedContext": {"os": "Microsoft Windows 11 Pro", "packageManager": "npm 11 (Node 26.7.0)"},
 "report": {
  "style": "team", "h1": "LangGraph", "title": "LangGraph JS testing",
  "quickstartHeading": "Quickstarts", "quickstartHeader": null,
  "guidesHeading": "React Guides", "columns": ["Page/Section", "LangGraph.python", "LangGraph.js"],
  "resultColumn": 2, "clipsToUpload": true
 },
 "sections": [{"label": "Basics", "cells": ["Section", "Section"]}, {"label": "Chat", "cells": ["Sub section", "Sub Section"]}],
 "pages": [{
  "id": "human-in-the-loop-useinterrupt", "label": "Pausing the agent state for input",
  "kind": "guide", "group": "Shared State", "child": true,
  "docPath": "human-in-the-loop/useInterrupt", "reachable": "sidebar",
  "status": "❌", "findings": [1, 7, 16],
  "notes": ["Issue: page says \"Not supported on LangGraph (TypeScript)\" ...", "With the showcase graph added it works."],
  "block": null,
  "links": [{"text": "Issue", "clip": "LANGGRAPH-react-04-UseInterrupt",
             "loom": "https://www.loom.com/share/...", "narration": "narration/scripts/LANGGRAPH-react-04-UseInterrupt.json"}],
  "review": {"verdict": null, "approvedAt": null, "by": null}
 }]
}
```

## Fields

| Field | Meaning |
|---|---|
| `versions` | From the repo's FINDINGS.md `Stack:` line. The `@copilotkit/*` entries form the "Tested context" line of a hard-failure block. |
| `report.style` | `team`: LangGraph rows (emoji on its own line, then link(s), then notes), as in instructions/REPORT.md. `status`: the Antigravity section of the team doc (link text `✅ Working` / `⚠️ Partially working` / `❌ Not working`, small note). Both render with inline styles, no classes, no `<th>`. |
| `report.*` framework keys | `h1`, `title`, `style`, `quickstartHeading`, `quickstartHeader`, `clipsToUpload` are read from the **first** assignment passed to build.py; keep them identical across a framework's repos. `guidesHeading`, `columns`, `resultColumn` are per repo. |
| `sections` | Grouping rows in display order. Every section is printed (even with no pages, e.g. `Basics` as a parent), followed by the pages whose `group` equals its label. Pages with `group: null` come first. |
| `pages[]` order | Display order within a section. `kind: "quickstart"` pages go to the shared Quickstarts table (one row per repo). |
| `reachable` | `sidebar` / `in-content` (linked from page content) / `none`. `none` pages stay in the file (history, findings) but are left out of the HTML and of delivery. |
| `excluded` | Optional reason string: the owner took the page out of scope (e.g. not in the team list). Left out of the HTML, delivery and CI recording, like `none`. |
| `status` | `✅` `⚠️` `❌` (QA-RULES section 8), `N/A` (not tested, note says why), `–` (parent row with no result of its own), `python-only` (renders "The code is written only in Python."). |
| `notes` | One string per line, in order. Backticks mark code and are stripped in the HTML. |
| `block` | Hard-failure block (`Area/Surface`, `Problem`, `Tested context`, `Loom Video`). `loomInBlock: true` also puts a Loom link after "Loom Video". |
| `links[]` | One per clip shown in the cell. `text: null` derives it (`<label> - JS` for ✅, else `Issue`; status style: the status words). `clip: null` = not recorded yet: team style leaves the result cell empty (as report.py did). `loom: null` = not uploaded: the link becomes `#LOOM-<clip>` and the clip is listed under "Clips to upload". The clip id is the file stem in `3-output/<date>/deliver/` and the Loom title. |
| `review` | Owner sign-off per page. `deliver.py --only-approved` delivers only `verdict: "approved"`. |
