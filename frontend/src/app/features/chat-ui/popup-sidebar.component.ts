// chat ui : use a popup or sidebar start
/**
 * "Use a popup or sidebar", verbatim except for the class name and selector
 * (the guide mounts it as `AppComponent` / `app-root`).
 * https://docs.copilotkit.ai/angular/ag2/guides/chat-ui
 */

import { Component, signal } from '@angular/core';
import { CopilotPopup, CopilotSidebar } from '@copilotkit/angular';

@Component({
  selector: 'app-popup-sidebar',
  imports: [CopilotPopup, CopilotSidebar],
  template: `
    <copilot-popup
      [(open)]="popupOpen"
      title="Support assistant"
      [clickOutsideToClose]="true"
    />

    <copilot-sidebar
      [(open)]="sidebarOpen"
      mode="docked"
      position="right"
      title="Workspace assistant"
      [width]="480"
    />
  `,
})
export class PopupSidebarComponent {
  readonly popupOpen = signal(false);
  readonly sidebarOpen = signal(false);
}
// chat ui : use a popup or sidebar end
