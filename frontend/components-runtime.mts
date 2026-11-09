// HARNESS: ESM copy of components-runtime.ts (the doc's server.ts, verbatim but the port). The .ts file
// crashes under `npx tsx` in an Angular workspace (no "type": "module"): @tanstack/ai and
// @tanstack/ai-openai export ESM only -> ERR_PACKAGE_PATH_NOT_EXPORTED. Renaming to .mts is the
// workaround; the .ts stays as the evidence.
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
