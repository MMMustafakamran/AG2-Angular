// memory : read and manage memory start
/**
 * "Configure attachments", verbatim: the guide's `MULTIMODAL_ATTACHMENTS`
 * config bound to the chat exactly as its `media-chat.component.html` snippet
 * shows. The microphone control needs no option — it is always present.
 * https://docs.copilotkit.ai/angular/ag2/guides/voice-multimodal
 */

import { Component } from '@angular/core';
import { injectMemories } from '@copilotkit/angular';

@Component({
  selector: 'app-memory-list',
  template: `
    @if (!memory.isAvailable()) {
      <p>Memory is not available for this runtime.</p>
    } @else {
      @for (item of memory.memories(); track item.id) {
        <article>
          <p>{{ item.content }}</p>
          <button type="button" (click)="remove(item.id)">Forget</button>
        </article>
      }
    }
  `,
})
export class MemoryListComponent {
  // memory : inject memories start
  readonly memory = injectMemories();
  // memory : inject memories end

  protected remove(id: string): void {
    this.memory.removeMemory(id).catch(() => undefined);
  }

  protected addPreference(): void {
    this.memory
      .addMemory({
        kind: 'operational',
        content: 'Prefer concise status updates.',
      })
      .catch(() => undefined);
  }
}
// memory : read and manage memory end
