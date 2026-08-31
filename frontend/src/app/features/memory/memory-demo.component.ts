/**
 * Harness wrapper mounting the guide's memory list beside a chat, so the
 * `isAvailable()` gate can be observed against a live runtime.
 */
import { Component } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';

import { MemoryListComponent } from './memory-list.component';

@Component({
  selector: 'app-memory-demo',
  imports: [CopilotChat, MemoryListComponent],
  template: `
    <div class="flex h-full gap-4 p-4">
      <section
        class="w-80 shrink-0 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 class="mb-2 text-sm font-semibold text-slate-900">
          injectMemories
        </h2>
        <app-memory-list />
      </section>
      <div class="min-w-0 flex-1">
        <copilot-chat />
      </div>
    </div>
  `,
})
export class MemoryDemoComponent {}
