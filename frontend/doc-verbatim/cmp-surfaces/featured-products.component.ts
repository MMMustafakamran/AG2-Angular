// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/surfaces (Angular tab), "Add a page target" src/app/featured-products.component.ts. Verbatim.
import { Component, input } from "@angular/core";
import { CopilotGenerativeUISurface } from "@copilotkit/angular/generative-ui";
import { ProductRow } from "./product-row.component";
import { shopUI } from "./shop-ui";

@Component({
  selector: "app-featured-products",
  imports: [CopilotGenerativeUISurface, ProductRow],
  template: `
    <copilot-generative-ui-surface
      id="featured"
      [ui]="shopUI"
      description="The Featured Products row of the home page. When the customer asks to see products here, show them as a ProductGrid with one ProductCard for each product. When they ask for the featured products again, delete this surface."
      [components]="['ProductGrid', 'ProductCard']"
    >
      <app-product-row [products]="products()" />
    </copilot-generative-ui-surface>
  `,
})
export class FeaturedProducts {
  readonly products = input.required<Product[]>();
  protected readonly shopUI = shopUI;
}
