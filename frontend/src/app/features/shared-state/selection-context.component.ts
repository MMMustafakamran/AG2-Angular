// shared state : bind context in a template start
/**
 * "Bind context in a template", verbatim. The directive registers on first
 * render, so it must not be rendered before the context is complete.
 * https://docs.copilotkit.ai/angular/ag2/guides/shared-state
 */

import { Component, computed, signal } from '@angular/core';
import { CopilotKitAgentContext } from '@copilotkit/angular';

@Component({
  selector: 'app-selection-context',
  imports: [CopilotKitAgentContext],
  template: ` <div [copilotkitAgentContext]="selectionContext()"></div> `,
})
export class SelectionContextComponent {
  readonly selectedId = signal('record-42');
  readonly selectionContext = computed(() => ({
    description: 'The record selected in the application',
    value: this.selectedId(),
  }));
}
// shared state : bind context in a template end
