// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/standard-catalog (Angular tab), "Add your own components". Verbatim.
import { createGenerativeUI, standardUI } from "@copilotkit/angular/generative-ui";

export const appUI = createGenerativeUI({
  id: "acme/app@1",
  extends: [standardUI],
  components: {
    ProductCard: { component: ProductCard, props: productSchema },
  },
});
