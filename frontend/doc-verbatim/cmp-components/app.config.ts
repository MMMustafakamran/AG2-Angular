// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components (Angular tab), step 3 src/app/app.config.ts. Verbatim.
import { ApplicationConfig } from "@angular/core";
import { provideCopilotKit } from "@copilotkit/angular";
import { provideGenerativeUI, standardUI } from "@copilotkit/angular/generative-ui";

export const appConfig: ApplicationConfig = {
  providers: [
    provideCopilotKit({ runtimeUrl: "http://localhost:8200/api/copilotkit" }),
    provideGenerativeUI({ ui: standardUI }),
  ],
};
