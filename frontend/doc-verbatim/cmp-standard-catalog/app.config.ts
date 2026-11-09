// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/standard-catalog (Angular tab), "Use it as it is" src/app/app.config.ts. Verbatim.
// HARNESS: the snippet has an import plus a bare providers: entry; wrapped in an appConfig.
import { ApplicationConfig } from "@angular/core"; // HARNESS
import { provideCopilotKit } from "@copilotkit/angular"; // HARNESS
import { provideGenerativeUI, standardUI } from "@copilotkit/angular/generative-ui";

export const appConfig: ApplicationConfig = { // HARNESS
providers: [
  provideCopilotKit({ runtimeUrl: "/api/copilotkit" }),
  provideGenerativeUI({ ui: standardUI }),
],
}; // HARNESS
