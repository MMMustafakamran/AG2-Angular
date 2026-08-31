// human in the loop : hitl chat start
/**
 * Puts the guide's three human-in-the-loop paths side by side: the decision
 * tool (registered by ApprovalToolsService, rendered inside the chat's
 * tool-call flow), the headless interrupt controller, and the store's own
 * controller — the last two rendered outside the chat and pointed at different
 * agents, as the guide's warning requires.
 * https://docs.copilotkit.ai/angular/ag2/guides/human-in-the-loop
 *
 * Injecting ApprovalToolsService is what constructs it, and construction is
 * what performs the `registerHumanInTheLoop` call.
 */

import { Component, inject } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';

import { ApprovalToolsService } from './approval-tools.service';
import { InterruptPanelComponent } from './interrupt-panel.component';
import { TicketApprovalComponent } from './ticket-approval.component';

@Component({
  selector: 'app-hitl-chat',
  imports: [CopilotChat, InterruptPanelComponent, TicketApprovalComponent],
  providers: [ApprovalToolsService],
  template: `
    <div style="display: flex; flex-direction: column; height: 100%">
      <app-interrupt-panel />
      <app-ticket-approval />
      <div style="flex: 1; min-height: 0">
        <copilot-chat />
      </div>
    </div>
  `,
})
export class HitlChatComponent {
  private readonly approvalTools = inject(ApprovalToolsService);
}
// human in the loop : hitl chat end
