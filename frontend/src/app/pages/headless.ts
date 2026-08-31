import { Component } from '@angular/core';

import { RouteHeader } from '../components/route-header';
import { Callout, Panel, SourceCode, TryIt } from '../components/ui';

@Component({
  selector: 'app-headless-page',
  imports: [RouteHeader, Panel, Callout, TryIt, SourceCode],
  template: `
    <app-route-header path="/headless" />

    <div class="space-y-6">
      <ui-try-it>
        <p class="mt-1 text-slate-700">
          Open the demo, type into the bare textarea, and press
          <strong>Send</strong>.
        </p>
        <p class="mt-2 text-slate-700">
          <strong>Pass:</strong> the message appears in the hand-written
          transcript, "Agent is working…" shows while the run is in flight, and
          the reply streams in — with no CopilotKit chrome anywhere. Because the
          store is scoped to <code>default</code>, a conversation started on the
          Quickstart route is already visible here.
          <strong>Fail:</strong> Send does nothing, or the transcript never
          updates.
        </p>
      </ui-try-it>

      <ui-panel heading="What the store gives you">
        <ul class="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li><code>store().messages()</code> — the current conversation</li>
          <li><code>store().isRunning()</code> — for loading controls</li>
          <li>
            <code>store().agent</code> — <code>setState</code>,
            <code>addMessage</code>, <code>runAgent</code>, and
            <code>abortRun</code>
          </li>
        </ul>
        <p class="mt-3 text-sm text-slate-700">
          The pattern is two steps: add the user message to the agent, then run
          that same agent through <code>CopilotKitCore</code>.
        </p>
      </ui-panel>

      <ui-panel heading="The headless chat">
        <ui-source path="src/app/features/headless/headless-chat.component.ts" />
      </ui-panel>

      <ui-callout tone="warn" title="What the guide says to add in production">
        Wrap <code>runAgent</code> in error handling and keep repeated sends
        disabled while <code>isRunning()</code> is true. The sample above does
        the second but not the first — the guide's own note, kept verbatim here
        rather than quietly fixed. The Showcase controller below is its answer.
      </ui-callout>
    </div>
  `,
})
export default class HeadlessPage {
  protected readonly controllerSample = `// features/headless/headless-chat.ts
/** Signal-first controller shared by the two native Angular headless demos. */
export abstract class HeadlessChatController {
  private readonly copilotKit = inject(CopilotKit);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly agentStore: ReturnType<typeof injectAgentStore>;
  protected readonly inputValue = signal("");
  protected readonly error = signal<string | null>(null);
  protected readonly messages = computed(
    () => this.agentStore().messages() as ShowcaseMessage[],
  );
  protected readonly isRunning = computed(() => this.agentStore().isRunning());

  protected constructor(feature: string) {
    this.agentStore = injectAgentStore(agentIdForCurrentIntegration(feature));
  }

  protected updateInput(event: Event): void {
    this.inputValue.set((event.target as HTMLTextAreaElement).value);
  }

  protected handleComposerKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void this.send();
  }

  protected async send(override?: string): Promise<void> {
    const text = (override ?? this.inputValue()).trim();
    if (!text || this.isRunning()) return;

    this.error.set(null);
    const agent = this.agentStore().agent;
    const message = {
      id: createMessageId(),
      role: "user" as const,
      content: text,
    };
    agent.addMessage(message);
    this.inputValue.set("");

    try {
      await this.copilotKit.core.runAgent({ agent });
    } catch (error) {
      if (this.destroyRef.destroyed) return;
      console.error("[showcase-angular:headless] Agent run failed", error);
      this.error.set(
        error instanceof Error ? error.message : "The agent run failed.",
      );
    }
  }
}`;
}
