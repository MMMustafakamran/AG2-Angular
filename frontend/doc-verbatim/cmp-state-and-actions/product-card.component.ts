// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/state-and-actions (Angular tab), the event as a typed function input. Verbatim.
import { Component, input, signal } from "@angular/core";
import type { GenerativeUIEventHandler } from "@copilotkit/angular/generative-ui";
import { shopUI } from "./shop-ui";

@Component({
  selector: "app-product-card",
  template: `
    <article>
      <h4>{{ name() }}</h4>
      @if (onAddToCart(); as addToCart) {
        <button (click)="add(addToCart)">Add to cart</button>
      }
      @if (error(); as error) {
        <p role="alert">{{ error }}</p>
      }
    </article>
  `,
})
export class ProductCard {
  readonly productId = input.required<string>();
  readonly name = input.required<string>();
  readonly onAddToCart = input<GenerativeUIEventHandler<typeof shopUI, "onAddToCart">>();
  protected readonly error = signal<string | undefined>(undefined);

  protected async add(addToCart: GenerativeUIEventHandler<typeof shopUI, "onAddToCart">) {
    const result = await addToCart({ productId: this.productId() });
    if (!result.ok) this.error.set(result.error.message);
  }
}
