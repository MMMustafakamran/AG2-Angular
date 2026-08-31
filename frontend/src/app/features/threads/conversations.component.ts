// threads : threads drawer and chat start
/**
 * The drawer-plus-chat sample, verbatim. Both sit under one
 * `provideCopilotChatConfiguration`, which is what makes selection and
 * new-thread actions in the drawer update the chat.
 * https://docs.copilotkit.ai/angular/ag2/guides/threads-memory-attachments-headless
 */

import { Component } from '@angular/core';
import {
  CopilotChat,
  CopilotThreadsDrawer,
  provideCopilotChatConfiguration,
} from '@copilotkit/angular';

@Component({
  selector: 'app-conversations',
  imports: [CopilotChat, CopilotThreadsDrawer],
  providers: [provideCopilotChatConfiguration({ agentId: 'support' })],
  template: `
    <copilot-threads-drawer agentId="support" [limit]="20" />
    <copilot-chat />
  `,
})
export class ConversationsComponent {}
// threads : threads drawer and chat end
