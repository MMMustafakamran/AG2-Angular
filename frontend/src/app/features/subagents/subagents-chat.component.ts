/**
 * HARNESS: Sub-agents demo host. The guide's Angular snippet is a fragment of a
 * Showcase class (`readDelegations`, `subAgentRendererConfig` are never defined)
 * and its Python agent cannot be imported (FINDINGS.md #5), so the chat here runs
 * against the quickstart agent: no supervisor, no sub-agent tools, no delegations.
 */
import { Component, computed } from '@angular/core';
import { CopilotChat, injectAgentStore } from '@copilotkit/angular';

@Component({
  selector: 'app-subagents-chat',
  imports: [CopilotChat],
  template: `
    <div style="display: flex; height: 100%">
      <section style="width: 22rem; padding: 1rem; border-right: 1px solid #e2e8f0; overflow: auto">
        <h3 style="font-weight: 600">Delegation log</h3>
        @for (d of delegations(); track $index) {
          <p>{{ d.sub_agent }}: {{ d.task }}</p>
        } @empty {
          <p style="color: #64748b">No delegations yet.</p>
        }
      </section>
      <div style="flex: 1; min-width: 0"><copilot-chat /></div>
    </div>
  `,
})
export class SubagentsChatComponent {
  private readonly agentStore = injectAgentStore('default');
  protected readonly delegations = computed(
    () =>
      ((this.agentStore().state() as { delegations?: { sub_agent: string; task: string }[] } | undefined)
        ?.delegations ?? []),
  );
}
