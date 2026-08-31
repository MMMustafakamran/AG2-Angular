# Backend — AG2 over AG-UI

The agent half of the harness. An `ag2.Agent` wrapped in `AGUIStream` and
mounted on FastAPI, which is the shape the AG2 quickstart uses
([ag2ai/ag2-samples](https://github.com/ag2ai/ag2-samples)). The Angular AG2
docs never show this file's equivalent — their backend step is the literal
comment `setup skipped: agent-setup is not bundled for ag2` — so this was
written from the AG2 samples repo instead.

## Run

```bash
uv sync
uv run main.py
```

Binds `0.0.0.0:8400`. `OPENAI_API_KEY` comes from `.env`; copy `.env.example`.

| Path | Method | What |
|---|---|---|
| `/agent/` | POST | The AG-UI stream. **The trailing slash is required** — see below |
| `/health` | GET | Liveness, for the harness's connection panel |
| `/openapi.json` | GET | What `frontend/src/app/components/backend-health.ts` probes |

## The trailing slash

`app.mount("/agent", …)` is a Starlette mount, and a mount serves its own path
only with the slash. `POST /agent` answers `307` with a `Location` of
`/agent/`; `HttpAgent` posts once and does not follow it, so the run dies with
`RUN_ERROR: fetch failed`. `frontend/server.ts` therefore points at
`http://localhost:8400/agent/`.

## What AG2's AG-UI bridge does and does not do

Read the bridge itself at
`.venv/Lib/site-packages/ag2/ag_ui/stream.py` — it is short, and it is the
authority on the three findings below.

**Shared state is context variables.** There is no state schema. The bridge
publishes the agent's variables as `STATE_SNAPSHOT`, so `INITIAL_VARIABLES` in
`main.py` is what `injectAgentStore(...).state()` reads. A tool moves it by
writing `Context.variables`, which is what `update_language` does.

**Writes from the browser lose.** The bridge merges incoming state *under* the
agent's own variables — `initial_state = (incoming.state or {}) | initial_vars`
— so `agent.setState` from the Angular side is discarded for any key the agent
declares. Reads work; writes do not.

**Snapshots only at the edges.** `STATE_SNAPSHOT` is emitted once before the run
and once after, and the second only if the variables changed. There is no
`STATE_DELTA`.

**No interrupts.** The bridge imports no interrupt event type and no custom
event type, so `injectInterrupt` and `store().interruptController` can never
fire against an AG2 agent. Frontend tools do work: a tool arriving in
`RunAgentInput.tools` becomes a `ClientTool`, and its call comes back as a
`TOOL_CALL_CHUNK` that ends the run for the browser to answer.

**Validation errors are not AG-UI errors.** `build_asgi` validates
`RunAgentInput` before opening the stream, so a malformed request is a bare
`500` with the traceback in this process's log — never a `RUN_ERROR` event the
client can render.

## Probing it by hand

```bash
curl -N -X POST http://127.0.0.1:8400/agent/ \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"thread_id":"t1","run_id":"r1","messages":[{"id":"m1","role":"user","content":"What is the weather in Paris?"}],"state":{},"context":[],"tools":[],"forwarded_props":{}}'
```

Expect `RUN_STARTED`, `STATE_SNAPSHOT`, the `getWeather` tool call and result,
streamed `TEXT_MESSAGE_CONTENT`, then `RUN_FINISHED`.
