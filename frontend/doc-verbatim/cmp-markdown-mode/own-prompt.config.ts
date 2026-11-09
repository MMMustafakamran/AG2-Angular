// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/markdown-mode (Angular tab), "Build your own prompt". Verbatim.
import { provideGenerativeUI, standardUI } from "@copilotkit/angular/generative-ui"; // HARNESS: import from step 3 of the Components page (the snippet has none)
import { ApplicationConfig } from "@angular/core"; // HARNESS
export const appConfig: ApplicationConfig = { providers: [ // HARNESS
provideGenerativeUI({ ui: standardUI, transport: "markdown", sendContext: false }),
] }; // HARNESS
