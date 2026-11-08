/**
 * Authentication guide: "Validate every runtime request" (verbatim block below).
 * https://docs.copilotkit.ai/angular/ag2/auth
 *
 * HARNESS: the guide shows only the `createCopilotExpressHandler(...)` call. Its
 * imports, `runtime`, `verifySession` and the Express app are not on the page
 * (FINDINGS.md #10). server.ts serves this app under /auth on port 8240, so the
 * handler sees the guide's own basePath "/api/copilotkit".
 */
import express from "express"; // HARNESS
import { CopilotRuntime } from "@copilotkit/runtime/v2"; // HARNESS
import { createCopilotExpressHandler } from "@copilotkit/runtime/v2/express"; // HARNESS
import { HttpAgent } from "@ag-ui/client"; // HARNESS

const agentUrl = process.env["AG2_AGENT_URL"] ?? "http://localhost:8241/agent/"; // HARNESS
const runtime = new CopilotRuntime({ agents: { default: new HttpAgent({ url: agentUrl }) } }); // HARNESS
// HARNESS: the guide never defines verifySession; accept the Showcase's demo token only.
const verifySession = async (token: string) => (token === "demo-token-123" ? { userId: "demo" } : null);

// auth : validate every runtime request start
const handler = createCopilotExpressHandler({
  runtime,
  basePath: "/api/copilotkit",
  hooks: {
    onRequest: async ({ request }) => {
      const token = request.headers
        .get("authorization")
        ?.replace(/^Bearer\s+/i, "");
      const session = token ? await verifySession(token) : null;

      if (!session) {
        throw new Response("Unauthorized", { status: 401 });
      }
    },
  },
});
// auth : validate every runtime request end

// HARNESS: CORS for the Angular dev server (the guide says to configure it, shows no code).
export const authApp = express();
authApp.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  next();
});
authApp.use(handler);
