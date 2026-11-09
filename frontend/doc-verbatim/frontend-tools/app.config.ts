import { ApplicationConfig } from "@angular/core";
import {
  provideCopilotKit,
  type SandboxFunction,
} from "@copilotkit/angular";
import { z } from "zod";

const setDashboardFilter: SandboxFunction<{ filter: string }> = {
  name: "setDashboardFilter",
  description: "Set the active dashboard filter",
  parameters: z.object({ filter: z.string() }),
  handler: async ({ filter }) => {
    sessionStorage.setItem("dashboard-filter", filter);
    return { applied: filter };
  },
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideCopilotKit({
      runtimeUrl: "/api/copilotkit",
      openGenerativeUI: {
        sandboxFunctions: [setDashboardFilter],
      },
    }),
  ],
};
