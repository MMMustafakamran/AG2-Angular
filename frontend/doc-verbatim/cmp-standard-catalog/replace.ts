// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components/standard-catalog (Angular tab), "Replace a component". Verbatim.
import { Component, input } from "@angular/core";
import {
  CopilotGenerativeUIChildren,
  createGenerativeUI,
  standardUI,
  type GenerativeUIChildren,
} from "@copilotkit/angular/generative-ui";

@Component({
  selector: "app-card",
  imports: [CopilotGenerativeUIChildren],
  template: `
    <div class="rounded-2xl border p-6 shadow-sm">
      <ng-container *copilotGenerativeUIChildren="child()" />
      <ng-container *copilotGenerativeUIChildren="children()" />
    </div>
  `,
})
export class MyCard {
  readonly child = input<GenerativeUIChildren>();
  readonly children = input<GenerativeUIChildren>();
}

export const appUI = createGenerativeUI({
  id: "acme/app@1",
  extends: [standardUI],
  overrides: { Card: { component: MyCard } },
  components: {},
});
