import { Component } from '@angular/core';

import { RouteHeader } from '../components/route-header';
import { Callout, DocSample, Panel, SourceCode, TryIt } from '../components/ui';

@Component({
  selector: 'app-threads-page',
  imports: [RouteHeader, Panel, Callout, TryIt, SourceCode, DocSample],
  template: `
    <app-route-header path="/threads" />

    <div class="space-y-6">
      <ui-try-it>
        <p class="mt-1 text-slate-700">
          Open the demo and look at both surfaces.
        </p>
        <p class="mt-2 text-slate-700">
          <strong>Pass (unlicensed — the case here):</strong> the headless list
          renders its controls with no threads, and the drawer renders its
          <em>locked</em> state. The locked state is the correct result: it
          proves the drawer mounted and read the platform's
          <code>threads</code> license feature.
          <strong>Pass (licensed):</strong> threads list, selecting a row
          replays that conversation into the chat beside it, and rename /
          archive / delete take effect.
          <strong>Fail:</strong> a blank area with no locked state at all.
        </p>
      </ui-try-it>

      <ui-callout tone="warn" title="Thread endpoints are a platform capability">
        Threads are served by the Enterprise Intelligence Platform through the
        runtime, not by the agent. Without a license key the list is empty by
        design
        — that is not a bug in this harness.
      </ui-callout>

      <ui-panel heading="Resume a specific thread">
        <p class="mb-3 text-sm text-slate-700">
          The simplest form is one input. Bind a selected id and the chat
          connects to that existing conversation.
        </p>
        <ui-doc-sample
          caption="Threads guide — the threadId input"
          [code]="threadIdSample"
        />
      </ui-panel>

      <ui-panel heading="A custom thread list on injectThreads">
        <p class="mb-3 text-sm text-slate-700">
          Inputs accept plain values or signals. The list is
          server-authoritative and uses realtime updates when the platform
          supplies a WebSocket URL.
        </p>
        <ui-source path="src/app/features/threads/thread-list.component.ts" />
      </ui-panel>

      <ui-callout tone="warn" title="Deletion is permanent">
        Rename, archive, unarchive, and delete all return promises. The guide is
        explicit: ask the user before calling <code>deleteThread</code>.
      </ui-callout>

      <ui-panel heading="The drop-in drawer">
        <p class="mb-3 text-sm text-slate-700">
          <code>CopilotThreadsDrawer</code> supplies the list, selection,
          filtering, pagination, and mutation controls. The drawer and the chat
          must share one
          <code>provideCopilotChatConfiguration</code> provider — that is what
          makes selection and new-thread actions update the chat.
        </p>
        <ui-source path="src/app/features/threads/conversations.component.ts" />
      </ui-panel>
    </div>
  `,
})
export default class ThreadsPage {
  protected readonly threadIdSample = `<copilot-chat agentId="support" [threadId]="selectedThreadId()" />`;
}
