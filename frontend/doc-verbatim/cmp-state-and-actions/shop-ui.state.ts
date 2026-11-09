// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/state-and-actions (Angular tab), "Show live app state" src/app/shop-ui.ts. Verbatim.
import { z } from "zod"; // HARNESS: the snippet uses z with no import
import { createGenerativeUI } from "@copilotkit/angular/generative-ui"; // HARNESS: import from the Catalogs page (the snippet has none)
const cartSchema = z.object({
  items: z.array(z.object({ productId: z.string(), quantity: z.number() })),
});

export const shopUI = createGenerativeUI({
  id: "acme/shop@1",
  state: { cart: cartSchema },
  components: {
    ProductCard: {
      component: ProductCard,
      props: z.object({ productId: z.string(), name: z.string(), inCart: z.number() }),
      bind: {
        inCart: (state, { productId }) =>
          state.cart.items.find((item) => item.productId === productId)?.quantity ?? 0,
      },
    },
  },
});
