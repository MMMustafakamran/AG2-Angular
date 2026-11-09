// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/catalogs (Angular tab), "Type your components". Verbatim.
import { input } from "@angular/core"; // HARNESS
import { shopUI } from "./shop-ui"; // HARNESS
import type { GenerativeUIComponentInputs } from "@copilotkit/angular/generative-ui";

type ProductCardInputs = GenerativeUIComponentInputs<typeof shopUI, "ProductCard">;

export class ProductCard {
  readonly price = input.required<ProductCardInputs["price"]>(); // number
  readonly color = input<ProductCardInputs["color"]>(); // type error: not a prop of ProductCard
}
