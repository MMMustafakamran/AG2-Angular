/** Small presentational primitives shared by every route page. */
import { Component, computed, input, signal } from '@angular/core';

import { readSource } from '../lib/generated-sources';
import {
  highlight,
  languageForPath,
  type CodeLanguage,
} from '../lib/highlight';
import { STATUS_LABEL, type RouteStatus } from '../lib/nav-config';

@Component({
  selector: 'ui-panel',
  template: `
    <section
      class="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgb(13_21_38/0.04),0_8px_24px_-20px_rgb(13_21_38/0.35)]"
    >
      @if (heading()) {
        <h2 class="mb-3 text-base font-semibold text-[var(--ink)]">
          {{ heading() }}
        </h2>
      }
      <div class="text-[var(--ink-soft)]">
        <ng-content />
      </div>
    </section>
  `,
})
export class Panel {
  readonly heading = input<string>();
}

@Component({
  selector: 'ui-callout',
  template: `
    <aside
      class="rounded-lg border border-l-4 p-4 text-sm"
      [class]="tone() === 'warn' ? warnClasses : infoClasses"
    >
      @if (title()) {
        <p class="mb-1 font-semibold">{{ title() }}</p>
      }
      <ng-content />
    </aside>
  `,
})
export class Callout {
  readonly title = input<string>();
  readonly tone = input<'info' | 'warn'>('info');

  protected readonly infoClasses =
    'border-indigo-200 border-l-indigo-500 bg-indigo-50/70 text-indigo-950';
  protected readonly warnClasses =
    'border-amber-200 border-l-amber-500 bg-amber-50/80 text-amber-950';
}

/** Pass/fail instructions for a manual tester. */
@Component({
  selector: 'ui-try-it',
  template: `
    <div
      class="rounded-lg border border-[var(--line-strong)] bg-[var(--surface-sunken)] p-4 text-sm text-[var(--ink-soft)]"
    >
      <p
        class="mb-1 flex items-center gap-2 font-semibold text-[var(--accent-ink)]"
      >
        <span
          class="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
          aria-hidden="true"
        ></span>
        Try it
      </p>
      <ng-content />
    </div>
  `,
})
export class TryIt {}

@Component({
  selector: 'ui-status-badge',
  template: `
    <span
      class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      [class]="classes()"
      >{{ label() }}</span
    >
  `,
})
export class StatusBadge {
  readonly status = input.required<RouteStatus>();

  protected readonly label = computed(() => STATUS_LABEL[this.status()]);
  protected readonly classes = computed(() => {
    switch (this.status()) {
      case 'working':
        return 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200';
      case 'partial':
        return 'bg-amber-50 text-amber-900 ring-1 ring-amber-200';
      case 'reference':
        return 'bg-slate-100 text-slate-700 ring-1 ring-slate-300';
      case 'broken':
        return 'bg-rose-50 text-rose-800 ring-1 ring-rose-200';
      default:
        return 'bg-slate-50 text-slate-600 ring-1 ring-slate-200';
    }
  });
}

/**
 * Renders a repo file verbatim, read from the generated source map so the code
 * on the page is byte-identical to the code that runs.
 */
@Component({
  selector: 'ui-source',
  template: `
    <figure class="code-figure">
      <figcaption class="code-figure__bar">
        <div class="code-figure__path-group">
          <span class="code-figure__path">{{ path() }}</span>
          <button
            type="button"
            class="code-figure__copy-path"
            [attr.aria-label]="'Copy file path ' + path() + ' to clipboard'"
            (click)="copyPath()"
          >
            @if (pathCopied()) {
              <svg class="code-figure__icon text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
              <span>Path copied!</span>
            } @else {
              <svg class="code-figure__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy path</span>
            }
          </button>
          <a
            [href]="ideUri()"
            class="code-figure__open-ide"
            [attr.aria-label]="'Open ' + path() + ' in IDE'"
            title="Open file in IDE"
          >
            <svg class="code-figure__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            <span>Open in IDE</span>
          </a>
        </div>
        @if (note()) {
          <span class="code-figure__meta">
            <span class="code-figure__note">{{ note() }}</span>
          </span>
        }
      </figcaption>
      <pre class="code-figure__pre"><code [innerHTML]="html()"></code></pre>
    </figure>
  `,
})
export class SourceCode {
  /** Repo-relative path, e.g. `src/app/features/quickstart/quickstart-chat.ts`. */
  readonly path = input.required<string>();
  readonly note = input<string>();

  protected readonly pathCopied = signal(false);
  protected readonly body = computed(() => readSource(this.path()));
  protected readonly language = computed(() => languageForPath(this.path()));
  protected readonly ideUri = computed(() => {
    const p = this.path();
    const base = 'c:/Users/dynamic computer/Desktop/work/FIQROS/optimized-malaika/ag2-angular';
    const fullPath = p.startsWith('backend/') ? `${base}/${p}` : `${base}/frontend/${p}`;
    return `vscode://file/${fullPath}`;
  });
  protected readonly html = computed(() =>
    highlight(this.body(), this.language()),
  );

  protected async copyPath(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.path());
      this.pathCopied.set(true);
      setTimeout(() => this.pathCopied.set(false), 1500);
    } catch {
      // Clipboard permission denied — path is selectable either way.
    }
  }
}

/** A code sample quoted from the docs that this repo does not mount. */
@Component({
  selector: 'ui-doc-sample',
  template: `
    <figure class="code-figure code-figure--quoted">
      <figcaption class="code-figure__bar">
        <div class="code-figure__path-group">
          <span class="code-figure__path">{{ caption() }}</span>
          <button
            type="button"
            class="code-figure__copy-path"
            [attr.aria-label]="'Copy ' + caption() + ' to clipboard'"
            (click)="copyCaption()"
          >
            @if (captionCopied()) {
              <svg class="code-figure__icon text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
              <span>Copied!</span>
            } @else {
              <svg class="code-figure__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy</span>
            }
          </button>
        </div>
        <span class="code-figure__meta">
          <span class="code-figure__badge">not mounted</span>
        </span>
      </figcaption>
      <pre class="code-figure__pre"><code [innerHTML]="html()"></code></pre>
    </figure>
  `,
})
export class DocSample {
  readonly caption = input.required<string>();
  readonly code = input.required<string>();
  readonly language = input<CodeLanguage>('typescript');

  protected readonly captionCopied = signal(false);
  protected readonly html = computed(() =>
    highlight(this.code(), this.language()),
  );

  protected async copyCaption(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.caption());
      this.captionCopied.set(true);
      setTimeout(() => this.captionCopied.set(false), 1500);
    } catch {
      // Clipboard permission denied
    }
  }
}
