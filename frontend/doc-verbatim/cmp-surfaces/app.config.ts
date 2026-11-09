// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/surfaces (Angular tab), "When a component fails" src/app/app.config.ts. Verbatim.
// HARNESS: the snippet is a bare statement; wrapped in a function so it parses.
import { provideGenerativeUI } from "@copilotkit/angular/generative-ui"; // HARNESS: the snippet has no import
import { shopUI } from "./shop-ui"; // HARNESS
export function errorBoundarySetup() { // HARNESS
provideGenerativeUI({
  ui: shopUI,
  onError: (info) => console.warn(info.kind, info.surfaceId, info.error.message),
  // A component with the inputs `message` and `componentId`, and
  // `retry` if it declares it.
  errorFallback: MyFallback,
});
} // HARNESS
