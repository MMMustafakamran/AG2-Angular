// shared state : send read-only application context start
/**
 * "Send read-only application context", verbatim. The accessor form keeps the
 * signal reads reactive, so changing the timezone re-registers the context.
 * https://docs.copilotkit.ai/angular/ag2/guides/shared-state
 */

import { Component, signal } from '@angular/core';
import { connectAgentContext } from '@copilotkit/angular';

@Component({
  selector: 'app-account-context',
  template: `
    <br>
    <button type="button" (click)="timezone.set('Europe/London')">
      Use London time
    </button>
  `,
})
export class AccountContextComponent {
  readonly userName = signal('Ada');
  readonly timezone = signal('America/Los_Angeles');

  constructor() {
    connectAgentContext(() => ({
      description: 'Current account and timezone',
      value: JSON.stringify({
        userName: this.userName(),
        timezone: this.timezone(),
      }),
    }));
  }
}
// shared state : send read-only application context end
