import { Component } from '@angular/core';

import { RouteHeader } from '../components/route-header';
import { Callout, Panel, SourceCode, TryIt } from '../components/ui';

@Component({
  selector: 'app-shared-state-page',
  imports: [RouteHeader, Panel, Callout, TryIt, SourceCode],
  template: `
    <app-route-header path="/shared-state" />

    <div class="space-y-6">
      <ui-try-it>
        <p class="mt-1 text-slate-700">
          Open the demo. Press <strong>Mark high priority</strong>, then ask the
          agent the following questions 
          <br> <em>What is my current priority and what notes do I have?</em> 
          <br> <em>What is my name? </em> -> It should respond <b>Ada</b>
          <br> <em>What is my timezone? </em> -> It should respond <b> America/Los_Angeles._</b> 
          <br> Then press <strong>Use London time</strong> and ask
          <em>What timezone am I in, and which record am I looking at?</em>
        </p>
        <p class="mt-2 text-slate-700">
          <strong>Pass:</strong> the agent reports <code>high</code>, then
          reports <code>Europe/London</code> and <code>record-42</code>. Ask it
          to add a note and the list on the left updates.
          <strong>Fail:</strong> the agent has no idea what you're referring
          to.
        </p>
      </ui-try-it>

      <ui-panel heading="Two different data flows">
        <table class="w-full text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 text-slate-600">
              <th class="py-2 pr-4 font-semibold">Data flow</th>
              <th class="py-2 font-semibold">Use</th>
            </tr>
          </thead>
          <tbody class="text-slate-700">
            <tr class="border-b border-slate-100">
              <td class="py-2 pr-4">
                Agent and application both read and write the value
              </td>
              <td class="py-2">
                <code>injectAgentStore</code> and <code>agent.setState</code>
              </td>
            </tr>
            <tr>
              <td class="py-2 pr-4">
                The application owns the value and the agent only reads it
              </td>
              <td class="py-2">
                <code>connectAgentContext</code> or
                <code>CopilotKitAgentContext</code>
              </td>
            </tr>
          </tbody>
        </table>
      </ui-panel>

      <ui-panel heading="Read and write agent state">
        <p class="mb-3 text-sm text-slate-700">
          Read through <code>store().state()</code> so Angular tracks changes;
          write through the plain AG-UI agent at <code>store().agent</code>,
          replacing the object rather than mutating it.
        </p>
        <ui-source path="src/app/features/shared-state/workspace.component.ts" />
      </ui-panel>

      <ui-callout title="The agent has to agree on the state shape">
        The guide's component expects
        <code>{{ '{' }} notes, priority {{ '}' }}</code>. AG2 has no state
        schema to declare it against: shared state <em>is</em> the agent's
        context variables, published as the AG-UI
        <code>STATE_SNAPSHOT</code>. The agent in
        <code>backend/main.py</code> carries <code>language</code>, not
        <code>{{ '{' }} notes, priority {{ '}' }}</code>, so the panel sits on
        its <code>EMPTY_STATE</code> defaults until a tool writes those keys.
      </ui-callout>

      <ui-callout title="Writes from the browser are dropped">
        <code>agent.setState</code> is half of what this page teaches, and it
        does not reach an AG2 agent. The bridge merges the incoming AG-UI state
        <em>under</em> the agent's own variables —
        <code>initial_state = (incoming.state or {{ '{' }}{{ '}' }}) | initial_vars</code>
        in <code>ag2/ag_ui/stream.py</code> — so any key the agent already
        declares wins and the browser's value is discarded. Sending
        <code>state: {{ '{' }} "language": "spanish" {{ '}' }}</code> to an
        agent whose variables say <code>english</code> runs as
        <code>english</code>, and the first
        <code>STATE_SNAPSHOT</code> echoes <code>english</code> back. There is
        also no <code>STATE_DELTA</code> in the bridge, so state moves only at
        the start and the end of a run, never during it.
      </ui-callout>

      <ui-panel heading="Read-only context — accessor form">
        <p class="mb-3 text-sm text-slate-700">
          The internal effect removes the old context and registers the new
          value whenever a read signal changes, and removes the last
          registration when the owning injector is destroyed.
        </p>
        <ui-source
          path="src/app/features/shared-state/account-context.component.ts"
        />
      </ui-panel>

      <ui-panel heading="Read-only context — directive form">
        <p class="mb-3 text-sm text-slate-700">
          Render the directive only once you have a complete context: if it
          starts without one, later input changes do not create the first
          registration.
        </p>
        <ui-source
          path="src/app/features/shared-state/selection-context.component.ts"
        />
      </ui-panel>

      <ui-panel heading="All three, against one chat">
        <ui-source
          path="src/app/features/shared-state/shared-state-chat.component.ts"
        />
      </ui-panel>
    </div>
  `,
})
export default class SharedStatePage {}
