// voice & multimodal : accept voice input and configure attachments start
/**
 * "Configure attachments", verbatim: the guide's `MULTIMODAL_ATTACHMENTS`
 * config bound to the chat exactly as its `media-chat.component.html` snippet
 * shows. The microphone control needs no option — it is always present.
 * https://docs.copilotkit.ai/angular/ag2/guides/voice-multimodal
 */

import { Component } from '@angular/core';
import { CopilotChat, type AttachmentsConfig } from '@copilotkit/angular';

// voice & multimodal : configure attachments start
const MULTIMODAL_ATTACHMENTS: AttachmentsConfig = {
  enabled: true,
  accept: 'image/*,application/pdf',
  maxSize: 10 * 1024 * 1024,
};
// voice & multimodal : configure attachments end

@Component({
  selector: 'app-voice-chat',
  imports: [CopilotChat],
  template: `
    <div style="height: 100%">
      <copilot-chat [attachments]="multimodalAttachments" />
    </div>
  `,
})
export class VoiceChatComponent {
  protected readonly multimodalAttachments = MULTIMODAL_ATTACHMENTS;
}
// voice & multimodal : accept voice input and configure attachments end
