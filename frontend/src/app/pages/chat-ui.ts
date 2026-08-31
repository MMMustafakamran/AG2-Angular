import { Component } from '@angular/core';

import { RouteHeader } from '../components/route-header';
import { Panel, SourceCode, TryIt } from '../components/ui';

@Component({
  selector: 'app-chat-ui-page',
  imports: [RouteHeader, Panel, TryIt, SourceCode],
  template: `
    <app-route-header path="/chat-ui" />

    <div class="space-y-6">
      <ui-try-it>
        <p class="mt-1 text-[var(--ink-soft)]">
          Open the demo, send <em>What is CopilotKit?</em> on the
          <strong>Inline chat</strong> tab, then walk the other three.
        </p>
        <p class="mt-2 text-[var(--ink-soft)]">
          <strong>Pass:</strong> the inline chat shows blue user bubbles and
          pale-blue assistant bubbles — the guide's scoped CSS, and the
          <em>only</em> tab that should be tinted. The
          <strong>Custom assistant message</strong> tab renders replies through
          a hand-written component labelled "Assistant", on default styling.
          On <strong>Popup</strong> and <strong>Sidebar</strong>, the floating
          launcher in the bottom-right opens <em>that tab's</em> surface — the
          popup as a centred window, the sidebar docked to the right at 480px —
          and both manage focus and close on Escape.
          <strong>Fail:</strong> a surface renders blank, the tabs look
          identical, the blue bubbles bleed into a tab other than the first, or
          the launcher on the Popup tab opens the sidebar.
        </p>
      </ui-try-it>
      <ui-panel heading="Inline chat">
        <p class="mb-3 text-sm text-[var(--ink-soft)]">
          <code>agentId="support"</code> resolves because
          <code>frontend/server.ts</code> registers a
          <code>support</code> agent alongside <code>default</code>, both
          pointing at the same AG2 process. That keeps the guide's
          snippet
          runnable as written.
        </p>
        <ui-source
          path="src/app/features/chat-ui/support-chat.component.ts"
        />
      </ui-panel>

      <ui-panel heading="Replace an assistant message">
        <p class="mb-3 text-sm text-[var(--ink-soft)]">
          CopilotKit creates the component for each assistant message and binds
          its <code>message</code> input.
        </p>
        <ui-source
          path="src/app/features/chat-ui/custom-assistant-message.component.ts"
        />
        <div class="mt-4">
          <ui-source
            path="src/app/features/chat-ui/custom-message-chat.component.ts"
            note="renamed — the guide gives two components the same name"
          />
        </div>
      </ui-panel>

      <ui-panel heading="Popup and sidebar">
        <p class="mb-3 text-sm text-[var(--ink-soft)]">
          Both expose a two-way <code>open</code> model. Compact viewports render
          the sidebar as a modal even when <code>mode</code> is
          <code>"docked"</code>, and only one open docked sidebar can own the
          page margin at a time. The guide declares both in a single component,
          which is kept intact here — the demo mounts one instance per tab and
          drives only that tab's surface.
        </p>
        <ui-source
          path="src/app/features/chat-ui/popup-sidebar.component.ts"
          note="the guide's combined component — source only, not mounted"
        />

        <p class="mt-4 mb-3 text-sm text-[var(--ink-soft)]">
          What the demo actually mounts: the same two surfaces, one per host, so
          only one launcher exists at a time.
        </p>
        <ui-source path="src/app/features/chat-ui/popup-only.component.ts" />
        <div class="mt-4">
          <ui-source path="src/app/features/chat-ui/sidebar-only.component.ts" />
        </div>
      </ui-panel>

      <ui-panel heading="Scoped chat CSS">
        <p class="mb-3 text-sm text-[var(--ink-soft)]">
          The package stylesheet exposes stable chat classes. The guide's
          <code>.support-chat</code> scope block is in the global stylesheet,
          and the demo puts that class on the inline tab's host only — which is
          what keeps the change local, as the guide intends.
        </p>
        <ui-source path="src/styles.css" note="see the Chat UI guide section" />
      </ui-panel>
    </div>
  `,
})
export default class ChatUiPage {}
