# qa-kit/report

Reporting and delivery stage: per-repo `assignment.json` → framework HTML for the team Google Doc, plus clip delivery for manual Loom upload. Format rules: [instructions/REPORT.md](../../instructions/REPORT.md). Data format: [SCHEMA.md](SCHEMA.md).

| File | Does |
|---|---|
| `assignment.schema.json`, `SCHEMA.md` | the per-repo data file |
| `build.py A.json [B.json] --out X.html` | framework HTML (Quickstarts, one guides table per repo, Clips to upload) |
| `compare.py old.html new.html` | diff of visible text + links, ignoring markup |
| `deliver.py --date D --from DIR...` | dry-run plan / `--apply` copy of final clips to `3-output/<D>/deliver/` + `manifest.json` |
| `apply_loom.py A.json matches.json` | writes found Loom URLs into an assignment ([loom-match.md](loom-match.md)) |

## Flow

```sh
W=C:/Users/QS/Desktop/Copilotkit; F=$W/1-frameworks; D=2026-11-08; O=$W/3-output/$D
python 2-shared/qa-kit/report/build.py $F/langgraph/react/assignment.json $F/langgraph/vue/assignment.json --out $O/report/LangGraph-testing-doc.html
python 2-shared/qa-kit/report/build.py $F/antigravity/react/assignment.json $F/antigravity/vue/assignment.json --out $O/report/Antigravity-status.html
cp $O/report/*.html $W/3-output/latest/

# clips from the downloaded CI run (3-output/<date>/runs/<repo>/), narrated mp4 preferred over raw webm
python 2-shared/qa-kit/report/deliver.py --date $D --from $O/runs/*   --only-approved $F/*/*/assignment.json            # dry run; add --apply to copy into 3-output/<date>/deliver/
# owner uploads 3-output/<date>/deliver/ to Loom → loom-match.md → apply_loom.py → build.py again
```

Notes
- Put narrated dirs first in `--from`: `.mp4` beats `.webm` anyway, and among mp4s the first dir wins. Dirs aren't searched recursively, so `_not-for-upload` folders are never picked.
- **Daily: always `deliver.py --all`** from that day's scheduled full run, upload every clip and `apply_loom.py --overwrite`, so the report links only today's videos (owner, 2026-11-09). Without `--all`, `deliver.py` copies only clips with no Loom URL; the manifest lists all, with `needs_upload`, `sha256`, and `alternatives` (other copies found).
- Two row styles exist on purpose: LangGraph uses the REPORT.md `team` style; the team doc's Google Antigravity section uses the older `status` style, which `style: "status"` reproduces (inline styles, no `<th>`/classes). Switch the Antigravity files to `team` if the owner wants REPORT.md's style there too (link texts then need setting).
- No secrets are read or printed; nothing here commits or touches the repos.
