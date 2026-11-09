// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/from-a2ui (Angular tab), "Convert a custom catalog", Before. Verbatim.
import { createAngularCatalog, DynamicStringSchema } from "@copilotkit/angular/a2ui";

const definitions = {
  Airport: {
    props: z.object({ code: DynamicStringSchema, city: DynamicStringSchema }),
  },
  Arrow: { props: z.object({}) },
};
const renderers = { Airport, Arrow };
export const myCatalog = createAngularCatalog(definitions, renderers, {
  catalogId: "acme/flights",
  includeBasicCatalog: true,
});
