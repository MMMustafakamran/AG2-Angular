import { ApplicationConfig } from "@angular/core";
import { provideCopilotKit } from "@copilotkit/angular";
import {
  provideGenerativeUI,
  standardUI,
} from "@copilotkit/angular/generative-ui";

export const appConfig: ApplicationConfig = {
  providers: [
    provideCopilotKit({ runtimeUrl: "/api/copilotkit" }),
    provideGenerativeUI({ ui: standardUI }),
  ],
};
