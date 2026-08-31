# quickstart : connect the selected agent backend
"""AG2 agent exposed over AG-UI, for the CopilotKit Angular harness.

Shape comes from the AG2 quickstart's backend
(https://docs.copilotkit.ai/ag2/quickstart, ag2ai/ag2-samples `weather.py`):
an `ag2.Agent`, wrapped in `AGUIStream`, mounted on FastAPI as an ASGI
endpoint that streams AG-UI events over SSE.

The tools here are the ones the Angular guide pages call for, not the samples
repo's Open-Meteo set:

* `getWeather` — the server-side tool the Frontend tools & generative UI guide
  renders with an Angular component.
* `update_language` — the write half of the Shared state guide. AG2 has no
  `state_schema`; shared state is the agent's context variables, and a tool
  mutates them through `Context`.

Port 8400, so the Copilot Runtime (8401) and the other harnesses in this
workspace can run beside it.
"""
from __future__ import annotations

import os
from typing import Annotated

import uvicorn
from ag2 import Agent, Context, Variable, tool
from ag2.ag_ui import AGUIStream
from ag2.config import OpenAIConfig
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import Field

load_dotenv()

# shared state : agent variables start
# AG2's AG-UI bridge publishes the agent's context variables as the AG-UI
# STATE_SNAPSHOT, so this dict is what `injectAgentStore(...).state()` reads on
# the Angular side. There is no separate state schema to declare.
INITIAL_VARIABLES: dict[str, object] = {
    "language": "english",
}
# shared state : agent variables end


# frontend tools : server tool getWeather start
@tool(
    name="getWeather",
    description="Get the weather for a location.",
)
def get_weather(
    location: Annotated[str, Field(description="The location to get weather for")],
) -> str:
    normalized = location.strip() or "the requested location"
    return f"The weather for {normalized} is 70 degrees."
# frontend tools : server tool getWeather end


# shared state : update language tool start
@tool(
    name="update_language",
    description="Set the user's preferred language: 'english' or 'spanish'.",
)
def update_language(
    language: Annotated[
        str, Field(description="Preferred language: 'english' or 'spanish'")
    ],
    context: Context,
) -> str:
    normalized = (language or "").strip().lower()
    if normalized not in ("english", "spanish"):
        return "Language unchanged. Use 'english' or 'spanish'."
    # Writing the context variable is what moves shared state: the bridge emits
    # a STATE_SNAPSHOT after the run when the variables differ from the ones it
    # started with.
    context.variables["language"] = normalized
    return f"Language updated to {normalized}."
# shared state : update language tool end


def _build_config() -> OpenAIConfig:
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("Set OPENAI_API_KEY (see backend/.env.example).")
    return OpenAIConfig(
        model=os.getenv("OPENAI_CHAT_MODEL_ID", "gpt-4o-mini"),
        api_key=os.getenv("OPENAI_API_KEY"),
        streaming=True,
    )


# shared state : prompt reads the shared variable start
def system_prompt(language: Annotated[str, Variable(default="english")]) -> str:
    """A callable prompt, so the agent reads shared state on every turn.

    AG2 resolves a `Variable`-annotated parameter from the same context
    variables the AG-UI bridge publishes as STATE_SNAPSHOT. That makes the
    agent-owned half of shared state real: `update_language` writes the
    variable, the bridge emits the new snapshot, and this prompt reads it back
    on the next turn.

    It does NOT pick up a write from the browser. The bridge merges incoming
    AG-UI state *under* the agent's variables --
    `initial_state = (incoming.state or {}) | initial_vars` in
    ag2/ag_ui/stream.py -- so `language` always resolves to the agent's value
    and `agent.setState` from the Angular side is discarded. Verified end to
    end: posting `state: {"language": "spanish"}` runs as english and the first
    snapshot echoes english back. That is the Shared state guide's central
    claim failing, and it is left as-is on purpose.
    """
    return (
        "You are a helpful assistant. Answer with the available tools; each "
        "tool's own description says when it applies. "
        f"The user's preferred language is {language}. Reply in that language. "
        "When the user asks to change it, call update_language."
    )
# shared state : prompt reads the shared variable end


# quickstart : ag2 agent start
agent = Agent(
    "CopilotKitAG2Agent",
    prompt=system_prompt,
    config=_build_config(),
    tools=[get_weather, update_language],
    variables=INITIAL_VARIABLES,
)
# quickstart : ag2 agent end

app = FastAPI(title="CopilotKit + AG2 (Python)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe for the harness's backend-health component."""
    return {"status": "ok", "agent": "CopilotKitAG2Agent", "path": "/agent"}


# quickstart : mount the ag-ui stream start
stream = AGUIStream(agent)
app.mount("/agent", stream.build_asgi())
# quickstart : mount the ag-ui stream end

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8400, reload=True)
