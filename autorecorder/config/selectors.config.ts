/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ADAPT THIS FILE — 2 of 3
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The DOM contract: how the recorder finds the chat surface it has to drive.
 *
 * This is the file that changes when the *frontend* changes rather than the
 * backend — a React project using CopilotKit's prebuilt components and an
 * Angular one rendering its own chat need different answers here, even though
 * both document the same features.
 *
 * These are Playwright selectors, so `:has-text()` and friends are available.
 * Keep each one as narrow as the app allows; a selector that matches a wrapping
 * container will still "work" and then position the cursor somewhere useless.
 *
 * `npm run doctor --online` checks each of these against a live demo page and
 * reports which ones match nothing, so you find out here rather than by
 * watching seventeen videos.
 */

export interface SelectorContract {
  /** The prompt box. First match wins, so order matters. */
  chatInput: string;

  /**
   * Send control. Optional: when it matches nothing the recorder presses Enter,
   * which is what happens on CopilotKit v2 — its send button carries no `type`,
   * no `aria-label` and no text, only `cpk:` utility classes, so there is
   * nothing stable to target. `doctor --online` reports a no-match as a warning
   * rather than an error for that reason.
   *
   * Worth setting if this frontend has a targetable send button: the cursor then
   * visibly travels to it and clicks, which reads better on video.
   */
  chatSubmit: string;

  /**
   * Assistant messages, used to detect that a reply started and finished.
   * Must match *only* messages — matching a container makes every reply look
   * complete the instant it starts.
   *
   * Pages that replace the message view via a slot need their own selector;
   * pass it per-call rather than changing this default.
   */
  assistantMessage: string;

  /** Any of these appearing means the demo has rendered enough to drive. */
  chatReady: string;

  /** Doc page has painted enough to start reading. */
  docContentReady: string;

  /** Code blocks on the doc page, so the cursor can rest on one. */
  docCodeBlock: string;
}

export const SELECTORS: SelectorContract = {
  // `copilot-chat` renders a plain <textarea>. The headless demo hand-rolls its
  // own, also a <textarea>, so one selector covers both.
  chatInput: 'copilot-chat textarea, textarea, input[type="text"], [contenteditable="true"]',

  // Angular's prebuilt composer does expose a targetable send control --
  // `copilot-chat-send-button` with aria-label="Send message" -- so unlike the
  // React variants the cursor visibly travels to it and clicks.
  chatSubmit:
    'copilot-chat-send-button button, copilot-chat-send-button, button[aria-label="Send message"], button[aria-label*="Send" i], button[type="submit"], button:has-text("Send")',

  // `copilot-chat-assistant-message` is the element the Angular package renders
  // per assistant turn -- one element per message, which is what the completion
  // detector needs.
  //
  // The two harness-specific entries are for demos that render no CopilotKit
  // chrome at all: `app-custom-assistant-message` (the chat-ui guide's replaced
  // message component) and `article[data-role="assistant"]` (the headless
  // transcript). Both are still *per message*, so neither breaks the "did this
  // reply finish" logic. Tool-call surfaces (app-weather-card,
  // app-approval-card) are deliberately NOT here -- their handlers wait on them
  // explicitly, and putting them in the global selector would let a rendered
  // card count as a finished text reply.
  // Verified against a live reply: `[data-message-role="assistant"]` is a div
  // *inside* copilot-chat-assistant-message, so including both counted every
  // reply twice and pointed `.last()` at the inner node. Only the wrapper is
  // listed.
  assistantMessage:
    'copilot-chat-assistant-message, app-custom-assistant-message, article[data-role="assistant"]',

  chatReady:
    'copilot-chat, copilot-sidebar, copilot-popup, app-demo-frame, textarea, input[type="text"], [contenteditable="true"], [role="tablist"]',

  docContentReady: 'h1, article, main, [class*="content"], pre',

  docCodeBlock: 'pre, div[class*="code"], code',
};
