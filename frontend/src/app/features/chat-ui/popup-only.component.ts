// chat ui : use a popup start
/**
 * The popup half of the guide's "Use a popup or sidebar" sample, on its own
 * host. Bindings are the guide's, unchanged.
 *
 * The guide declares `copilot-popup` and `copilot-sidebar` in one component.
 * Both render a launcher at the same fixed coordinates
 * (`right: max(1.5rem, …); bottom: max(1.5rem, …)`), so mounting them together
 * stacks two launchers on one spot and the sidebar — rendered second — takes
 * every click. Splitting them is what makes each surface separately testable;
 * the combined component is kept verbatim in popup-sidebar.component.ts and
 * shown as the source on the route page.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/chat-ui
 */

import { Component, signal } from '@angular/core';
import { CopilotPopup } from '@copilotkit/angular';

@Component({
  selector: 'app-popup-only',
  imports: [CopilotPopup],
  template: `
    <copilot-popup
      [(open)]="popupOpen"
      title="Support assistant"
      [clickOutsideToClose]="true"
    />
  `,
})
export class PopupOnlyComponent {
  readonly popupOpen = signal(false);
}
// chat ui : use a popup end
