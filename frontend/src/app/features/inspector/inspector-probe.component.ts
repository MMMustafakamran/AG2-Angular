/**
 * The mount check the Inspector page needs and cannot get from the chat.
 * https://docs.copilotkit.ai/angular/ag2/inspector
 *
 * The page makes one claim that is checkable from the page itself:
 * `@copilotkit/angular` mounts the Inspector for you, by having the
 * `CopilotKit` service create a `cpk-web-inspector` element and append it to
 * `document.body` after the first browser render.
 *
 * Nothing here mounts anything, and that is the point — the guide is explicit
 * that a hand-written mount must be deleted, so this component only *observes*
 * whether the framework did the mounting and reports what it found. Without it
 * the only evidence in a recording is a launcher in the corner of a 1920×1080
 * frame, which is not something a viewer can read.
 *
 * Three outcomes, because the guide describes three situations:
 *   `mounted`   — exactly one element, the documented result.
 *   `duplicate` — more than one, the state a leftover hand-written mount
 *                 produces, and the failure the guide spends most of its space
 *                 warning about.
 *   `absent`    — none. A real reading rather than an error: on 0.4.0 the
 *                 element appears only once something *injects* `CopilotKit`,
 *                 because Angular constructs a root-provided service lazily, so
 *                 a route that configures CopilotKit but renders no consumer
 *                 has no Inspector.
 *
 * The probe runs after a paint rather than in the constructor: the element is
 * appended after the first browser render, so reading for it any earlier
 * reports a false negative — and on the server there is no document at all.
 */
import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';

/** What the probe found, once it has actually looked. */
type ProbeResult = {
  /** How many `cpk-web-inspector` elements are in the document. */
  count: number;
  /** Whether that element is a child of `document.body`, as documented. */
  onBody: boolean;
};

@Component({
  selector: 'app-inspector-probe',
  template: `
    <section
      data-testid="probe"
      aria-labelledby="inspector-probe-title"
      class="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm"
    >
      <h2 id="inspector-probe-title" class="sr-only">Inspector mount check</h2>

      <span
        data-testid="probe-verdict"
        [attr.data-state]="state()"
        class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
        [class]="badgeClass()"
      >
        {{ badge() }}
      </span>

      <span class="text-[var(--muted)]">{{ verdict() }}</span>

      <span class="ml-auto text-xs text-[var(--muted)]">
        elements:
        <span data-testid="probe-count">{{ result()?.count ?? '—' }}</span>
        · on document.body:
        <span data-testid="probe-on-body">{{
          result() ? (result()!.onBody ? 'yes' : 'no') : '—'
        }}</span>
      </span>
    </section>
  `,
})
export class InspectorProbeComponent {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly result = signal<ProbeResult | null>(null);

  protected readonly state = computed<
    'mounted' | 'absent' | 'duplicate' | 'pending'
  >(() => {
    const found = this.result();
    if (!found) return 'pending';
    if (found.count === 0) return 'absent';
    if (found.count > 1) return 'duplicate';
    return 'mounted';
  });

  protected readonly badge = computed(() => {
    switch (this.state()) {
      case 'mounted':
        return 'cpk-web-inspector mounted';
      case 'absent':
        return 'no cpk-web-inspector';
      case 'duplicate':
        return 'more than one cpk-web-inspector';
      default:
        return 'checking…';
    }
  });

  protected readonly badgeClass = computed(() =>
    this.state() === 'mounted'
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-amber-50 text-amber-800',
  );

  protected readonly verdict = computed(() => {
    switch (this.state()) {
      case 'mounted':
        return 'The framework mounted it. Nothing in this app creates the element.';
      case 'absent':
        return 'Nothing on this route has injected the CopilotKit service yet, so no element exists.';
      case 'duplicate':
        return 'A leftover hand-written mount produces exactly this — the guide says delete it.';
      default:
        return 'Waiting for the first browser render…';
    }
  });

  constructor() {
    if (!this.isBrowser) return;

    afterNextRender(() => this.probe());

    // Re-probed rather than read once, for two reasons: the element appears the
    // moment a CopilotKit consumer is first mounted, which can be later than
    // this component's own render; and a route change that destroyed a
    // hand-written mount is exactly the scenario the guide warns takes the
    // Inspector away without a reload.
    const timer = setInterval(() => this.probe(), 1_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  private probe(): void {
    const elements = document.querySelectorAll('cpk-web-inspector');
    this.result.set({
      count: elements.length,
      onBody: Array.from(elements).some(
        (el) => el.parentElement === document.body,
      ),
    });
  }
}
