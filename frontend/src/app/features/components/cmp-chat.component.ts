/**
 * HARNESS: demo host for the nine "Components and surfaces" pages
 * (https://docs.copilotkit.ai/ag2/generative-ui/components and its children, Angular tab).
 *
 * Every Angular snippet on those pages imports from `@copilotkit/angular/generative-ui`
 * (`provideGenerativeUI`, `standardUI`, `createGenerativeUI`, `CopilotGenerativeUISurface`, ...).
 * The latest package, `@copilotkit/angular` 0.6.0, has no such entry point (TS2307), and
 * `ng serve` type-checks, so the verbatim code cannot be put in src/ without breaking every page.
 * It lives in frontend/doc-verbatim/cmp-<page>/ and the recorder type-checks it during the take.
 * This chat is the app as it stands without that provider: `<copilot-chat />` from the page's
 * src/app/app.ts.
 *
 * `runtime="components"` points the chat at the Components page's own TanStack runtime
 * (frontend/components-runtime.mts, :8242). The child pages say "your runtime needs no change",
 * so they keep the repo's AG2 runtime (frontend/server.ts, :8240).
 */
import { Component, inject, input, OnInit } from '@angular/core';
import { CopilotChat, CopilotKit } from '@copilotkit/angular';

@Component({
  selector: 'app-cmp-chat',
  imports: [CopilotChat],
  template: `<div style="height: 100%"><copilot-chat /></div>`,
})
export class CmpChatComponent implements OnInit {
  readonly runtime = input<'components' | 'ag2'>('ag2');
  private readonly copilotKit = inject(CopilotKit);

  ngOnInit(): void {
    this.copilotKit.updateRuntime({
      runtimeUrl:
        this.runtime() === 'components'
          ? 'http://localhost:8242/api/copilotkit' // HARNESS: doc's server.ts listens on 8200
          : 'http://localhost:8240/api/copilotkit', // HARNESS: the repo's AG2 runtime
    });
  }
}
