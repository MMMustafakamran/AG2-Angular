# Matching uploaded Loom videos to clips

For the orchestrating Claude, after the owner has uploaded `3-output/<date>/deliver/*` to Loom by hand. Loom titles a video with its file name, so a clip's Loom title is its clip id (e.g. `LANGGRAPH-react-04-UseInterrupt`), unless the owner renamed it.

## Steps

1. **Worklist.** Read `3-output/<date>/deliver/manifest.json`. The clips to find are the entries with `needs_upload: true` and a `source`. Note each `repo` → its assignment.json.
2. **Site.** Call `getAccessibleAtlassianResources` once (Atlassian MCP) and reuse the `cloudId`.
3. **Find the videos.**
   - Preferred: `discover` with a goal like "list my Loom videos" to get the Loom listing operation (the Loom tools reference `listLoomObjects`), then run it with `executeRead({name, cloudId, inputs})`. Page through recent videos (uploaded since the delivery date) and collect `title` + share URL.
   - Fallback: `search` (Rovo, `targetApp: "THIRD_PARTY"` or `ALL`) with the clip id in double quotes, e.g. `"LANGGRAPH-react-04-UseInterrupt"`, one clip per query.
   - Confirm a candidate with `getLoomObjectsContent({cloudId, identifiers: [<share URL>...]})` (max 10 per call, no `expand` needed): the title must equal the clip id (ignore case, a trailing ` (1)` or file extension).
4. **Rules.**
   - Exact title match only. Several videos with the same title: take the newest and list the others for the owner, do not guess.
   - No match: leave `loom` null and report the clip as not found.
   - Store the plain share URL `https://www.loom.com/share/<32 hex>` (no query string, no embed URL).
5. **Write.** Per repo, write `matches.json` (`{"<clip id>": "<share URL>"}`) to the scratchpad and run
   `python 2-shared/qa-kit/report/apply_loom.py <repo>/assignment.json matches.json` (first with `--dry-run`). It never overwrites an existing different URL without `--overwrite`; use that only when the owner says the clip was re-uploaded.
6. **Rebuild.** `python 2-shared/qa-kit/report/build.py LangGraph-react/assignment.json LangGraph-vue/assignment.json --out 3-output/latest/LangGraph-testing-doc.html` (same for Antigravity). Check that "Clips to upload" is empty, or lists only the clips reported as not found.
7. **Report** to the owner: matched, not found, duplicates.
