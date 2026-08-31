// chat ui : replace an assistant message component start
/**
 * The second `SupportChatComponent` from "Replace an assistant message",
 * verbatim except for the class name and selector — the guide gives two
 * different components the same name and selector, and both are mounted here.
 * https://docs.copilotkit.ai/angular/ag2/guides/chat-ui
 */

import { Component } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';

import { CustomAssistantMessageComponent } from './custom-assistant-message.component';

@Component({
  selector: 'app-custom-message-chat',
  imports: [CopilotChat],
  template: `
    <copilot-chat
      [assistantMessageComponent]="assistantMessageComponent"
      assistantMessageClass="support-answer"
    />
  `,
})
export class CustomMessageChatComponent {
  protected readonly assistantMessageComponent =
    CustomAssistantMessageComponent;
}
// chat ui : replace an assistant message component end
