// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/catalogs (Angular tab), "Then give it to the provider" src/app/app.config.ts. Verbatim.
import { provideGenerativeUI } from "@copilotkit/angular/generative-ui"; // HARNESS: the snippet has no import
// HARNESS: the snippet is the inside of app.config.ts; wrapped in the appConfig of step 3 of the Components page.
import { ApplicationConfig } from "@angular/core"; // HARNESS
import { provideCopilotKit } from "@copilotkit/angular"; // HARNESS
import { shopUI } from "./shop-ui"; // HARNESS
export const appConfig: ApplicationConfig = { // HARNESS
providers: [
  provideCopilotKit({ runtimeUrl: "/api/copilotkit" }),
  provideGenerativeUI({ ui: shopUI }),
],
}; // HARNESS
