/**
 * Copilot Runtime for this harness.
 *
 * Shape comes from the Angular quickstart's Node runtime server, with the
 * agent swapped for the AG2 backend in `../backend`.
 *
 * That backend exposes a plain AG-UI endpoint — `AGUIStream(agent)` mounted
 * with `app.mount("/agent", stream.build_asgi())` in backend/main.py, the
 * shape the AG2 quickstart uses. It streams AG-UI events over SSE.
 *
 * The trailing slash in the URL below is load-bearing. A Starlette mount only
 * serves its own path with the slash: `POST /agent` answers `307` with a
 * `Location` of `/agent/`, and `HttpAgent` posts, does not re-post, and the
 * run dies with no events. See README known issues.
 *
 * `default` and `support` resolve to the same AG2 process.
 * `support` exists so the doc snippets that use `agentId="support"` (Chat UI,
 * Threads) run verbatim.
 *
 * `a2ui: {}` enables A2UIMiddleware for every registered agent, per
 * https://docs.copilotkit.ai/angular/ag2/backend/copilot-runtime
 * — it is a runtime-side middleware and is independent of which agent binding
 * is used.
 *
 * Ports: the quickstart puts the runtime on 8400, but backend/main.py binds
 * that, so the runtime moved to 8401. Override either side with PORT /
 * AG2_AGENT_URL.
 */
// quickstart : copilot runtime
import { createServer } from "node:http";
import { CopilotRuntime } from "@copilotkit/runtime/v2";
import { createCopilotNodeListener } from "@copilotkit/runtime/v2/node";
import { HttpAgent } from "@ag-ui/client";

const agentUrl =
  process.env["AG2_AGENT_URL"] ?? "http://localhost:8400/agent/";

// quickstart : copilot runtime start
const runtime = new CopilotRuntime({
  agents: {
    // quickstart : connect selected agent backend
    default: new HttpAgent({ url: agentUrl }),
    // chat ui : support agent
    support: new HttpAgent({ url: agentUrl }),
  },
  // a2ui : enable a2ui middleware start
  a2ui: {},
  // a2ui : enable a2ui middleware end
});
// quickstart : copilot runtime end

const port = Number(process.env["PORT"] ?? 8401);

// quickstart : create copilot node listener start
createServer(
  createCopilotNodeListener({
    runtime,
    basePath: "/api/copilotkit",
    cors: true,
  }),
).listen(port, () => {
  console.log(
    `Copilot Runtime listening at http://localhost:${port}/api/copilotkit`,
  );
  console.log(`AG2 agent: ${agentUrl}`);
});
// quickstart : create copilot node listener end
