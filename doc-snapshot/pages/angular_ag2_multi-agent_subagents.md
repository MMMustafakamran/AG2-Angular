# Sub-Agents

> Decompose work across multiple specialized agents with a visible delegation log.


<!-- interactive demo: subagents -->


## What is this?

Sub-agents are the canonical multi-agent pattern: a top-level
**supervisor** LLM orchestrates one or more specialized **sub-agents**
by exposing each of them as a tool. The supervisor decides what to
delegate, the sub-agents do their narrow job, and their results flow
back up to the supervisor's next step.

This is fundamentally the same shape as tool-calling, but each "tool"
is itself a full-blown agent with its own system prompt and (often) its
own tools, memory, and model.

## When should I use this?

Reach for sub-agents when a task has distinct specialized sub-tasks
that each benefit from their own focus:

- **Research → Write → Critique** pipelines, where each stage needs a
  different system prompt and temperature.
- **Router + specialists**, where one agent classifies the request and
  dispatches to the right expert.
- **Divide-and-conquer** — any problem that fits cleanly into parallel
  or sequential sub-problems.

The example below uses the Research → Write → Critique shape as the
canonical example.

## Setting up sub-agents

<!-- setup skipped: subagents-setup is not bundled for ag2 -->

Each sub-agent is an isolated agent call with its own model, system
prompt, and optional tools. They don't share memory or tools with the
supervisor; the supervisor only ever sees what the sub-agent returns.

```python
# src/agents/subagents.py
import logging
import uuid
from textwrap import dedent
from typing import List, Literal

from ag2 import Agent, Context, tool
from ag2.ag_ui import AGUIStream
from ag2.config.openai import OpenAIResponsesConfig
from fastapi import FastAPI
from pydantic import BaseModel, Field

from ._loop_cap import loop_cap
from ._state import publish_state

logger = logging.getLogger(__name__)


SubAgentName = Literal["research_agent", "writing_agent", "critique_agent"]
DelegationStatus = Literal["running", "completed", "failed"]


class Delegation(BaseModel):
    """One entry in the delegation log shown by the UI."""

    id: str
    sub_agent: SubAgentName
    task: str
    status: DelegationStatus = "completed"
    result: str = ""


class SubagentsSnapshot(BaseModel):
    """Shape of the shared `delegations` state slot rendered by the UI."""

    delegations: List[Delegation] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Sub-agents (real AG2 Agents under the hood)
# ---------------------------------------------------------------------------
#
# Each sub-agent is its own LLM Agent with a focused system
# prompt. They don't share memory or tools with the supervisor — the
# supervisor only sees what each sub-agent's final reply produces.

_SUB_LLM_CONFIG = OpenAIResponsesConfig(model="gpt-6-luna", streaming=False)

_research_agent = Agent(
    "research_sub_agent",
    prompt=dedent(
        """
        You are a research sub-agent. Given a topic, produce a concise
        bulleted list of 3-5 key facts. No preamble, no closing.
        """
    ).strip(),
    config=_SUB_LLM_CONFIG,
    middleware=[loop_cap(1)],
)

_writing_agent = Agent(
    "writing_sub_agent",
    prompt=dedent(
        """
        You are a writing sub-agent. Given a brief and optional source
        facts, produce a polished 1-paragraph draft. Be clear and
        concrete. No preamble.
        """
    ).strip(),
    config=_SUB_LLM_CONFIG,
    middleware=[loop_cap(1)],
)

_critique_agent = Agent(
    "critique_sub_agent",
    prompt=dedent(
        """
        You are an editorial critique sub-agent. Given a draft, produce
        2-3 crisp, actionable critiques. No preamble.
        """
    ).strip(),
    config=_SUB_LLM_CONFIG,
    middleware=[loop_cap(1)],
)
```

Keep sub-agent system prompts narrow and focused. The point of this pattern
is that each one does one thing well. If a sub-agent needs to know
the whole user context to do its job, that's a signal the boundary is
wrong.

## Exposing sub-agents as tools

The supervisor delegates by calling tools. Each delegation tool is a thin
wrapper around a specialized agent call that:

1. Runs the sub-agent on the supplied `task` string.
2. Records the delegation into a `delegations` slot in shared agent
   state (so the UI can render a live log).
