# Voice and multimodal input

> Add speech transcription, file attachments, and typed media content to an Angular chat.

`CopilotChat` includes a microphone control and an attachment composer. Voice
input is transcribed through Copilot Runtime and inserted into the composer as
text. Multimodal input sends image or document content parts with the user's
message.

## What is voice and multimodal input?

Voice input turns recorded speech into editable text before a message is sent.
Multimodal input attaches typed image or document content parts to that
message, so a compatible model can reason about more than text.

## Accept voice input

No component option is required to display the microphone. The browser asks
for microphone permission, records the audio, and sends it to the Runtime
transcription endpoint. The resulting text remains editable before the user
sends it.

Serve production applications over HTTPS so browsers can grant microphone
access. Your Runtime must also have transcription configured; a visible
microphone does not make an unavailable transcription service succeed.

Voice requests can call the same backend tools as typed requests. Register
renderers only for the exact tool names your backend exposes:

```typescript
// features/media/media-feature.component.ts
export const voiceWeatherRendererConfigs: readonly RenderToolCallConfig<VoiceWeatherArgs>[] =
  VOICE_WEATHER_TOOL_NAMES.map((name) => ({
    name,
    args: z.record(z.unknown()),
    component:
      WeatherToolCard as unknown as RenderToolCallConfig<VoiceWeatherArgs>["component"],
  }));
```

The renderer registration is optional. It changes how matching tool calls are
displayed, not how speech is captured or transcribed.

## Configure attachments

Define an `AttachmentsConfig` and bind it to the chat surface. The runnable
Showcase accepts images and PDFs up to 10 MiB:

```typescript
// features/media/media-feature.component.ts
const MULTIMODAL_ATTACHMENTS: AttachmentsConfig = {
  enabled: true,
  accept: "image/*,application/pdf",
  maxSize: 10 * 1024 * 1024,
};
```

```html title="media-chat.component.html"
<copilot-chat [attachments]="multimodalAttachments" />
```

The `accept` value filters the file picker and `maxSize` provides immediate
client feedback. They are not server-side security controls. Validate file
type, size, and content again wherever uploads are stored or processed. Use
the configuration's upload callbacks when files should go to object storage
instead of traveling inline with a message.

## Send media programmatically

For a bundled sample or custom uploader, add a user message whose `content`
contains normal AG-UI content parts. The Showcase constructs a text part plus
an image or document part:

```typescript
// features/media/media-model.ts
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
}
```

Add that message to the selected agent and run the agent. Keep the MIME type
authoritative: use an `image` part for images and a `document` part for PDFs
and other documents. The chosen model and backend converter must support each
MIME type you accept.

## Next steps

- [Voice input](/angular/ag2/features#voice)
- [Multimodal attachments](/angular/ag2/features#multimodal)
- [Chat UI configuration](/angular/ag2/guides/chat-ui)
