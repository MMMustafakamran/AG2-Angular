import { Component } from '@angular/core';

import { RouteHeader } from '../components/route-header';
import { Callout, Panel, SourceCode, TryIt } from '../components/ui';

@Component({
  selector: 'app-memory-page',
  imports: [RouteHeader, Panel, Callout, TryIt, SourceCode],
  template: `
    <app-route-header path="/memory" />

    <div class="space-y-6">
      <ui-try-it>
        <p class="mt-1 text-slate-700">Open the demo and read the left panel.</p>
        <p class="mt-2 text-slate-700">
          <strong>Pass (this runtime):</strong> "Memory is not available for
          this runtime." — the <code>isAvailable()</code> gate resolved false
          and the guide's fallback rendered, which is the whole point of the
          sample.
          <strong>Pass (a runtime with memory routes):</strong> the memory list
          renders and <strong>Forget</strong> removes an entry.
          <strong>Fail:</strong> an empty panel with neither the list nor the
          fallback, or a thrown error.
        </p>
      </ui-try-it>

      <ui-callout title="Check isAvailable() before showing memory controls">
        <code>injectMemories</code> exposes the current
        <em>runtime-authenticated</em> user's memory list, and a runtime may not
        provide the memory routes at all. The guide requires the gate for that
        reason — the harness does not add it.
      </ui-callout>

      <ui-panel heading="injectMemories">
        <ui-source path="src/app/features/memory/memory-list.component.ts" />
      </ui-panel>

      <ui-panel heading="Updating a memory replaces it">
        <p class="text-sm text-slate-700">
          <code>updateMemory</code> supersedes a memory with a full replacement
          and returns a <em>new record with a new id</em>. Re-send
          <code>content</code>, <code>kind</code>, and any
          <code>sourceThreadIds</code> you want to keep — anything you omit is
          gone from the new record.
        </p>
      </ui-panel>

      <ui-panel heading="Mounted beside a chat">
        <ui-source path="src/app/features/memory/memory-demo.component.ts" />
      </ui-panel>
    </div>
  `,
})
export default class MemoryPage {}
