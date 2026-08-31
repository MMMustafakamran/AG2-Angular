import { Component } from '@angular/core';

import { RouteHeader } from '../components/route-header';
import { Callout, DocSample, Panel, SourceCode, TryIt } from '../components/ui';

@Component({
  selector: 'app-voice-page',
  imports: [RouteHeader, Panel, Callout, TryIt, SourceCode, DocSample],
  template: `
    <app-route-header path="/voice-multimodal" />

    <div class="space-y-6">
      <ui-try-it>
        <p class="mt-1 text-slate-700">
          Open the demo. Attach a PNG or a PDF with the paperclip, by dragging
          it onto the composer, or by pasting it. Then press the microphone.
        </p>
        <p class="mt-2 text-slate-700">
          <strong>Pass (attachments):</strong> the file is accepted and sent as
          a content part; a file over 10 MiB or of another type is rejected
          immediately by the picker.
          <strong>Pass (voice):</strong> the browser asks for microphone
          permission and records.
          <strong>Expected failure (voice):</strong> transcription then fails —
          this runtime has no transcription service configured, and the guide is
          explicit that a visible microphone does not make an unavailable
          transcription service succeed.
        </p>
      </ui-try-it>

      <ui-callout tone="warn" title="Voice needs two things this repo does not ship">
        Serve over HTTPS in production so browsers can grant microphone access,
        and configure transcription on the Runtime. This harness runs over plain
        <code>http://localhost</code> (which browsers treat as a secure context,
        so recording works) with no transcription service, so the capture half
        is testable and the transcription half is not.
      </ui-callout>

      <ui-panel heading="Configure attachments">
        <p class="mb-3 text-sm text-slate-700">
          The guide's <code>MULTIMODAL_ATTACHMENTS</code> config, bound exactly
          as its <code>media-chat.component.html</code> snippet shows. No option
          is required to display the microphone.
        </p>
        <ui-source path="src/app/features/media/voice-chat.component.ts" />
      </ui-panel>

      <ui-callout tone="warn" title="accept and maxSize are not security controls">
        They filter the file picker and give immediate client feedback. The
        guide requires validating file type, size, and content again wherever
        uploads are stored or processed.
      </ui-callout>

      <ui-panel heading="Doc samples not mounted here">
        <p class="mb-3 text-sm text-slate-700">
          Both remaining snippets are Showcase excerpts that reference
          identifiers the guide never defines.
        </p>

        <p class="mt-4 mb-2 text-sm font-semibold text-slate-900">
          1 · Voice tool renderers
        </p>
        <p class="mb-3 text-sm text-slate-700">
          Depends on <code>VOICE_WEATHER_TOOL_NAMES</code>,
          <code>VoiceWeatherArgs</code>, and <code>WeatherToolCard</code>. The
          equivalent live registration is on the
          <a
            href="/frontend-tools-generative-ui"
            class="text-blue-700 underline decoration-dotted"
            >Frontend tools</a
          >
          route.
        </p>
        <ui-doc-sample
          caption="Voice guide — Showcase excerpt"
          [code]="voiceRendererSample"
        />

        <p class="mt-6 mb-2 text-sm font-semibold text-slate-900">
          2 · Sending media programmatically
        </p>
        <p class="mb-3 text-sm text-slate-700">
          Depends on <code>SampleSpec</code> and
          <code>MediaAgentMessage</code>, neither of which the guide shows. The
          shape it builds is ordinary AG-UI content parts: a
          <code>text</code> part plus an <code>image</code> or
          <code>document</code> part, with the MIME type kept authoritative.
        </p>
        <ui-doc-sample
          caption="Voice guide — Showcase excerpt"
          [code]="multimodalMessageSample"
        />
      </ui-panel>
    </div>
  `,
})
export default class VoiceMultimodalPage {
  protected readonly voiceRendererSample = `// features/media/media-feature.component.ts
export const voiceWeatherRendererConfigs: readonly RenderToolCallConfig<VoiceWeatherArgs>[] =
  VOICE_WEATHER_TOOL_NAMES.map((name) => ({
    name,
    args: z.record(z.unknown()),
    component:
      WeatherToolCard as unknown as RenderToolCallConfig<VoiceWeatherArgs>["component"],
  }));`;

  protected readonly multimodalMessageSample = `// features/media/media-model.ts
export function createMultimodalMessage(
  spec: Pick<SampleSpec, "filename" | "mimeType" | "autoPrompt">,
  base64: string,
  size: number,
  id: string,
): MediaAgentMessage {
  return {
    id,
    role: "user",
    content: [
      { type: "text", text: spec.autoPrompt },
      {
        type: spec.mimeType === "application/pdf" ? "document" : "image",
        source: {
          type: "data",
          value: base64,
          mimeType: spec.mimeType,
        },
        metadata: { filename: spec.filename, size },
      },
    ],
  };
}`;
}
