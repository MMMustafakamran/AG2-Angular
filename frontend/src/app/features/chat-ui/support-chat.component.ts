// chat ui : add an inline chat start
/**
 * "Add an inline chat", verbatim.
 * https://docs.copilotkit.ai/angular/ag2/guides/chat-ui
 *
 * `agentId="support"` resolves because the runtime registers a `support` agent
 * alongside `default` (see frontend/server.ts).
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';

@Component({
  selector: 'app-support-chat',
  imports: [CopilotChat],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="chat-shell" aria-label="Support assistant">
      <copilot-chat agentId="support" />
    </section>
  `,
  styles: `
    .chat-shell {
      height: min(48rem, 80vh);
      overflow: hidden;
      border: 1px solid #dbe3eb;
      border-radius: 1rem;
    }
  `,
})
export class SupportChatComponent {}
// chat ui : add an inline chat end
