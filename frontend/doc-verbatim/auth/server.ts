// HARNESS: the Authentication page shows only the `createCopilotExpressHandler` call below.
// Imports, the Express app, `runtime` and `verifySession` are not on the page; they are
// filled in here (marked HARNESS) only to check the published hook rejects unauthenticated requests.
import express from "express"; // HARNESS
import { CopilotRuntime } from "@copilotkit/runtime/v2"; // HARNESS
import { createCopilotExpressHandler } from "@copilotkit/runtime/v2/express"; // HARNESS
import { HttpAgent } from "@ag-ui/client"; // HARNESS

const runtime = new CopilotRuntime({ // HARNESS
  agents: { default: new HttpAgent({ url: "http://localhost:8241/agent/" }) }, // HARNESS
}); // HARNESS
const verifySession = async (token: string) => (token === "demo-token-123" ? { id: "u1" } : null); // HARNESS: doc never defines verifySession

// --- verbatim from the doc ---
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
// --- end verbatim ---

const app = express(); // HARNESS
app.use(handler); // HARNESS
app.listen(8240, () => console.log("auth runtime on 8240")); // HARNESS: runtime port 8240
