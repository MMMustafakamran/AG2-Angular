// threads : custom thread list start
/**
 * "For a custom thread list, use injectThreads", verbatim.
 * https://docs.copilotkit.ai/angular/ag2/guides/threads-memory-attachments-headless
 */

import { Component } from '@angular/core';
import { injectThreads } from '@copilotkit/angular';

@Component({
  selector: 'app-thread-list',
  template: `
    <button type="button" (click)="threads.startNewThread()">
      New conversation
    </button>

    @if (threads.isLoading()) {
      <p>Loading conversations…</p>
    } @else {
      @for (thread of threads.threads(); track thread.id) {
        <button type="button" (click)="select(thread.id)">
          {{ thread.name ?? "Untitled conversation" }}
        </button>
      }
    }

    @if (threads.listError()) {
      <button type="button" (click)="threads.refetchThreads()">Retry</button>
    }
  `,
})
export class ThreadListComponent {
  // threads : inject threads start
  readonly threads = injectThreads({
    agentId: 'support',
    limit: 20,
  });
  // threads : inject threads end

  protected select(threadId: string): void {
    // Store this id and bind it to CopilotChat's threadId input.
    console.log(threadId);
  }
}
// threads : custom thread list end
