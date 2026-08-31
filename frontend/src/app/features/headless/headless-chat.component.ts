// headless : build a headless chat start
/**
 * "Build a headless chat", verbatim. No CopilotKit chrome: the transcript and
 * composer are hand-written over `injectAgentStore`, and the run is driven
 * through `CopilotKitCore.runAgent`.
 * https://docs.copilotkit.ai/angular/ag2/guides/threads-memory-attachments-headless
 */

import { Component, inject, signal } from '@angular/core';
import { CopilotKit, injectAgentStore } from '@copilotkit/angular';

@Component({
  selector: 'app-headless-chat',
  template: `
    <div aria-live="polite">
      @for (message of store().messages(); track message.id) {
        <article [attr.data-role]="message.role">
          {{ message.content }}
        </article>
      }
      @if (store().isRunning()) {
        <p>Agent is working…</p>
      }
    </div>

    <textarea
      aria-label="Message"
      [value]="draft()"
      (input)="updateDraft($event)"
    ></textarea>
    <button
      type="button"
      [disabled]="store().isRunning() || !draft().trim()"
      (click)="send()"
    >
      Send
    </button>
  `,
})
export class HeadlessChatComponent {
  private readonly copilotKit = inject(CopilotKit);
  // headless : inject agent store start
  readonly store = injectAgentStore('default');
  // headless : inject agent store end
  readonly draft = signal('');

  protected updateDraft(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  protected async send(): Promise<void> {
    const content = this.draft().trim();
    if (!content || this.store().isRunning()) return;

    const agent = this.store().agent;
    agent.addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content,
    });
    this.draft.set('');
    // headless : run agent start
    await this.copilotKit.core.runAgent({ agent });
    // headless : run agent end
  }
}
// headless : build a headless chat end
