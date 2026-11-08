// HARNESS: demo host for the WebMCP page. The page's OrderSearchComponent (verbatim) plus a chat.
import { Component } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';
import { OrderSearchComponent } from './order-search.component';

@Component({
  selector: 'app-webmcp-demo',
  imports: [CopilotChat, OrderSearchComponent],
  template: `<app-order-search /><div style="height: 100vh"><copilot-chat /></div>`,
})
export class WebmcpDemo {}
