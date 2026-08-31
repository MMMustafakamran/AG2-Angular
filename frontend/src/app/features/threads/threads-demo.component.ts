/**
 * Harness wrapper mounting both thread surfaces from the guide: the hand-built
 * list on `injectThreads`, and the drop-in drawer beside a chat.
 */
import { Component } from '@angular/core';

import { ConversationsComponent } from './conversations.component';
import { ThreadListComponent } from './thread-list.component';

@Component({
  selector: 'app-threads-demo',
  imports: [ThreadListComponent, ConversationsComponent],
  template: `
    <div class="flex h-full flex-col gap-4 p-4">
      <section class="rounded-lg border border-slate-200 bg-white p-4">
        <h2 class="mb-2 text-sm font-semibold text-slate-900">
          Headless list — injectThreads
        </h2>
        <app-thread-list />
      </section>

      <section
        class="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 class="mb-2 text-sm font-semibold text-slate-900">
          CopilotThreadsDrawer + chat
        </h2>
        <div class="flex min-h-0 flex-1 gap-4">
          <app-conversations />
        </div>
      </section>
    </div>
  `,
})
export class ThreadsDemoComponent {}
