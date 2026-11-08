import { Component, inject } from "@angular/core";
import {
  connectGenerativeUIState,
  registerGenerativeUIFunction,
} from "@copilotkit/angular/generative-ui";
import { CartStore } from "./cart.store";
import { shopUI } from "./shop-ui";

@Component({ /* ... */ })
export class ShopComponent {
  readonly #cart = inject(CartStore);

  constructor() {
    connectGenerativeUIState(shopUI, "cart", () => ({
      count: this.#cart.count(),
      total: this.#cart.total(),
    }));
    registerGenerativeUIFunction(shopUI, "addToCart", ({ productId, quantity }) =>
      this.#cart.add(productId, quantity),
    );
  }
}
