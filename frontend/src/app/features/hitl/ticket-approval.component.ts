// human in the loop : ticket approval start
/**
 * "Handle an interrupt from the store", verbatim.
 * https://docs.copilotkit.ai/angular/ag2/guides/human-in-the-loop
 *
 * Unimplementable until now: `AgentStore` shipped only `agent`, `isRunning`,
 * `messages` and `state` in `@copilotkit/angular@0.3.1`, so
 * `store().interruptController` did not exist for as long as the section
 * described it. `0.4.0` adds `readonly interruptController: InterruptController`
 * and the snippet compiles as published.
 *
 * One deviation: the doc injects the store for an agent named `ticketing`. No
 * such agent is registered here, and an unknown id resolves to a store whose
 * controller never sees an event — which would make this component look healthy
 * while testing nothing. It uses `support`, the second agent this repo's
 * runtime registers, which also keeps it off `default` and so honours the
 * guide's own warning against pointing `injectInterrupt` and
 * `store().interruptController` at one decision: the sibling
 * `app-interrupt-panel` holds `default`.
 */

import { Component } from '@angular/core';
import { injectAgentStore } from '@copilotkit/angular';

@Component({
  selector: 'app-ticket-approval',
  template: `
    @let interrupts = store().interruptController;

    @if (interrupts.hasInterrupt()) {
      <section>
        <p>{{ interrupts.interrupt()?.message }}</p>
        <button type="button" (click)="interrupts.resolve({ approved: true })">
          Approve
        </button>
        <button type="button" (click)="interrupts.cancel()">Reject</button>
      </section>
    }
  `,
})
export class TicketApprovalComponent {
  protected readonly store = injectAgentStore('support');
}
// human in the loop : ticket approval end
