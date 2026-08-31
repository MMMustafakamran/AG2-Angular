// shared state : shared state chat start
/**
 * Mounts the guide's three surfaces against one chat: the read/write state
 * panel, the accessor-based context, and the directive-based context.
 * https://docs.copilotkit.ai/angular/ag2/guides/shared-state
 */

import { Component } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';

import { AccountContextComponent } from './account-context.component';
import { SelectionContextComponent } from './selection-context.component';
import { WorkspaceComponent } from './workspace.component';

@Component({
  selector: 'app-shared-state-chat',
  imports: [
    CopilotChat,
    WorkspaceComponent,
    AccountContextComponent,
    SelectionContextComponent,
  ],
  template: `
    <div style="display: flex; height: 100%; gap: 1rem">
      <div style="width: 20rem; overflow-y: auto; padding: 1rem">
        <app-workspace />
        <app-account-context />
        <app-selection-context />
      </div>
      <div style="flex: 1; min-width: 0">
        <copilot-chat />
      </div>
    </div>
  `,
})
export class SharedStateChatComponent {}
// shared state : shared state chat end
