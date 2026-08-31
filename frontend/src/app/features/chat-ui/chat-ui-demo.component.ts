/**
 * Harness wrapper that mounts the guide's chat surfaces one at a time.
 *
 * The popup and the sidebar each get their own tab AND their own host
 * component. The guide declares both in a single component, but both render a
 * launcher at the same fixed coordinates, so mounting them together stacks two
 * launchers on one spot and the sidebar — rendered second — swallows every
 * click. The guide's combined component stays verbatim in
 * popup-sidebar.component.ts and is what the route page displays as source.
 *
 * Bindings on the split hosts are the guide's, unchanged.
 *
 * `.support-chat` is applied to the inline tab only. It is the scope class for
 * the guide's "Scope CSS changes" block, which repaints the message bubbles —
 * putting it on the shared host would tint the custom-message, popup, and
 * sidebar surfaces too, and each of those is meant to show its own default
 * styling.
 */
import { Component, signal } from '@angular/core';

import { CustomMessageChatComponent } from './custom-message-chat.component';
import { PopupOnlyComponent } from './popup-only.component';
import { SidebarOnlyComponent } from './sidebar-only.component';
import { SupportChatComponent } from './support-chat.component';

type Surface = 'inline' | 'custom-message' | 'popup' | 'sidebar';

@Component({
  selector: 'app-chat-ui-demo',
  imports: [
    SupportChatComponent,
    CustomMessageChatComponent,
    PopupOnlyComponent,
    SidebarOnlyComponent,
  ],
  template: `
    <div class="flex h-full flex-col gap-4 p-4">
      <div role="tablist" aria-label="Chat surface" class="flex flex-wrap gap-2">
        @for (tab of tabs; track tab.id) {
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="surface() === tab.id"
            class="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
            [class]="
              surface() === tab.id
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]'
            "
            (click)="surface.set(tab.id)"
          >
            {{ tab.label }}
          </button>
        }
      </div>

      <div class="min-h-0 flex-1">
        @switch (surface()) {
          @case ('inline') {
            <!-- Scope class for the guide's CSS block — this tab only. -->
            <div class="support-chat h-full">
              <app-support-chat />
            </div>
          }
          @case ('custom-message') {
            <div class="h-full">
              <app-custom-message-chat />
            </div>
          }
          @case ('popup') {
            <div class="space-y-3">
              <p class="text-sm text-[var(--ink-soft)]">
                <code>copilot-popup</code> opens from a floating launcher and
                exposes a two-way <code>open</code> model, so the harness can
                open it from here. It manages focus, closes on Escape, and
                restores focus to the launcher.
              </p>
              <button
                type="button"
                class="rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
                (click)="popupHost.popupOpen.set(!popupHost.popupOpen())"
              >
                {{ popupHost.popupOpen() ? 'Close' : 'Open' }} popup
              </button>
              <app-popup-only #popupHost />
            </div>
          }
          @case ('sidebar') {
            <div class="space-y-3">
              <p class="text-sm text-[var(--ink-soft)]">
                <code>copilot-sidebar</code> is docked to the right at 480px.
                Compact viewports render it as a modal even when
                <code>mode</code> is <code>"docked"</code>, and only one open
                docked sidebar can own the page margin at a time.
              </p>
              <button
                type="button"
                class="rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-1.5 text-sm font-medium text-[var(--ink-soft)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
                (click)="sidebarHost.sidebarOpen.set(!sidebarHost.sidebarOpen())"
              >
                {{ sidebarHost.sidebarOpen() ? 'Close' : 'Open' }} sidebar
              </button>
              <app-sidebar-only #sidebarHost />
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class ChatUiDemoComponent {
  protected readonly surface = signal<Surface>('inline');
  protected readonly tabs: ReadonlyArray<{ id: Surface; label: string }> = [
    { id: 'inline', label: 'Inline chat' },
    { id: 'custom-message', label: 'Custom assistant message' },
    { id: 'popup', label: 'Popup' },
    { id: 'sidebar', label: 'Sidebar' },
  ];
}
