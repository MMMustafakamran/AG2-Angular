// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/from-a2ui (Angular tab), "Convert a custom catalog", After. Verbatim.
import {
  createGenerativeUI,
  standardUI,
} from "@copilotkit/angular/generative-ui";

export const appUI = createGenerativeUI({
  id: "acme/flights@1",
  extends: [standardUI],
  components: {
    Airport: {
      component: Airport,
      description: "An airport by IATA code, with its city under it.",
      props: z.object({ code: z.string(), city: z.string() }),
    },
    Arrow: { component: Arrow, description: "An arrow between two airports." },
  },
});
