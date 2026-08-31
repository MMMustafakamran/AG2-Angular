// human in the loop : handle an interrupt start
/**
 * "Handle an interrupt", verbatim. The controller is headless, so this panel
 * renders nothing until the backend emits an AG-UI interrupt.
 * https://docs.copilotkit.ai/angular/ag2/guides/human-in-the-loop
 */

import { Component } from '@angular/core';
import { injectInterrupt } from '@copilotkit/angular';

type ReviewRequest = {
  title?: string;
  choices?: Array<{ id: string; label: string }>;
};

@Component({
  selector: 'app-interrupt-panel',
  template: `
    @if (controller.event(); as event) {
      @let request = asReviewRequest(event.value);
      <section aria-labelledby="review-title">
        <h2 id="review-title">{{ request.title ?? "Review required" }}</h2>

        @for (choice of request.choices ?? []; track choice.id) {
          <button type="button" (click)="resolve(choice.id)">
            {{ choice.label }}
          </button>
        }

        <button type="button" (click)="cancel()">Cancel</button>
      </section>
    }

    @if (controller.error()) {
      <p role="alert">The decision could not be submitted.</p>
    }
  `,
})
export class InterruptPanelComponent {
  // DIVERGENCE RESOLVED at @copilotkit/angular@0.4.0 — the doc's own form runs.
  //
  // The doc's snippet passes the agent id as a string:
  //
  //     injectInterrupt<ReviewRequest>('default');
  //
  // That did not compile against @copilotkit/angular@0.3.1, whose declaration
  // took an options object and had no string overload:
  //
  //     declare function injectInterrupt<TValue, TResult>(
  //       options?: InjectInterruptOptions<TValue, TResult>
  //     ): InterruptController<TValue, TResult>;
  //
  //   TS2559: Type '"default"' has no properties in common with type
  //           'InjectInterruptOptions<ReviewRequest, never>'
  //
  // This file carried the object form for as long as that was true, because one
  // compile error blocks every recording, not just this page. 0.4.0 publishes
  // the string-first overload:
  //
  //     declare function injectInterrupt<TValue, TResult>(
  //       agentId?: InterruptAgentId,
  //       options?: Omit<InjectInterruptOptions<TValue, TResult>, "agentId">
  //     ): InterruptController<TValue, TResult>;
  //
  // The finding stands as a doc-ahead-of-release defect — the page carried no
  // version note while the snippet was uncompilable — but it no longer blocks.
  //
  // human in the loop : inject interrupt start
  protected readonly controller = injectInterrupt<ReviewRequest>('default');
  // human in the loop : inject interrupt end

  protected asReviewRequest(value: unknown): ReviewRequest {
    return typeof value === 'object' && value !== null
      ? (value as ReviewRequest)
      : {};
  }

  protected resolve(choiceId: string): void {
    this.controller.resolve({ choiceId }).catch(() => undefined);
  }

  protected cancel(): void {
    this.controller.cancel().catch(() => undefined);
  }
}
// human in the loop : handle an interrupt end