3. Returns the sub-agent's final message as the tool result, which the
   supervisor sees on its next turn.

```python
# src/agents/subagents.py
import logging
import uuid
from textwrap import dedent
from typing import List, Literal

from ag2 import Agent, Context, tool
from ag2.ag_ui import AGUIStream
from ag2.config.openai import OpenAIResponsesConfig
from fastapi import FastAPI
from pydantic import BaseModel, Field

from ._loop_cap import loop_cap
from ._state import publish_state

logger = logging.getLogger(__name__)


SubAgentName = Literal["research_agent", "writing_agent", "critique_agent"]
DelegationStatus = Literal["running", "completed", "failed"]


class Delegation(BaseModel):
    """One entry in the delegation log shown by the UI."""

    id: str
    sub_agent: SubAgentName
    task: str
    status: DelegationStatus = "completed"
    result: str = ""


class SubagentsSnapshot(BaseModel):
    """Shape of the shared `delegations` state slot rendered by the UI."""

    delegations: List[Delegation] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Sub-agents (real AG2 Agents under the hood)
# ---------------------------------------------------------------------------
#
# Each sub-agent is its own LLM Agent with a focused system
# prompt. They don't share memory or tools with the supervisor — the
# supervisor only sees what each sub-agent's final reply produces.

_SUB_LLM_CONFIG = OpenAIResponsesConfig(model="gpt-6-luna", streaming=False)

_research_agent = Agent(
    "research_sub_agent",
    prompt=dedent(
        """
        You are a research sub-agent. Given a topic, produce a concise
        bulleted list of 3-5 key facts. No preamble, no closing.
        """
    ).strip(),
    config=_SUB_LLM_CONFIG,
    middleware=[loop_cap(1)],
)

_writing_agent = Agent(
    "writing_sub_agent",
    prompt=dedent(
        """
        You are a writing sub-agent. Given a brief and optional source
        facts, produce a polished 1-paragraph draft. Be clear and
        concrete. No preamble.
        """
    ).strip(),
    config=_SUB_LLM_CONFIG,
    middleware=[loop_cap(1)],
)

_critique_agent = Agent(
    "critique_sub_agent",
    prompt=dedent(
        """
        You are an editorial critique sub-agent. Given a draft, produce
        2-3 crisp, actionable critiques. No preamble.
        """
    ).strip(),
    config=_SUB_LLM_CONFIG,
    middleware=[loop_cap(1)],
)


async def _invoke_sub_agent(sub_agent: Agent, task: str) -> str:
    """Run a sub-agent on `task` and return its final reply text.

    `ask` runs one turn against a one-shot user message on the sub-agent's
    own stream, so none of its events leak into the supervisor's AG-UI run.
    """
    reply = await sub_agent.ask(task)
    return reply.body or ""


def _load_snapshot(ctx: Context) -> SubagentsSnapshot:
    """Best-effort load of the SubagentsSnapshot from the run's variables.

    Logs at WARNING when state fails validation so silent corruption is
    visible in server logs instead of degrading to an empty snapshot
    without a trace.
    """
    data = dict(ctx.variables)
    try:
        return SubagentsSnapshot.model_validate(data)
    except Exception as exc:
        logger.warning(
            "subagents: failed to validate SubagentsSnapshot from run "
            "variables (%s: %s); falling back to empty snapshot",
            exc.__class__.__name__,
            exc,
        )
        return SubagentsSnapshot()


async def _record_delegation(
    ctx: Context,
    sub_agent: SubAgentName,
    task: str,
    result: str,
    status: DelegationStatus = "completed",
) -> str:
    """Append a delegation entry to shared state, publish it, return the result."""
    snapshot = _load_snapshot(ctx)
    snapshot.delegations.append(
        Delegation(
            id=str(uuid.uuid4()),
            sub_agent=sub_agent,
            task=task,
            status=status,
            result=result,
        )
    )
    ctx.variables.update(snapshot.model_dump())
    await publish_state(ctx)
    return result


async def _run_delegation(
    ctx: Context,
    sub_agent_name: SubAgentName,
    sub_agent: Agent,
    task: str,
) -> str:
    """Invoke a sub-agent and record the outcome (completed or failed).

    If the underlying ``ask`` raises (transport error, quota,
    SDK bug, ...), we record the delegation with ``status='failed'`` and
    return a sane result string so the supervisor can recover instead of
    crashing the turn. The full traceback is logged server-side; the
    user-facing ``result`` text only mentions the exception class to
    avoid leaking internals.
    """
    try:
        result = await _invoke_sub_agent(sub_agent, task)
    except Exception as exc:
        logger.exception(
            "subagents: sub-agent %s failed while handling task", sub_agent_name
        )
        failure_message = (
            f"sub-agent call failed: {exc.__class__.__name__} (see server logs)"
        )
        return await _record_delegation(
            ctx,
            sub_agent_name,
            task,
            failure_message,
            status="failed",
        )

    return await _record_delegation(
        ctx,
        sub_agent_name,
        task,
        result,
        status="completed",
    )


# ---------------------------------------------------------------------------
# Supervisor tools (each tool delegates to one sub-agent)
# ---------------------------------------------------------------------------


# Each @tool wraps a sub-agent invocation. The supervisor LLM "calls"
# these tools to delegate work; each call asynchronously runs the
# matching sub-agent, records the delegation into shared state via the
# run's variables, and returns the sub-agent's text the supervisor reads
# as its tool output on the next step.
@tool
async def research_agent(
    ctx: Context,
    task: str,
) -> str:
    """Delegate a research task to the research sub-agent.

    Use for: gathering facts, background, definitions, statistics. Returns
    a bulleted list of key facts.

    Args:
        task: The specific research question or topic to investigate.
    """
    return await _run_delegation(ctx, "research_agent", _research_agent, task)


@tool
async def writing_agent(
    ctx: Context,
    task: str,
) -> str:
    """Delegate a drafting task to the writing sub-agent.

    Use for: producing a polished paragraph, draft, or summary. Pass
    relevant facts from prior research inside ``task``.

    Args:
        task: The brief plus any relevant facts the writer should use.
    """
    return await _run_delegation(ctx, "writing_agent", _writing_agent, task)


@tool
async def critique_agent(
    ctx: Context,
    task: str,
) -> str:
    """Delegate a critique task to the critique sub-agent.

    Use for: reviewing a draft and suggesting concrete improvements.

    Args:
        task: The draft to critique (paste it directly into ``task``).
    """
    return await _run_delegation(ctx, "critique_agent", _critique_agent, task)


```

