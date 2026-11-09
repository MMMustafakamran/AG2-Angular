// HARNESS: featured-products.component.ts imports "./shop-ui"; the Surfaces page never shows it.
// The shopUI with ProductGrid/ProductCard is on the Catalogs page: copied from there verbatim.
import { Component, input } from "@angular/core";
import { z } from "zod";
import {
  CopilotGenerativeUIChildren,
  createGenerativeUI,
  type GenerativeUIChildren,
} from "@copilotkit/angular/generative-ui";

@Component({
  selector: "app-product-grid",
  imports: [CopilotGenerativeUIChildren],
  template: `
    <section>
      @if (title(); as title) {
        <h3>{{ title }}</h3>
      }
      <div class="grid grid-cols-2 gap-4">
        <ng-container *copilotGenerativeUIChildren="children()" />
      </div>
    </section>
  `,
})
export class ProductGrid {
  readonly title = input<string>();
  readonly children = input<GenerativeUIChildren>();
}

@Component({
  selector: "app-product-card",
  template: `
    <article>
      <img [src]="imageUrl()" [alt]="name()" />
      <h4>{{ name() }}</h4>
      <p>{{ "$" + price() }}</p>
    </article>
  `,
})
export class ProductCard {
  readonly name = input.required<string>();
  readonly price = input.required<number>();
  readonly imageUrl = input.required<string>();
}

export const shopUI = createGenerativeUI({
  id: "acme/shop@1",
  components: {
    ProductGrid: {
      component: ProductGrid,
      description: "A grid of products. Put the ids of ProductCard components in children.",
      props: z.object({ title: z.string().optional() }),
      slots: { children: "multiple" },
    },
    ProductCard: {
      component: ProductCard,
      description: "One product. Copy every value from a product of a tool result.",
      props: z.object({ name: z.string(), price: z.number(), imageUrl: z.string() }),
    },
  },
});
