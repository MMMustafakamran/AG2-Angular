// auth : update the runtime connection after sign-in start
/**
 * Authentication guide, "When sign-in state changes after bootstrap, update the
 * runtime connection through the CopilotKit service" (verbatim body below).
 * https://docs.copilotkit.ai/angular/ag2/auth
 *
 * HARNESS: the guide never defines `sessionToken`; this demo signs in with the
 * Showcase's own `demo-token-123` (the guide's DEMO_AUTH_HEADERS). It also points
 * the chat at the runtime mount that runs the guide's `onRequest` hook
 * (frontend/auth-runtime.ts, served under /auth on the 8240 runtime).
 */
import { Component, inject } from "@angular/core";
import { CopilotChat, CopilotKit } from "@copilotkit/angular";

@Component({
  selector: "app-auth-chat",
  imports: [CopilotChat],
  template: `<div style="height: 100%"><copilot-chat /></div>`,
})
export class AuthChatComponent {
  constructor() {
    const sessionToken: string | null = "demo-token-123"; // HARNESS: signed-in session (doc never defines it)
    const copilotKit = inject(CopilotKit);
    copilotKit.updateRuntime({ runtimeUrl: "http://localhost:8240/auth/api/copilotkit" }); // HARNESS: auth-hook runtime mount

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
