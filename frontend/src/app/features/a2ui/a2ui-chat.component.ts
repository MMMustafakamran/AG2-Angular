// a2ui : a2ui chat start
/**
 * A2UI needs no component-level wiring: the runtime applies A2UIMiddleware
 * (`a2ui: {}` in frontend/server.ts) and, per the guide, "on the frontend, the
 * A2UI renderer activates automatically. No extra configuration is needed."
 *
 * The recovery thresholds the guide prescribes are set once in
 * src/app/app.config.ts, and its catalog CSS lives in src/styles.css.
 * https://docs.copilotkit.ai/angular/ag2/guides/a2ui
 */

import { Component } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';

@Component({
  selector: 'app-a2ui-chat',
  imports: [CopilotChat],
  template: `
    <div style="height: 100%">
      <copilot-chat />
    </div>
  `,
})
export class A2uiChatComponent {}
// a2ui : a2ui chat end
