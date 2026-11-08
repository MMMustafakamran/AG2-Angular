# Per-clip evidence (schema 2)

Every recorded clip `<clip>.webm` gets three files beside it. They are written by
`core/timeline.ts` and are **logging only**: nothing that produces them changes what the
doc code does, retries anything, hides an error, or puts anything on screen.

| File | What |
|---|---|
| `<clip>.timeline.json` | Segments (`marks`), expectations (`checkpoints`), screenshots index (`keyframes`) |
| `<clip>.events.jsonl` | Everything that happened, one JSON object per line |
| `<clip>.frames/NNN-<label>.jpg` | Viewport screenshots, one per mark and per checkpoint |

`t` everywhere is **seconds from the start of the video, one decimal**. The clock starts when
the recorded page is created, which is when Playwright starts the video.

## 1. `<clip>.timeline.json`

```json
{
  "schema": 2,
  "clip": "LANGGRAPH-react-04-UseInterrupt",
  "video": "LANGGRAPH-react-04-UseInterrupt.webm",
  "durationS": 121.4,
  "recordedAt": "2026-11-07T16:40:00.000Z",
  "page": { "slug": "use-interrupt", "docUrl": "https://docs.copilotkit.ai/..." },
  "marks": [{ "t": 0, "label": "doc", "detail": "optional" }],
  "checkpoints": [
    { "t": 40.2, "label": "interrupt", "expect": "interrupt prompt visible", "observed": "Tomorrow 2:00 PM", "ok": true }
  ],
  "keyframes": [{ "t": 34.0, "label": "demo", "file": "LANGGRAPH-react-04-UseInterrupt.frames/003-demo.jpg" }]
}
```

- `schema` — `2`. Schema 1 files are `{clip, marks}` only; `marks` is unchanged, so a schema-1
  reader still works.
- `durationS` — time of the `end` mark (the page closes, and the video ends, right after).
- `recordedAt` — ISO-8601, when the clock started.
- `page.slug` — page id from `config/pages.config.ts` (CLI flows: the flow id). `docUrl` is absent
  when the take had no doc page.
- `marks` — in time order. Repeats are allowed; narration addresses the n-th one as `label#n`
  (1-based, e.g. `demo#2`).
- `checkpoints` — in time order. `observed` is the text the probe read (trimmed, ≤ 500 chars),
  `"true"`/`"false"` for a yes/no probe, or `null` when the thing was missing. `ok` is the probe's
  own judgement. **It is evidence, not the verdict**: the page's PASS/FAIL is still what the
  handler reported through `ctx` (`videos/RECORD_RESULTS.json`).
- `keyframes` — in time order; `file` is relative to the timeline's folder. A keyframe's `t` is
  when the shot was taken, which for segment marks is a little after the mark (below).

### Mark labels

| Label | When |
|---|---|
| `doc` | Doc page segment starts (navigation to docs.copilotkit.ai) |
| `ide` | Simulated VS Code segment starts |
| `terminal` | A terminal replay starts (dev-server boot, or a CLI-flow segment; `detail` = title) |
| `demo` | Demo segment starts. Repeats when a scripted take opens another route (`detail` = path) |
| `action` | The page handler starts driving the demo (just after `demo`, once the chat is ready) |
| `click` | A notable single click inside a handler (Frontend Cards) |
| `error` | A run-error banner was detected; the clip opens its details next |
| `evidence` | Back on the doc page pointing at one defect (`detail` = the text highlighted); one per spot |
| `notepad` | Notepad opens and the note is typed |
| `notepad-closed` | Notepad closed |
| `failure` | The take failed; the error terminal (failure evidence) follows (`detail` = error, ≤ 160 chars) |
| `end` | Last mark, just before the page closes |

Consumers should treat unknown labels as opaque rather than reject them.

### Checkpoint labels used by the LangGraph actions

| Label | Expectation |
|---|---|
| `reply` | An assistant reply rendered (observed = last assistant message text) |
| `interrupt` | The interrupt UI is visible (time-slot button / interrupt form) |
| `tool` | A tool's effect is visible (background changed, notes panel written, sub-agent calls logged) |
| `card` / `surface` | An activity card / generative-UI surface rendered |
| `text` / `done` | Scripted waits: a text appeared / a progress label went away |
| `inspector` | The web inspector is present / a pane opened |
| `error` | Run-error details are readable (observed = banner text) |
| `evidence` | The defect text was found on the doc page (observed = the element's text, null = not found) |
| `render` | (standard take) the page's `demo.render` selector rendered |

## 2. `<clip>.events.jsonl`

One JSON object per line, sorted by `t` (ties keep the order they happened in). Every object has
`t` and `kind`:

| `kind` | Other fields |
|---|---|
| `action` | `action` (`click` / `scroll` / `type` / `select` / `select-text` / `key` / `submit`), `target` (locator description, selector, `taskbar:<app>`, `notepad`, or the text scrolled to), `result` (`ok` / `error`), `error` when it failed, plus `text` / `value` / `pixels` / `attempt` where relevant |
| `console` | `level` (`log`, `info`, `warning`, `error`, `debug`, ...), `text`, `source` (`url:line`, when known) |
| `pageerror` | `message`, `stack` (uncaught exceptions in the page) |
| `network` | `method`, `url`, `status` (HTTP status ≥ 400, or `null` for a failed request with `error`, e.g. `net::ERR_ABORTED`). Successful requests are not logged |
| `navigation` | `url` (main frame only) |
| `mark` | `label`, `detail` — same as in the timeline |
| `checkpoint` | `label`, `expect`, `observed`, `ok` — same as in the timeline |

Notes:

- Console, page errors and network are recorded for the **whole** clip, the doc site included.
  docs.copilotkit.ai logs its own hydration errors on every load; use the marks to tell which
  segment an event belongs to. (The take's PASS/FAIL error checks still only look at the demo
  segment.) The listeners sit on the browser context, so a handler that clears the page's own
  listeners does not silence this log.
- Text fields are cut at 2000 characters (`…` appended).
- `target` for a Playwright locator is its own description, e.g. `getByText('Show Details', { exact: true }).first()`.

## 3. `<clip>.frames/`

`NNN-<label>.jpg`: viewport screenshots (1920×1080, JPEG quality 55), numbered in time order, one
at every mark (except `end`, which gets one shot just before the page closes, labelled `end`) and
one per checkpoint, taken by Playwright's `page.screenshot`, which does not appear in the video.
The folder is replaced on a re-record.

Segment marks fire just before their segment's navigation or window switch, so their shot waits:
`doc` 1.5 s, `ide` 1.8 s, `demo` 2.5 s, `terminal` 1.5 s. Screenshots are fire-and-forget (the take
never waits for one); a shot that fails (page navigating, closed) is simply missing from
`keyframes`.

## API (`core/timeline.ts`)

```ts
startTimeline(page?)                 // engine: when the recorded page is created
setTimelinePage(slug, docUrl?)       // engine
mark(label, detail?)                 // a segment starts; also a frame
checkpoint(label, expect, probe, { ok? }?)  // returns a promise; handlers call it with `void`
probeText(locator)                   // probe helper: visible text of the first match, or null
logAction(action, target, result?, extra?)  // an action for events.jsonl
tracked(action, target, fn, extra?)  // run fn, log ok/error, return or rethrow exactly as fn did
endTimeline()                        // engine: before page.close (last frame, pending probes)
saveTimeline(timelinePath, clipId)   // engine: after the video is saved
```

`checkpoint` never throws, never retries, and gives up on a probe after 3 s (observed `null`).
A probe must only read the page.
