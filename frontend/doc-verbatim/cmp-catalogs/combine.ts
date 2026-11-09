// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/catalogs (Angular tab), "Combine catalogs". Verbatim.
import { createGenerativeUI, standardUI } from "@copilotkit/angular/generative-ui";

export const appUI = createGenerativeUI({
  id: "acme/app@1",
  extends: [standardUI, cartUI],
  components: { Hero: { component: Hero, props: z.object({ title: z.string() }) } },
});
