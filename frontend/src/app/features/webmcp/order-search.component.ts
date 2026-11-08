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

// HARNESS: the WebMCP page calls searchOrders() but never defines it (FINDINGS: undefined helper).
// Minimal stand-in so the page compiles; returns fake orders for the given status.
async function searchOrders(status: string) {
  return [{ id: "ORD-1001", status }];
}
