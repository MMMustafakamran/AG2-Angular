// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/theming (Angular tab), src/app/app.config.ts. Verbatim.
import { provideGenerativeUI, standardUI } from "@copilotkit/angular/generative-ui"; // HARNESS: import from step 3 of the Components page (the snippet has none)
// HARNESS: the snippet is a bare provider call; wrapped in an appConfig.
import { ApplicationConfig } from "@angular/core"; // HARNESS
export const appConfig: ApplicationConfig = { providers: [ // HARNESS
provideGenerativeUI({
  ui: standardUI,
  theme: {
    "--a2ui-color-accent": "#d97706",
    "--a2ui-font-family": "Inter, sans-serif",
    "--a2ui-radius-md": "10px",
  },
}),
] }; // HARNESS
