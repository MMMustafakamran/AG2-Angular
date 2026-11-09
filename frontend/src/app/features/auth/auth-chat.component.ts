// auth : update the runtime connection after sign-in start
/**
 * Authentication guide, "When sign-in state changes after bootstrap, update the
 * runtime connection through the CopilotKit service" (verbatim body in `apply`).
 * https://docs.copilotkit.ai/angular/ag2/auth
 *
 * HARNESS: the guide never defines the session (`readSessionToken()`, `sessionToken`) or the
 * server's `verifySession()` (FINDINGS.md #10). This demo starts signed out, so requests reach
 * the guide's `onRequest` hook without a token (401), and the "Sign in" button sets the
 * Showcase's own `demo-token-123` (the guide's DEMO_AUTH_HEADERS). The chat talks to the runtime
 * mount that runs that hook (frontend/auth-runtime.ts, under /auth on 8240).
 */
import { Component, inject, signal } from "@angular/core";
import { CopilotChat, CopilotKit } from "@copilotkit/angular";

@Component({
  selector: "app-auth-chat",
  imports: [CopilotChat],
  template: `
    <div style="display: flex; flex-direction: column; height: 100%">
      <div style="display: flex; gap: 0.75rem; align-items: center; padding: 0.5rem 1rem; border-bottom: 1px solid #e2e8f0">
        @if (sessionToken()) {
          <span>Signed in</span>
          <button type="button" (click)="signOut()">Sign out</button>
        } @else {
          <span>Signed out</span>
          <button type="button" (click)="signIn()">Sign in</button>
        }
      </div>
      <div style="flex: 1; min-height: 0"><copilot-chat /></div>
    </div>
  `,
})
export class AuthChatComponent {
  private readonly copilotKit = inject(CopilotKit);
  protected readonly sessionToken = signal<string | null>(null); // HARNESS: the guide's session

  constructor() {
    this.copilotKit.updateRuntime({ runtimeUrl: "http://localhost:8240/auth/api/copilotkit" }); // HARNESS: auth-hook runtime mount
    this.apply();
  }

  protected signIn(): void {
    this.sessionToken.set("demo-token-123"); // HARNESS: the Showcase's DEMO_AUTH_HEADERS token
    this.apply();
  }

  protected signOut(): void {
    this.sessionToken.set(null);
    this.apply();
  }

  private apply(): void {
    const copilotKit = this.copilotKit;
    const sessionToken = this.sessionToken();
    // --- verbatim from the doc ---
    copilotKit.updateRuntime({
      headers: sessionToken
        ? { Authorization: `Bearer ${sessionToken}` }
        : {},
    });
    // --- end verbatim ---
  }
}
// auth : update the runtime connection after sign-in end
