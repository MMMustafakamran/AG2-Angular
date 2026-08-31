// frontend tools : render a tool result start
/**
 * "Render a tool result", verbatim.
 * https://docs.copilotkit.ai/angular/ag2/guides/frontend-tools-generative-ui
 */

import { Component, input } from '@angular/core';
import { type AngularToolCall, type ToolRenderer } from '@copilotkit/angular';

type WeatherArgs = { city: string };

@Component({
  selector: 'app-weather-card',
  template: `
    @let call = toolCall();
    @if (call.status === "complete") {
      <article>
        <strong>{{ call.args.city }}</strong>
        <p>{{ call.result }}</p>
      </article>
    } @else {
      <p>Loading weather for {{ call.args.city ?? "…" }}</p>
    }
    <p>Tool Call done </p>
  `,
})
export class WeatherCardComponent implements ToolRenderer<WeatherArgs> {
  readonly toolCall = input.required<AngularToolCall<WeatherArgs>>();
}
// frontend tools : render a tool result end
