import { Component } from "@angular/core";
import { registerFrontendTool } from "@copilotkit/angular";
import { z } from "zod";

@Component({
  selector: "app-order-search",
  standalone: true,
  template: "",
})
export class OrderSearchComponent {
  constructor() {
    registerFrontendTool({
      name: "searchOrders",
      description: "Search the signed-in user's orders by status",
      parameters: z.object({
        status: z.enum(["open", "shipped", "delivered"]),
      }),
      handler: async ({ status }) => {
        const orders = await searchOrders(status);
        return JSON.stringify(orders);
      },
      webmcp: {
        annotations: {
          readOnlyHint: true,
        },
      },
    });
  }
}
