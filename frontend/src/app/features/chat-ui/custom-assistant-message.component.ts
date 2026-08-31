// chat ui : replace an assistant message start
/**
 * "Replace an assistant message", verbatim.
 * https://docs.copilotkit.ai/angular/ag2/guides/chat-ui
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';

type AssistantMessage = {
  id: string;
  role: 'assistant';
  content?: string;
};

@Component({
  selector: 'app-custom-assistant-message',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="answer">
      <span class="answer__label">Assistant</span>
      <p>{{ message().content }}</p>
    </article>
  `,
})
export class CustomAssistantMessageComponent {
  readonly message = input.required<AssistantMessage>();
}
// chat ui : replace an assistant message end
