// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/markdown-mode (Angular tab), "Turn it on" src/app/app.config.ts. Verbatim.
// HARNESS: the snippet has imports plus a bare providers: entry; wrapped in an appConfig.
import { ApplicationConfig } from "@angular/core"; // HARNESS
import { provideCopilotKit } from "@copilotkit/angular";
import { provideGenerativeUI, standardUI } from "@copilotkit/angular/generative-ui";

export const appConfig: ApplicationConfig = { // HARNESS
providers: [
  provideCopilotKit({ runtimeUrl: "/api/copilotkit" }),
  provideGenerativeUI({ ui: standardUI, transport: "markdown" }),
],
}; // HARNESS
