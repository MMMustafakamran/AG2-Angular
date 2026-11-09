// HARNESS: the "server.ts" of https://docs.copilotkit.ai/ag2/generative-ui/components (Angular tab,
// step 2 "Add the runtime and an agent"), verbatim except the port. Kept as its own file because
// frontend/server.ts is the quickstart's AG2 runtime (8240). Used by every Components and surfaces
// page (the child pages only say "your runtime needs no change"). Start: npx tsx components-runtime.ts
// The doc says to `export OPENAI_API_KEY=sk-...` in the terminal; start-all.sh loads backend/.env.
import { createServer } from "node:http";
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import {
  BuiltInAgent,
  convertInputToTanStackAI,
  CopilotRuntime,
  InMemoryAgentRunner,
} from "@copilotkit/runtime/v2";
import { createCopilotNodeListener } from "@copilotkit/runtime/v2/node";

const agent = new BuiltInAgent({
  type: "tanstack",
  factory: ({ input, abortController }) => {
    const { messages, systemPrompts, tools } = convertInputToTanStackAI(input);
    return chat({
      adapter: openaiText("gpt-6-luna"),
      messages,
      systemPrompts: [
        "You are a helpful assistant. When a visual answer helps, render it with generative UI.",
        ...systemPrompts,
      ],
      tools,
      abortController,
    });
  },
});

const runtime = new CopilotRuntime({
  agents: { default: agent },
  runner: new InMemoryAgentRunner(),
});

createServer(
  createCopilotNodeListener({ runtime, basePath: "/api/copilotkit", cors: true }),
).listen(8242, () => { // HARNESS: doc listens on 8200; 8242 is this repo's components runtime port
  console.log("Copilot Runtime listening at http://localhost:8242/api/copilotkit"); // HARNESS: port in the log line too
});
