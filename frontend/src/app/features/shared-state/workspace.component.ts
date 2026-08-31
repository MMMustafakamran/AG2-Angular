// shared state : read and write agent state start
/**
 * "Read agent state", verbatim. Reads through `store().state()` so Angular
 * tracks changes; writes through the plain AG-UI agent at `store().agent`.
 * https://docs.copilotkit.ai/angular/ag2/guides/shared-state
 */

import { Component, computed } from '@angular/core';
import { injectAgentStore } from '@copilotkit/angular';

type WorkspaceState = {
  notes: string[];
  priority: 'low' | 'normal' | 'high';
};

const EMPTY_STATE: WorkspaceState = {
  notes: [],
  priority: 'normal',
};

@Component({
  selector: 'app-workspace',
  template: `
    <p>Priority: {{ state().priority }}</p>
    <ul>
      @for (note of state().notes; track note) {
        <li>{{ note }}</li>
      }
    </ul>
    <button type="button" (click)="setPriority('high')">
      Mark high priority
    </button>
    <br>
     <button type="button" (click)="setPriority('low')">
      Mark low priority
    </button>
  `,
})
export class WorkspaceComponent {
  readonly store = injectAgentStore('default');
  readonly state = computed(
    () => (this.store().state() as WorkspaceState | undefined) ?? EMPTY_STATE,
  );

  protected setPriority(priority: WorkspaceState['priority']): void {
    const agent = this.store().agent;
    const current = (agent.state as WorkspaceState | undefined) ?? EMPTY_STATE;
    agent.setState({ ...current, priority });
  }
}
// shared state : read and write agent state end
