// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/from-a2ui (Angular tab), "Before and after", After. Verbatim.
// HARNESS: the snippet is the inside of app.config.ts; wrapped in the appConfig of step 3 of the Components page.
import { ApplicationConfig } from "@angular/core"; // HARNESS
import { provideCopilotKit } from "@copilotkit/angular"; // HARNESS
import { provideGenerativeUI } from "@copilotkit/angular/generative-ui"; // HARNESS: the page never shows this import
import { appUI } from "./app-ui"; // HARNESS
export const appConfig: ApplicationConfig = { providers: [ // HARNESS
provideCopilotKit({ runtimeUrl: "/api/copilotkit" }),
provideGenerativeUI({ ui: appUI }),
] }; // HARNESS
