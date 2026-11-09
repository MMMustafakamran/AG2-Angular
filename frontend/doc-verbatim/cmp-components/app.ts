// Doc: https://docs.copilotkit.ai/ag2/generative-ui/components (Angular tab), step 3 src/app/app.ts. Verbatim.
import { Component } from "@angular/core";
import { CopilotChat } from "@copilotkit/angular";

@Component({
  selector: "app-root",
  imports: [CopilotChat],
  template: `<copilot-chat />`,
})
export class App {}
