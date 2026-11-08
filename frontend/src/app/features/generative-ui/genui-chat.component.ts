/**
 * HARNESS: Native generative UI demo host. The guide's `provideGenerativeUI` /
 * `standardUI` come from `@copilotkit/angular/generative-ui`, which the latest
 * package (0.6.0) does not ship (FINDINGS.md #6: TS2307). The verbatim files are
 * in frontend/doc-verbatim/generative-ui-components/ (outside src/, so the other
 * pages still build). This chat is the app as it stands without that provider.
 */
import { Component } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';

@Component({
  selector: 'app-genui-chat',
  imports: [CopilotChat],
  template: `<div style="height: 100%"><copilot-chat /></div>`,
})
export class GenUiChatComponent {}
