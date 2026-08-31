import { Component, signal } from '@angular/core';

interface Probe {
  label: string;
  url: string;
  hint: string;
  ok: boolean | null;
  detail: string;
}

/**
 * Live connection check for the two processes this harness talks to.
 *
 * The runtime probe is the check the Angular quickstart's troubleshooting box
 * prescribes: `/api/copilotkit/info` should report the registered agents.
 */
@Component({
  selector: 'app-backend-health',
  template: `
    <div class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-base font-semibold text-slate-900">Connection check</h2>
        <button
          type="button"
          class="rounded-md border border-slate-300 px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
          [disabled]="checking()"
          (click)="check()"
        >
          {{ checking() ? 'Checking…' : 'Recheck' }}
        </button>
      </div>

      <ul class="space-y-2">
        @for (probe of probes(); track probe.url) {
          <li
            class="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3"
          >
            <span
              class="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              [class]="
                probe.ok === null
                  ? 'bg-slate-300'
                  : probe.ok
                    ? 'bg-emerald-500'
                    : 'bg-red-500'
              "
              [attr.aria-label]="
                probe.ok === null
                  ? 'not checked'
                  : probe.ok
                    ? 'reachable'
                    : 'unreachable'
              "
            ></span>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-slate-900">
                {{ probe.label }}
              </p>
              <p class="font-mono text-xs break-all text-slate-500">
                {{ probe.url }}
              </p>
              <p class="mt-1 text-xs text-slate-600">
                {{ probe.detail || probe.hint }}
              </p>
            </div>
          </li>
        }
      </ul>
    </div>
  `,
})
export class BackendHealth {
  protected readonly checking = signal(false);
  protected readonly probes = signal<Probe[]>([
    {
      label: 'Copilot Runtime',
      url: 'http://localhost:8401/api/copilotkit/info',
      hint: 'Start it with: npm run runtime',
      ok: null,
      detail: '',
    },
    {
      // The AG2 AG-UI endpoint is POST-only, so there is no health
      // route to GET. FastAPI's generated schema is the reachability signal
      // that the agent process is up.
      label: 'AG2 agent',
      url: 'http://localhost:8400/openapi.json',
      hint: 'Start it with: uv run main.py (from backend/)',
      ok: null,
      detail: '',
    },
  ]);

  constructor() {
    void this.check();
  }

  protected async check(): Promise<void> {
    this.checking.set(true);
    const next = await Promise.all(
      this.probes().map(async (probe) => {
        try {
          const response = await fetch(probe.url, { method: 'GET' });
          return {
            ...probe,
            ok: response.ok,
            detail: `${response.status} from ${probe.url}`,
          };
        } catch {
          return { ...probe, ok: false, detail: `unreachable — ${probe.hint}` };
        }
      }),
    );
    this.probes.set(next);
    this.checking.set(false);
  }
}
