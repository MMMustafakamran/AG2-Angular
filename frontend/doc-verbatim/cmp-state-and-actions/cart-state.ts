// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/state-and-actions (Angular tab), "Then give the state its value". Verbatim.
import { Component, inject } from "@angular/core";
import { connectGenerativeUIState } from "@copilotkit/angular/generative-ui";
import { CartStore } from "./cart.store";
import { shopUI } from "./shop-ui";

@Component({ /* ... */ })
export class CartState {
  readonly #cart = inject(CartStore);

  constructor() {
    connectGenerativeUIState(shopUI, "cart", () => ({ items: this.#cart.items() }));
  }
}
