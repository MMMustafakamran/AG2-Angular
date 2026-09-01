/**
 * A chat, so the Inspector has something to inspect.
 * https://docs.copilotkit.ai/angular/ag2/inspector
 *
 * Nothing here mounts the Inspector, and that is the page's whole point:
 * `@copilotkit/angular` mounts it for you — the `CopilotKit` service creates
 * `cpk-web-inspector`, supplies the application's core, and appends it to
 * `document.body` after the first browser render. The chat exists because
 * something has to inject that service; a notes route with no CopilotKit
 * consumer on it never constructs one, and so never gets a launcher.
 *
 * The page is emphatic that a hand-written mount must be deleted rather than
 * left alongside it: the framework reuses an existing `cpk-web-inspector`, but
 * a hand-rolled component's `DestroyRef.onDestroy` removes that element
 * unconditionally, so a route change tears out the Inspector the framework is
 * driving and it does not return without a full reload. This repo has never had
 * one, so there was nothing to retract.
 */
import { Component } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';

@Component({
  selector: 'app-inspector-chat',
  imports: [CopilotChat],
  template: `
    <div style="height: 100%">
      <copilot-chat />
    </div>
  `,
})
export class InspectorChatComponent {}
