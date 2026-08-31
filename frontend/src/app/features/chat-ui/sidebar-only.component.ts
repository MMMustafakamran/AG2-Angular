// chat ui : use a sidebar start
/**
 * The sidebar half of the guide's "Use a popup or sidebar" sample, on its own
 * host. Bindings are the guide's, unchanged.
 *
 * See popup-only.component.ts for why the guide's combined component is split
 * for the demo: both surfaces render a launcher at the same fixed coordinates.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/chat-ui
 */

import { Component, signal } from '@angular/core';
import { CopilotSidebar } from '@copilotkit/angular';

@Component({
  selector: 'app-sidebar-only',
  imports: [CopilotSidebar],
  template: `
    <copilot-sidebar
      [(open)]="sidebarOpen"
      mode="docked"
      position="right"
      title="Workspace assistant"
      [width]="480"
    />
  `,
})
export class SidebarOnlyComponent {
  readonly sidebarOpen = signal(false);
}
// chat ui : use a sidebar end
