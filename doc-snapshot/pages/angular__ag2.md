# Angular

> Connect an Angular app to Copilot Runtime with CopilotKit.


`@copilotkit/angular` provides Angular components, directives, and services for CopilotKit. This guide gets you to a working Angular app with a chat UI backed by [Copilot Runtime](/angular/ag2/backend/copilot-runtime). When you select an agent backend in the sidebar, the backend step below changes with it; without a selection, the guide uses CopilotKit's `BuiltInAgent`.

The runtime runs on your server, keeps model credentials out of the browser, and exposes the `default` agent that `CopilotChat` uses automatically.

<OpsPlatformCTA
  variant="inline"
  title="Take your Angular copilot from local to production"
  body="Add durable threads, inspection, and managed or self-hosted CopilotKit Intelligence without changing the Angular frontend APIs in this guide."
  surface="docs:angular/quickstart:production"
/>

## What is CopilotKit for Angular?

CopilotKit for Angular is the first-party, signal-based Angular frontend for
AG-UI agents and Copilot Runtime. It provides complete chat surfaces and
headless APIs, and it supports zoneless applications.

## Prerequisites

- An OpenAI API key (or another model provider supported by [Model Selection](/angular/model-selection))
- Angular 22
- Node.js 22

## Getting started

<Steps>
    <Step>
        ### Create your Angular app

        If you don't have one already, pin the CLI to the supported major:

        ```bash
        npx @angular/cli@22 new my-copilot-app
        cd my-copilot-app
        ```
    </Step>
    <Step>
        ### Install CopilotKit

        Install the Angular frontend package, `@angular/cdk`, and `@copilotkit/runtime` for your local Copilot Runtime server:

        <Tabs groupId="package-manager" items={['npm', 'pnpm', 'yarn']}>
            <Tab value="npm">
                ```bash
                npm install @copilotkit/angular @angular/cdk @copilotkit/runtime
                npm install -D tsx typescript @types/node
                ```
            </Tab>
            <Tab value="pnpm">
                ```bash
                pnpm add @copilotkit/angular @angular/cdk @copilotkit/runtime
                pnpm add -D tsx typescript @types/node
                ```
            </Tab>
            <Tab value="yarn">
                ```bash
                yarn add @copilotkit/angular @angular/cdk @copilotkit/runtime
                yarn add -D tsx typescript @types/node
                ```
            </Tab>
        </Tabs>

        <Callout type="info" title="Match @angular/cdk to your Angular version">
          `@angular/cdk` must share your Angular major version. Most package managers resolve this for you, but if you hit a peer-dependency error, pin it explicitly (for example `@angular/cdk@^22`).
        </Callout>
    </Step>
    
    
      <Step>
        ### Connect the selected agent backend

        This URL keeps the agent backend selected. The Angular setup remains
        shared; the backend setup below comes from that integration's canonical
        showcase source.

        <!-- setup skipped: agent-setup is not bundled for ag2 -->

        <Callout type="info" title="Expose the selected backend through Copilot Runtime">
          Configure Copilot Runtime to register this backend as the `default`
          agent at `/api/copilotkit`. Continue with the selected backend's
          [Copilot Runtime guide](backend/copilot-runtime) for its runtime
          adapter, credentials, and server command. Do not replace it with the
          `BuiltInAgent` server from the standalone Angular path.
        </Callout>
      </Step>
    
    <Step>
        ### Import the styles

        Add the package stylesheet to your global styles. It's self-contained, so the chat renders without any other CSS.

        ```css title="src/styles.css"
        @import "@copilotkit/angular/styles.css"; /* [!code highlight] */
        ```
    </Step>
    <Step>
        ### Connect to Copilot Runtime

        Point `provideCopilotKit` at the runtime endpoint. The chat uses the agent that your runtime registers as `default`.

        ```ts title="src/app/app.config.ts"
        import { ApplicationConfig } from "@angular/core";
        import { provideCopilotKit } from "@copilotkit/angular"; // [!code highlight]

        export const appConfig: ApplicationConfig = {
          providers: [
            // [!code highlight:3]
            provideCopilotKit({
              runtimeUrl: "http://localhost:8200/api/copilotkit",
            }),
          ],
        };
        ```
    </Step>
    <Step>
        ### Add the chat UI

        Import the `CopilotChat` component into your root component and drop it into the template.

        ```ts title="src/app/app.ts"
        import { Component } from "@angular/core";
        import { CopilotChat } from "@copilotkit/angular"; // [!code highlight]

        @Component({
          selector: "app-root",
          imports: [CopilotChat], // [!code highlight]
          template: `
            <!-- [!code highlight:3] -->
            <div style="height: 100vh">
              <copilot-chat />
            </div>
          `,
        })
        export class App {}
        ```

    </Step>
    
    
      <Step>
        ### Run the backend, runtime, and Angular app

        Start the selected agent backend and Copilot Runtime with the commands
        from its runtime guide. Confirm
        `http://localhost:8200/api/copilotkit/info` reports the `default`
        agent, then start Angular:

        ```bash
        npm start
        ```

        Open the Angular CLI URL (usually `http://localhost:4200`) and send a
        message. The request now follows the selected path end to end:
        Angular → Copilot Runtime → your selected agent backend.
      </Step>
    
    <Step>
        ### Open Inspector and confirm setup

On localhost, click the Inspector button in the corner of the app.

1. Open **Agents**, then **Agent**. Your agent is listed.
2. Send a chat message. Open **Agents**, then **AG-UI Events**. Events are moving.
3. Open **Threads**. The list is unlocked (Intelligence is on), or locked with Enable Intelligence (Intelligence is off).

More detail: [Inspector](/angular/ag2/inspector).

    </Step>

</Steps>

## Next steps

- [Runtime and backend docs](backend/copilot-runtime): configure the server, secure requests, and deploy without leaving the selected Angular surface.
- [CopilotKit Intelligence](intelligence/overview): add durable threads, inspection, and cloud-hosted or self-hosted operations.
- [Angular task guides](guides/chat-ui): build chat UI, tools, generative UI, interrupts, shared state, threads, memory, attachments, and headless UI.
- [Angular feature examples](features): find runnable examples and canonical shared Angular source for each supported feature.
- [Angular API reference](/reference/angular): use components, signals, tools, context, and runtime services.
- [Production and lifecycle](/reference/angular/production-lifecycle): handle cleanup, errors, server rendering, hydration, zoneless Angular, and browser-only features.
