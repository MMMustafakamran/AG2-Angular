// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/state-and-actions (Angular tab), registerGenerativeUIFunction. Verbatim.
import { Component, inject } from "@angular/core";
import { registerGenerativeUIFunction } from "@copilotkit/angular/generative-ui";
import { CartStore } from "./cart.store";
import { shopUI } from "./shop-ui";

@Component({ /* ... */ })
export class CartActions {
  readonly #cart = inject(CartStore);

  constructor() {
    registerGenerativeUIFunction(shopUI, "addToCart", ({ productId, quantity }) => {
      this.#cart.addItem(productId, quantity);
      return { added: productId };
    });
  }
}
