// frontend tools : let the agent display one of your components start
/**
 * "Let the agent display one of your components", verbatim.
 * https://docs.copilotkit.ai/angular/ag2/guides/frontend-tools-generative-ui
 */

import { Component, input } from "@angular/core";
import { AngularToolCall, ToolRenderer } from "@copilotkit/angular";

type IncidentArgs = { id: string; severity: string };

@Component({
  selector: "app-incident-card",
  standalone: true,
  template: `
    @let call = toolCall();
    @if (call.status === "in-progress") {
      <p>Loading incident…</p>
    } @else {
      <article>
        <strong>{{ call.args.id }}</strong>
        <span>{{ call.args.severity }}</span>
      </article>
    }
  `,
})
export class IncidentCardComponent implements ToolRenderer<IncidentArgs> {
  readonly toolCall = input.required<AngularToolCall<IncidentArgs>>();
}
// frontend tools : let the agent display one of your components end
