// human in the loop : register a decision tool renderer start
/**
 * "Register a decision tool" renderer, verbatim.
 * https://docs.copilotkit.ai/angular/ag2/guides/human-in-the-loop
 */

import { Component, input } from '@angular/core';
import {
  type HumanInTheLoopToolCall,
  type HumanInTheLoopToolRenderer,
} from '@copilotkit/angular';

type ApprovalArgs = {
  action: string;
  reason: string;
};

@Component({
  selector: 'app-approval-card',
  template: `
    @let call = toolCall();
    <article>
      <h3>Approve {{ call.args.action ?? "this action" }}?</h3>
      <p>{{ call.args.reason }}</p>

      @if (call.status !== "complete") {
        <button type="button" (click)="call.respond({ approved: true })">
          Approve
        </button>
        <button type="button" (click)="call.respond({ approved: false })">
          Reject
        </button>
      }
    </article>
  `,
})
export class ApprovalCardComponent
  implements HumanInTheLoopToolRenderer<ApprovalArgs>
{
  readonly toolCall = input.required<HumanInTheLoopToolCall<ApprovalArgs>>();
}
// human in the loop : register a decision tool renderer end
