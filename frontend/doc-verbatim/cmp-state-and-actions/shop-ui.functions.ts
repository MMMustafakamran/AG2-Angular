// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/state-and-actions (Angular tab), "Run your code on a click" src/app/shop-ui.ts. Verbatim.
import { z } from "zod"; // HARNESS: the snippet uses z with no import
import { createGenerativeUI } from "@copilotkit/angular/generative-ui"; // HARNESS: import from the Catalogs page (the snippet has none)
export const shopUI = createGenerativeUI({
  id: "acme/shop@1",
  functions: {
    addToCart: {
      description: "Add a product to the cart",
      parameters: z.object({ productId: z.string(), quantity: z.number().default(1) }),
    },
  },
  components: {
    ProductCard: {
      component: ProductCard,
      props: z.object({ productId: z.string(), name: z.string() }),
      events: { onAddToCart: {} },
    },
  },
});
