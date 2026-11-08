import { Component, input, model } from "@angular/core";
import { z } from "zod";
import {
  CopilotGenerativeUIChildren,
  child,
  createGenerativeUI,
  injectGenerativeUIAccessibility,
  standardUI,
  type GenerativeUIChildren,
  type GenerativeUIEventHandler,
} from "@copilotkit/angular/generative-ui";

@Component({
  selector: "app-product-card",
  imports: [CopilotGenerativeUIChildren],
  host: { role: "article", "[attr.aria-label]": "aria()['aria-label'] ?? null" },
  template: `
    <h3>{{ name() }}</h3>
    <p>{{ "$" + price() }}</p>
    <input type="number" [value]="quantity() ?? 1"
      (input)="quantity.set(+$any($event.target).value)" />
    @if (onAddToCart(); as addToCart) {
      <button (click)="addToCart({ productId: productId(), quantity: quantity() ?? 1 })">
        Add to cart
      </button>
    }
    <ng-container *copilotGenerativeUIChildren="children()" />
  `,
})
export class ProductCard {
  readonly productId = input.required<string>();
  readonly name = input.required<string>();
  readonly price = input.required<number>();
  /** A writable prop: a `model()`. The engine binds it two-way. */
  readonly quantity = model<number>();
  /** An event: a function input. It is set only when the event is bound. */
  readonly onAddToCart =
    input<GenerativeUIEventHandler<typeof shopUI, "onAddToCart">>();
  /** A slot: the children the agent puts in the card. */
  readonly children = input<GenerativeUIChildren>();
  protected readonly aria = injectGenerativeUIAccessibility();
}

export const shopUI = createGenerativeUI({
  id: "acme/shop@1",
  extends: [standardUI],
  state: {
    cart: z.object({ count: z.number(), total: z.number() }),
  },
  functions: {
    addToCart: {
      parameters: z.object({ productId: z.string(), quantity: z.number() }),
    },
  },
  components: {
    ProductCard: {
      component: ProductCard,
      description: "One product with its price and an add-to-cart button.",
      props: z.object({
        productId: z.string(),
        name: z.string(),
        price: z.number(),
        quantity: z.number().optional(),
      }),
      writable: ["quantity"],
      // Matches the `addToCart` function, so it calls it with its parameters.
      events: { onAddToCart: {} },
      slots: { children: "multiple" },
    },
  },
});
