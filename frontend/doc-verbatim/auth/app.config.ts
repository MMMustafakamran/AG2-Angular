import { ApplicationConfig } from "@angular/core";
import { provideCopilotKit } from "@copilotkit/angular";

export const appConfig: ApplicationConfig = {
  providers: [
    provideCopilotKit({
      runtimeUrl: "/api/copilotkit",
      headers: {
        Authorization: `Bearer ${readSessionToken()}`,
      },
    }),
  ],
};
