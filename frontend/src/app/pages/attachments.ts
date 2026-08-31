import { Component } from '@angular/core';

import { RouteHeader } from '../components/route-header';
import { Callout, Panel, SourceCode, TryIt } from '../components/ui';

@Component({
  selector: 'app-attachments-page',
  imports: [RouteHeader, Panel, Callout, TryIt, SourceCode],
  template: `
    <app-route-header path="/attachments" />

    <div class="space-y-6">
      <ui-try-it>
        <p class="mt-1 text-slate-700">
          Open the demo and add a file three ways: the picker, drag-and-drop
          onto the composer, and paste. Then send a message asking about it.
        </p>
        <p class="mt-2 text-slate-700">
          <strong>Pass:</strong> all three input paths accept an image or PDF, a
          file over 10 MiB is rejected, and a rejected upload logs its
          <code>reason</code> and <code>message</code> through
          <code>onUploadFailed</code> in the browser console.
          <strong>Fail:</strong> drag-and-drop or paste does nothing, or an
          oversized file is accepted.
        </p>
      </ui-try-it>

      <ui-panel heading="AttachmentsConfig">
        <p class="mb-3 text-sm text-slate-700">
          The built-in input supports the file picker, drag and drop, and paste
          from one config — there is nothing else to wire up.
        </p>
        <ui-source
          path="src/app/features/attachments/media-chat.component.ts"
        />
      </ui-panel>

      <ui-callout title="Without onUpload, files travel inline">
        Files are read as base64 and sent with the message. Supply
        <code>onUpload</code> to put large files in your own storage and return
        a URL instead. The selected model and backend must support each content
        type you allow.
      </ui-callout>

      <ui-callout tone="warn" title="Same caveat as the voice route">
        <code>accept</code> and <code>maxSize</code> are client affordances, not
        server-side security controls. Validate type, size, and content again
        wherever uploads are stored or processed.
      </ui-callout>
    </div>
  `,
})
export default class AttachmentsPage {}
