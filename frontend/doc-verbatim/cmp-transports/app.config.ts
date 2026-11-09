// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/transports (Angular tab), tool transport, markdown transport, only some agents. Verbatim.
import { provideGenerativeUI, standardUI } from "@copilotkit/angular/generative-ui"; // HARNESS: import from step 3 of the Components page (the snippet has none)
// HARNESS: the snippets are bare provider calls; wrapped in one appConfig each.
import { ApplicationConfig } from "@angular/core"; // HARNESS
export const toolConfig: ApplicationConfig = { providers: [ // HARNESS
provideGenerativeUI({ ui: standardUI }),
] }; // HARNESS
export const markdownConfig: ApplicationConfig = { providers: [ // HARNESS
provideGenerativeUI({ ui: standardUI, transport: "markdown" }),
] }; // HARNESS
export const someAgentsConfig: ApplicationConfig = { providers: [ // HARNESS
provideGenerativeUI({ ui: standardUI, agentIds: ["shop"] }),
] }; // HARNESS