This is where CopilotKit's shared-state channel earns its keep: the
supervisor's tool calls mutate `delegations` as they happen, and the
frontend renders every new entry live.

<Callout type="warn">
  Give every delegation a stable `id` and merge new entries by that `id`. The
  client sends its copy of shared state back as run input on every run, so a
  slot that blindly appends whatever it receives — a LangGraph
  `Annotated[list, operator.add]` reducer, for example — concatenates the
  entries the client just echoed onto the ones the agent already has, and the
  log doubles when a thread is continued.
</Callout>

## Rendering a live delegation log

On the frontend, the delegation log is a reactive render of the
`delegations` slot.




Read the selected agent's state through `injectAgentStore`, derive the
delegations with `computed`, and register one typed renderer for each sub-agent
tool. The Angular Showcase uses this source:

```typescript
// features/agent-state/agent-state-feature.component.ts
  private readonly agentStore = injectAgentStore(this.agentId);
  protected readonly delegations = computed(() =>
    readDelegations(this.agentStore().state()),
  );

  constructor() {
    if (this.feature === "subagents") {
      this.registerSubAgent("research_agent");
      this.registerSubAgent("writing_agent");
      this.registerSubAgent("critique_agent");
    }
  }

  private registerSubAgent(name: SubAgentName): void {
    registerRenderToolCall(subAgentRendererConfig(name));
  }
```


The result: as the supervisor fans work out to its sub-agents, the log
grows in real time, giving the user visibility into a process that
would otherwise be a long opaque spinner.

## Related

- **[Shared State](/angular/ag2/guides/shared-state)** — the channel that makes the
  delegation log live.
- **[State streaming](/angular/ag2/guides/shared-state)** — stream
  *individual* sub-agent outputs token-by-token inside each log entry.
